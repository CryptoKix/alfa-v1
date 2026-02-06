#!/usr/bin/env python3
"""Portfolio tracking and balance broadcasting service."""
import time
import json
import logging
from datetime import datetime
from solders.pubkey import Pubkey

from config import WALLET_ADDRESS, SOLANA_RPC
from endpoint_manager import get_endpoint_manager
import sio_bridge
from extensions import db, solana_client, price_cache, price_cache_lock
from services.tokens import get_known_tokens, get_token_accounts

logger = logging.getLogger("portfolio")

# Fallback public RPC for when Helius is rate limited

last_known_balances = {}

# gRPC stream state
_stream_manager = None
_grpc_balance_updates = 0
_last_grpc_update = 0.0


def set_stream_manager(stream_manager):
    """Register gRPC account subscription for wallet balance changes.

    When active, SOL balance changes are detected in real-time via Geyser
    account subscription. The 30s polling loop continues for token balances
    and reconciliation but triggers an immediate broadcast on gRPC notification.
    """
    global _stream_manager
    _stream_manager = stream_manager

    if WALLET_ADDRESS and WALLET_ADDRESS != "Unknown":
        stream_manager.subscribe_accounts(
            'portfolio',
            [WALLET_ADDRESS],
            _on_balance_change
        )
        logger.info(f"[Portfolio] Registered gRPC account subscription for {WALLET_ADDRESS[:8]}...")


def _on_balance_change(pubkey: str, lamports: int, data: bytes, slot: int):
    """Handle real-time SOL balance change from gRPC Geyser stream."""
    global _grpc_balance_updates, _last_grpc_update, last_known_balances

    _grpc_balance_updates += 1
    _last_grpc_update = time.time()

    new_sol = lamports / 1e9
    old_sol = last_known_balances.get("SOL", 0.0)

    if abs(new_sol - old_sol) > 0.0001:
        last_known_balances["SOL"] = new_sol

        if old_sol > 0 and new_sol > old_sol + 0.0001:
            diff = new_sol - old_sol
            try:
                sio_bridge.emit('notification', {
                    'title': 'Funds Received',
                    'message': f"Received {diff:.4f} SOL (via gRPC)",
                    'type': 'success'
                }, namespace='/bots')
            except Exception:
                pass

        logger.debug(f"[Portfolio] gRPC: SOL balance updated {old_sol:.4f} -> {new_sol:.4f}")

def get_cached_balance(mint):
    """Safe accessor for last known balances."""
    return last_known_balances.get(mint, 0.0)

def broadcast_balance():
    global last_known_balances
    try:
        holdings = get_token_accounts(use_fallback=True)
        known = get_known_tokens()
        wallet_alias = db.get_wallet_alias(WALLET_ADDRESS) or (WALLET_ADDRESS[:4] + "..." + WALLET_ADDRESS[-4:])

        # Try primary RPC, fallback via endpoint manager
        sol_balance = None
        import requests
        try:
            sol_res = solana_client.get_balance(Pubkey.from_string(WALLET_ADDRESS))
            sol_balance = sol_res.value / 1e9
        except Exception as e:
            logger.warning(f"SOL balance via solana_client failed ({type(e).__name__}), using endpoint manager")
            try:
                rpc_url = get_endpoint_manager().get_rpc_url() or SOLANA_RPC
                res = requests.post(rpc_url, json={
                    "jsonrpc": "2.0", "id": 1,
                    "method": "getBalance",
                    "params": [WALLET_ADDRESS]
                }, timeout=10).json()
                sol_balance = res.get("result", {}).get("value", 0) / 1e9
            except Exception as e2:
                logger.error(f"Fallback RPC SOL balance also failed: {e2}")

        if sol_balance is None:
            sol_balance = 0.0
        
        if "SOL" in last_known_balances:
            if sol_balance > last_known_balances["SOL"] + 0.0001:
                diff = sol_balance - last_known_balances["SOL"]
                sio_bridge.emit('notification', {
                    'title': 'Funds Received',
                    'message': f"Received {diff:.4f} SOL",
                    'type': 'success'
                }, namespace='/bots')
        last_known_balances["SOL"] = sol_balance

        total_usd = 0.0
        enriched = []

        with price_cache_lock:
            sol_price = price_cache.get("So11111111111111111111111111111111111111112", (0.0, 0))[0]
        
        sol_val = sol_balance * sol_price
        total_usd += sol_val
        enriched.append({
            "mint": "So11111111111111111111111111111111111111112",
            "symbol": "SOL",
            "balance": sol_balance,
            "price": sol_price,
            "value_usd": sol_val,
            "logo_uri": known.get("So11111111111111111111111111111111111111112", {}).get("logo_uri")
        })

        for h in holdings:
            mint = h['mint']
            balance = h['balance']
            token_meta = known.get(mint, {})
            symbol = token_meta.get("symbol", f"{mint[:4]}...")
            
            if mint in last_known_balances:
                if balance > last_known_balances[mint] + 0.000001:
                    diff = balance - last_known_balances[mint]
                    sio_bridge.emit('notification', {
                        'title': 'Funds Received',
                        'message': f"Received {diff:.4f} {symbol}",
                        'type': 'success'
                    }, namespace='/bots')
            last_known_balances[mint] = balance

            with price_cache_lock:
                price = price_cache.get(mint, (0.0, 0))[0]
            val = balance * price
            total_usd += val
            enriched.append({
                "mint": mint, "symbol": symbol, "balance": balance,
                "price": price, "value_usd": val, "logo_uri": token_meta.get("logo_uri")
            })

        try:
            last_ts = db.get_last_snapshot_timestamp()
            if not last_ts or (time.time() - last_ts.timestamp()) > 3600:
                db.record_snapshot(total_usd, WALLET_ADDRESS, enriched)
        except: pass

        total_usd_24h_ago = total_usd
        holdings_24h_ago = []
        try:
            snap_row = db.get_snapshot_24h_ago()
            if snap_row:
                total_usd_24h_ago = snap_row['total_value_usd'] or total_usd
                holdings_24h_ago = json.loads(snap_row['holdings_json'] or "[]")
        except: pass

        sio_bridge.emit('balance_update', {
            'holdings': enriched,
            'holdings_24h_ago': holdings_24h_ago,
            'total_usd': float(total_usd),
            'total_usd_24h_ago': float(total_usd_24h_ago),
            'wallet': WALLET_ADDRESS,
            'wallet_alias': wallet_alias,
            'timestamp': time.time()
        }, namespace='/portfolio')

    except Exception as e:
        logger.error(f"Broadcast Balance Error: {e}")

class PortfolioService:
    """Thin wrapper exposing balance_poller + gRPC wiring as a TactixService."""

    def __init__(self):
        self._thread = None
        self._running = False

    def set_stream_manager(self, sm):
        set_stream_manager(sm)

    def start(self):
        if self._running:
            return
        self._running = True
        import threading
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def is_running(self):
        return self._running and self._thread is not None and self._thread.is_alive()

    def _run(self):
        balance_poller(self._is_running)

    def _is_running(self):
        return self._running


def balance_poller(running_check=None):
    """Poll balances periodically. Runs at 5-minute intervals when gRPC is
    active (for token balance reconciliation), 30s otherwise."""
    GRPC_RECONCILE_INTERVAL = 300  # 5 minutes when gRPC handles SOL changes
    POLL_INTERVAL = 30

    while running_check() if running_check else True:
        try:
            broadcast_balance()
        except:
            pass

        if _stream_manager and _grpc_balance_updates > 0:
            time.sleep(GRPC_RECONCILE_INTERVAL)
        else:
            time.sleep(POLL_INTERVAL)
