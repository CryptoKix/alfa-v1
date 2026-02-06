import asyncio
import json
import websockets
import aiohttp
import struct
import base64
import os
import time
from dotenv import load_dotenv

from database import TactixDB

# Load API Keys from .env
load_dotenv()

db = TactixDB(pool_size=3)

# RPC Provider — 100% Shyft with multi-location failover
SHYFT_API_KEY = os.getenv("SHYFT_API_KEY")
# HELIUS_API_KEY = os.getenv("HELIUS_API_KEY")  # DISABLED — all traffic via Shyft

if SHYFT_API_KEY:
    SOLANA_RPC = f"https://rpc.ams.shyft.to?api_key={SHYFT_API_KEY}"
    SOLANA_WS = f"wss://rpc.ams.shyft.to?api_key={SHYFT_API_KEY}"
    print("Price Server: Using Shyft RPC (AMS primary)")
else:
    print("ERROR: No RPC provider configured (set SHYFT_API_KEY)")
    exit(1)

# Endpoint failover manager (independent instance for this process)
try:
    import config as _ps_config
    from endpoint_manager import get_endpoint_manager
    _endpoint_mgr = get_endpoint_manager(_ps_config)
    _endpoint_mgr.start()
    print("Price Server: EndpointManager started")
except Exception as _e:
    print(f"Price Server: EndpointManager unavailable ({_e}), using static endpoints")
    _endpoint_mgr = None

# DAS API — now via Shyft (supports Metaplex DAS on same RPC endpoint)
DAS_RPC = SOLANA_RPC
FLASK_WEBHOOK_URL = "http://localhost:5001/api/webhook/price"

def get_tracked_mints():
    """Fetch discovered tokens from DB for tracking."""
    known = db.get_known_tokens()
    return {m: i['symbol'] for m, i in known.items()}

# Pyth Hermes API endpoint (real-time prices)
PYTH_HERMES_API = "https://hermes.pyth.network/api/latest_price_feeds"

# Pyth price feed IDs (from https://pyth.network/price-feeds)
PYTH_PRICE_IDS = {
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d": {
        "symbol": "SOL",
        "mint": "So11111111111111111111111111111111111111112"
    },
    "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a": {
        "symbol": "USDC",
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    },
    "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b": {
        "symbol": "USDT",
        "mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
    },
}

def parse_pyth_price(data_b64, symbol=""):
    """
    Parse Pyth price from base64-encoded account data.
    Different Pyth feeds store price at different offsets.
    """
    try:
        data = base64.b64decode(data_b64)
        if len(data) < 100:
            return None

        # Different assets have price at different offsets
        if symbol == "SOL":
            # SOL: price at offset 8, exponent ~-11
            price_raw = struct.unpack_from('<q', data, 8)[0]
            price = price_raw * 1e-11
            if 50 < price < 500:
                return price

        elif symbol in ["USDC", "USDT"]:
            # Stablecoins: try offsets 48 and 184 with exponent -8
            for offset in [48, 184, 8]:
                price_raw = struct.unpack_from('<q', data, offset)[0]
                price = price_raw * 1e-8
                if 0.95 < price < 1.05:
                    return price

        # Fallback: scan common offsets and exponents
        for offset in [8, 48, 184, 208]:
            if offset + 8 > len(data):
                continue
            price_raw = struct.unpack_from('<q', data, offset)[0]
            for exp in [-8, -9, -10, -11]:
                price = price_raw * (10 ** exp)
                # Return if price is in reasonable range for any asset
                if 0.0001 < price < 100000:
                    return price

        return None
    except Exception as e:
        return None

# Local WebSocket Clients (frontend connections)
CLIENTS = set()

# Current prices cache
CURRENT_PRICES = {}

async def broadcast_price(mint, symbol, price, session):
    """Broadcast a price update to all clients and Flask webhook."""
    if price is None or price <= 0:
        return

    # DEBUG LOG
    if symbol == "SOL":
        print(f"[DEBUG] Broadcasting SOL price: {price}")

    CURRENT_PRICES[mint] = price

    payload = {
        "type": "price_update",
        "mint": mint,
        "symbol": symbol,
        "price": price,
        "timestamp": time.time()
    }
    message = json.dumps(payload)

    # Broadcast to WebSocket clients
    if CLIENTS:
        disconnected = set()
        for client in CLIENTS:
            try:
                await client.send(message)
            except:
                disconnected.add(client)
        for client in disconnected:
            CLIENTS.discard(client)

    # Update Flask webhook (fire and forget)
    try:
        print(f"[DEBUG] Calling Flask webhook for {symbol} @ {price}")
        async with session.post(FLASK_WEBHOOK_URL, json=payload, timeout=0.5) as resp:
            if resp.status != 200:
                print(f"[ERROR] Webhook status {resp.status} for {symbol}")
    except Exception as e:
        if symbol == "SOL":
            print(f"[ERROR] Webhook failure for SOL: {e}")

async def pyth_price_poller(session):
    """
    Poll Pyth Hermes API for real-time prices.
    Updates every 500ms for accurate, live prices.
    """
    print("Starting Pyth Hermes price poller (500ms intervals)...")

    while True:
        try:
            # Re-fetch tracked mints to detect new tokens
            tracked_symbols = get_tracked_mints()
            tracked_mints = list(tracked_symbols.keys())
            
            # Filter PYTH_PRICE_IDS to only those we are tracking
            current_pyth_ids = {pid: info for pid, info in PYTH_PRICE_IDS.items() if info['mint'] in tracked_mints}
            
            if not current_pyth_ids:
                print(f"[DEBUG] No tracked Pyth IDs. Tracked mints: {tracked_mints}")
            
            if current_pyth_ids:
                price_ids = list(current_pyth_ids.keys())
                query_params = "&".join([f"ids[]={pid}" for pid in price_ids])
                url = f"{PYTH_HERMES_API}?{query_params}"

                async with session.get(url, timeout=3) as response:
                    if response.status == 200:
                        feeds = await response.json()

                        for feed in feeds:
                            price_id = feed.get("id")
                            if price_id in current_pyth_ids:
                                info = current_pyth_ids[price_id]
                                price_data = feed.get("price", {})

                                # Calculate price from raw value and exponent
                                raw_price = int(price_data.get("price", 0))
                                expo = int(price_data.get("expo", 0))
                                price = raw_price * (10 ** expo)

                                if price > 0:
                                    await broadcast_price(info["mint"], info["symbol"], price, session)

        except asyncio.TimeoutError:
            pass
        except Exception as e:
            print(f"Pyth poll error: {e}")

        # Poll every 500ms for near real-time prices
        await asyncio.sleep(0.5)

async def fetch_other_prices(session):
    """Fetch prices for tokens not on Pyth (like JUP) using Shyft REST API."""
    tracked_mints_map = get_tracked_mints()
    pyth_mints = [info["mint"] for info in PYTH_PRICE_IDS.values()]
    other_mints = [mint for mint in tracked_mints_map.keys() if mint not in pyth_mints]

    if not other_mints:
        return

    # Use Shyft REST token info API for metadata (DAS not supported on Shyft standard RPC)
    rpc_url = (_endpoint_mgr.get_rpc_url() if _endpoint_mgr else DAS_RPC)
    for mint in other_mints:
        try:
            async with session.get(
                "https://api.shyft.to/sol/v1/token/get_info",
                params={"network": "mainnet-beta", "token_address": mint},
                headers={"x-api-key": SHYFT_API_KEY},
                timeout=5
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("success") and data.get("result"):
                        # Shyft REST doesn't include price — skip for now
                        # Price for non-Pyth tokens comes from Jupiter/Birdeye price feeds
                        pass
        except Exception:
            pass

    # Helius DAS getAssetBatch — DISABLED (Shyft doesn't support DAS RPC methods)
    # payload = {
    #     "jsonrpc": "2.0", "id": "other-prices",
    #     "method": "getAssetBatch",
    #     "params": {"ids": other_mints}
    # }
    # try:
    #     async with session.post(das_url, json=payload, timeout=5) as response:
    #         ...
    # except Exception as e:
    #     print(f"DAS fetch error: {e}")

async def other_prices_loop(session):
    """Periodically fetch prices for non-Pyth tokens."""
    while True:
        try:
            await fetch_other_prices(session)
        except Exception as e:
            print(f"Other prices loop error: {e}")
        
        # Check if we have active GRID bots to determine polling speed
        try:
            active_bots = db.get_all_bots()
            has_active_grid = any(b['status'] == 'active' and b['type'] == 'GRID' for b in active_bots)
            delay = 2 if has_active_grid else 10 # High-frequency polling for grid tokens
        except:
            delay = 10
            
        await asyncio.sleep(delay)

async def heartbeat_loop(session):
    """Send periodic updates even if price hasn't changed (for UI liveness)."""
    while True:
        await asyncio.sleep(2)
        tracked = get_tracked_mints()
        for mint, price in CURRENT_PRICES.items():
            symbol = tracked.get(mint, "???")
            await broadcast_price(mint, symbol, price, session)

async def ws_handler(websocket, path):
    """Handle incoming WebSocket connections from frontend."""
    CLIENTS.add(websocket)
    print(f"Client connected. Total: {len(CLIENTS)}")

    # Send current prices immediately on connect
    tracked = get_tracked_mints()
    for mint, price in CURRENT_PRICES.items():
        symbol = tracked.get(mint, "???")
        payload = {
            "type": "price_update",
            "mint": mint,
            "symbol": symbol,
            "price": price,
            "timestamp": time.time()
        }
        try:
            await websocket.send(json.dumps(payload))
        except:
            pass

    try:
        async for message in websocket:
            pass  # We don't expect messages from clients
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CLIENTS.discard(websocket)
        print(f"Client disconnected. Total: {len(CLIENTS)}")

async def main():
    print("=" * 50)
    print("Pyth Oracle Price Server")
    print("=" * 50)
    print("WebSocket: ws://0.0.0.0:8765")
    print("Price sources:")
    print("  - SOL/USDC/USDT: Pyth Oracle (500ms polling)")
    print("  - JUP/others: Helius DAS (10s intervals)")
    print("=" * 50)

    async with aiohttp.ClientSession() as session:
        # Start WebSocket server
        server = await websockets.serve(ws_handler, "0.0.0.0", 8765)

        # Run all tasks concurrently
        await asyncio.gather(
            pyth_price_poller(session),       # Pyth oracle prices (500ms)
            other_prices_loop(session),       # DAS prices for other tokens
            heartbeat_loop(session),          # Keep UI alive
        )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nPrice Server Stopped.")