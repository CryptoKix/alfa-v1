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

last_known_balances = {}

def broadcast_balance():
    global last_known_balances
    try:
        holdings = get_token_accounts()
        known = get_known_tokens()
        wallet_alias = db.get_wallet_alias(WALLET_ADDRESS) or (WALLET_ADDRESS[:4] + "..." + WALLET_ADDRESS[-4:])

        sol_res = solana_client.get_balance(Pubkey.from_string(WALLET_ADDRESS))
        sol_balance = sol_res.value / 1e9
        
        if "SOL" in last_known_balances:
            if sol_balance > last_known_balances["SOL"] + 0.0001:
                diff = sol_balance - last_known_balances["SOL"]
                socketio.emit('notification', {
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
                    socketio.emit('notification', {
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
            with db._get_connection() as conn:
                last_snap = conn.execute("SELECT timestamp FROM snapshots ORDER BY timestamp DESC LIMIT 1").fetchone()
                if not last_snap or (time.time() - datetime.strptime(last_snap[0].split('.')[0], '%Y-%m-%d %H:%M:%S').timestamp()) > 3600:
                    db.record_snapshot(total_usd, WALLET_ADDRESS, enriched)
        except: pass

        total_usd_24h_ago = total_usd
        holdings_24h_ago = []
        try:
            with db._get_connection() as conn:
                snap_row = conn.execute("SELECT total_value_usd, holdings_json FROM snapshots WHERE timestamp <= datetime('now', '-24 hours') ORDER BY timestamp DESC LIMIT 1").fetchone()
                if snap_row:
                    total_usd_24h_ago = snap_row[0] or total_usd
                    holdings_24h_ago = json.loads(snap_row[1] or "[]")
        except: pass

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
    while True:
        try:
            with app.app_context():
                broadcast_balance()
        except: pass
        time.sleep(10)
