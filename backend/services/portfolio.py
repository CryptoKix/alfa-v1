#!/usr/bin/env python3
"""Portfolio tracking and balance broadcasting service."""
import time
import json
from datetime import datetime
from flask import current_app
from solders.pubkey import Pubkey

from config import WALLET_ADDRESS
from extensions import db, solana_client, socketio, price_cache, price_cache_lock
from services.tokens import get_known_tokens, get_token_accounts


def broadcast_balance():
    """Broadcast current wallet balance to all connected clients."""
    print("DEBUG: Entered broadcast_balance")
    try:
        holdings = get_token_accounts()
        known = get_known_tokens()

        # Get wallet alias
        wallet_alias = db.get_wallet_alias(WALLET_ADDRESS) or (WALLET_ADDRESS[:4] + "..." + WALLET_ADDRESS[-4:])

        # Fetch Native SOL Balance
        sol_res = solana_client.get_balance(Pubkey.from_string(WALLET_ADDRESS))
        sol_balance = sol_res.value / 1e9
        current_app.logger.info(f"SOL Balance: {sol_balance}")

        total_usd = 0.0
        enriched = []

        # Add SOL Entry
        with price_cache_lock:
            cache_size = len(price_cache)
            sol_price_info = price_cache.get("So11111111111111111111111111111111111111112", (0.0, 0))
        
        current_app.logger.info(f"Price Cache Size: {cache_size}")
        sol_price = sol_price_info[0]
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

        # Add SPL Tokens
        for h in holdings:
            mint = h['mint']
            balance = h['balance']
            token_meta = known.get(mint, {})
            symbol = token_meta.get("symbol", f"{mint[:4]}...")
            logo_uri = token_meta.get("logo_uri")

            # Get price from cache
            with price_cache_lock:
                price_info = price_cache.get(mint, (0.0, 0))
            price = price_info[0]

            val = balance * price
            total_usd += val

            enriched.append({
                "mint": mint,
                "symbol": symbol,
                "balance": balance,
                "price": price,
                "value_usd": val,
                "logo_uri": logo_uri
            })

        # Record snapshot if needed (once per hour)
        try:
            with db._get_connection() as conn:
                last_snap = conn.execute("SELECT timestamp FROM snapshots ORDER BY timestamp DESC LIMIT 1").fetchone()
                needs_snap = True
                if last_snap:
                    try:
                        # Handle potential fractional seconds from SQLite
                        ts_str = last_snap[0].split('.')[0]
                        last_ts = datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S').timestamp()
                        if (time.time() - last_ts) < 3600:
                            needs_snap = False
                    except:
                        pass
                
                if needs_snap:
                    db.record_snapshot(total_usd, WALLET_ADDRESS, enriched)
        except Exception as e:
            current_app.logger.error(f"Snapshot Error: {e}")

        # Fetch 24h baseline for PnL
        total_usd_24h_ago = total_usd
        holdings_24h_ago = []
        try:
            with db._get_connection() as conn:
                snap_row = conn.execute(
                    "SELECT total_value_usd, holdings_json FROM snapshots WHERE timestamp <= datetime('now', '-24 hours') ORDER BY timestamp DESC LIMIT 1"
                ).fetchone()
                if snap_row:
                    total_usd_24h_ago = snap_row[0] or total_usd
                    holdings_24h_ago = json.loads(snap_row[1] or "[]")
        except Exception as e:
            current_app.logger.error(f"PnL Fetch Error: {e}")

        current_app.logger.info(f"Broadcasting Portfolio: {len(enriched)} assets, ${total_usd:.2f}")
        
        socketio.emit('balance_update', {
            'holdings': enriched,
            'holdings_24h_ago': holdings_24h_ago,
            'total_usd': float(total_usd),
            'total_usd_24h_ago': float(total_usd_24h_ago),
            'wallet': WALLET_ADDRESS,
            'wallet_alias': wallet_alias,
            'timestamp': time.time()
        }, namespace='/portfolio')

    except Exception as e:
        current_app.logger.error(f"Broadcast Balance Error: {e}")


def balance_poller(app):
    """Background thread to update balance every 30s.

    Args:
        app: Flask application instance for context
    """
    app.logger.info("Balance Poller Started")
    print("DEBUG: Balance Poller Thread Started")
    while True:
        try:
            with app.app_context():
                broadcast_balance()
        except Exception as e:
            app.logger.error(f"Poller Error: {e}")
        time.sleep(30)
