import asyncio
import json
import logging
import threading
import time
from typing import List, Dict, Any
from functools import partial
from helius_infrastructure import HeliusClient, Programs, SubscriptionType
from database import TactixDB
from config import WALLET_ADDRESS

logger = logging.getLogger("copy_trader")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(levelname)s:%(name)s:%(message)s'))
    logger.addHandler(ch)

class CopyTraderEngine:
    def __init__(self, helius_client: HeliusClient, db: TactixDB, socketio, execute_trade_func):
        self.helius = helius_client
        self.db = db
        self.socketio = socketio
        self.execute_trade = execute_trade_func
        self.active_targets: Dict[str, Dict] = {}
        self.current_ws = None
        self._running = False
        self._loop = None
        self._thread = None
        self._token_cache = {}

    def start(self):
        if self._thread:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        print("🚀 Copy Trader Engine Thread Started")

    def stop(self):
        self._running = False
        if self.current_ws and self._loop:
             asyncio.run_coroutine_threadsafe(self.current_ws.close(), self._loop)
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)

    def refresh(self):
        logger.info("🔄 Refreshing Copy Trader session...")
        if self.current_ws and self._loop and self.current_ws._running:
            asyncio.run_coroutine_threadsafe(self.current_ws.close(), self._loop)

    def _run_event_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self.main_loop())

    async def main_loop(self):
        while self._running:
            try:
                targets = self.db.get_all_targets()
                self.active_targets = {t['address']: t for t in targets if t['status'] == 'active'}
                
                async with self.helius.websocket() as ws:
                    self.current_ws = ws
                    run_task = asyncio.create_task(ws.run())
                    await asyncio.sleep(0.1)

                    if WALLET_ADDRESS and WALLET_ADDRESS != "Unknown":
                        logger.info(f"📡 Subscribing to USER wallet: {WALLET_ADDRESS[:8]}...")
                        await ws.subscribe_logs(
                            partial(self.handle_user_wallet_logs, WALLET_ADDRESS),
                            mentions=[WALLET_ADDRESS],
                            commitment="confirmed"
                        )

                    target_addresses = list(self.active_targets.keys())
                    if target_addresses:
                        logger.info(f"📡 Subscribing to logs for {len(target_addresses)} targets")
                        for address in target_addresses:
                            try:
                                await ws.subscribe_logs(
                                    partial(self.handle_transaction_logs, address),
                                    mentions=[address],
                                    commitment="confirmed"
                                )
                                logger.info(f"✅ Subscribed to target {address[:8]}...")
                            except Exception as e:
                                logger.error(f"Subscription failed for {address}: {e}")
                    
                    await run_task
            except Exception as e:
                logger.error(f"❌ Copy Trader Loop Error: {e}")
                await asyncio.sleep(5)
            finally:
                self.current_ws = None

    def resolve_token(self, mint: str):
        if mint == "So11111111111111111111111111111111111111112":
            return "SOL"
        if mint in self._token_cache:
            return self._token_cache[mint]
        known = self.db.get_known_tokens().get(mint)
        if known:
            self._token_cache[mint] = known['symbol']
            return known['symbol']
        try:
            asset = self.helius.das.get_asset(mint)
            if not asset: return f"{mint[:4]}..."
            token_info = asset.get('token_info', {})
            content = asset.get('content', {})
            metadata = content.get('metadata', {})
            symbol = token_info.get('symbol') or metadata.get('symbol')
            decimals = token_info.get('decimals') or 9
            if symbol:
                symbol = symbol.upper()
                self.db.save_token(mint, symbol, decimals)
                self._token_cache[mint] = symbol
                return symbol
            return f"{mint[:4]}..."
        except Exception as e:
            return f"{mint[:4]}..."

    def decode_transaction_changes(self, signature: str, wallet_address: str):
        for attempt in range(3):
            try:
                tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
                if not tx:
                    time.sleep(1)
                    continue
                meta = tx.get('meta')
                if not meta or meta.get('err'): return None
                message = tx.get('transaction', {}).get('message', {})
                account_keys = message.get('accountKeys', [])
                wallet_index = -1
                for i, acc in enumerate(account_keys):
                    pubkey = acc.get('pubkey') if isinstance(acc, dict) else acc
                    if pubkey == wallet_address:
                        wallet_index = i
                        break
                if wallet_index == -1: return None

                changes = {}
                pre_sol = meta['preBalances'][wallet_index] / 1e9
                post_sol = meta['postBalances'][wallet_index] / 1e9
                sol_diff = post_sol - pre_sol
                if wallet_index == 0: sol_diff += (meta['fee'] / 1e9)
                if abs(sol_diff) > 0.0001:
                    changes["So11111111111111111111111111111111111111112"] = sol_diff

                pre_token = meta.get('preTokenBalances', [])
                post_token = meta.get('postTokenBalances', [])
                for bal in pre_token:
                    if bal.get('owner') == wallet_address:
                        mint = bal['mint']
                        changes[mint] = changes.get(mint, 0) - float(bal['uiTokenAmount'].get('uiAmount') or 0)
                for bal in post_token:
                    if bal.get('owner') == wallet_address:
                        mint = bal['mint']
                        changes[mint] = changes.get(mint, 0) + float(bal['uiTokenAmount'].get('uiAmount') or 0)
                return changes
            except:
                time.sleep(1)
        return None

    async def handle_user_wallet_logs(self, wallet_address: str, data: Dict[str, Any]):
        val = data.get('value', {})
        signature = val.get('signature')
        if not signature or val.get('err'): return
        await asyncio.sleep(1)
        changes = self.decode_transaction_changes(signature, wallet_address)
        if not changes: return
        for mint, diff in changes.items():
            if diff > 0.000001:
                symbol = self.resolve_token(mint)
                logger.info(f"💰 Funds Received: {diff} {symbol}")
                self.socketio.emit('notification', {
                    'title': 'Funds Received',
                    'message': f"Received {diff:.4f} {symbol}",
                    'type': 'success'
                }, namespace='/bots')
                from services.portfolio import broadcast_balance
                broadcast_balance()

    async def handle_transaction_logs(self, wallet_address: str, data: Dict[str, Any]):
        val = data.get('value', {})
        signature = val.get('signature')
        if not signature or val.get('err'): return
        logs = val.get('logs', [])
        programs = [l.split(' ')[1] for l in logs if 'invoke [' in l]
        target_programs = [
            Programs.RAYDIUM_V4, Programs.RAYDIUM_CP, Programs.RAYDIUM_CLMM,
            Programs.JUPITER_V6, Programs.ORCA_WHIRLPOOL, Programs.METEORA_DLMM,
            Programs.PUMP_FUN, Programs.PHOENIX, Programs.LIFINITY
        ]
        is_swap = any(p in programs for p in target_programs)
        if is_swap:
            await asyncio.sleep(1)
            changes = self.decode_transaction_changes(signature, wallet_address)
            if not changes: return
            sent_token = None
            received_token = None
            for mint, diff in sorted(changes.items(), key=lambda x: abs(x[1]), reverse=True):
                if abs(diff) < 1e-9: continue
                symbol = self.resolve_token(mint)
                if diff < 0 and not sent_token:
                    sent_token = {'mint': mint, 'symbol': symbol, 'amount': abs(diff)}
                elif diff > 0 and not received_token:
                    received_token = {'mint': mint, 'symbol': symbol, 'amount': abs(diff)}
            if sent_token and received_token:
                signal_data = {
                    'signature': signature,
                    'wallet': wallet_address,
                    'timestamp': time.time(),
                    'type': 'Swap Detected',
                    'sent': sent_token,
                    'received': received_token
                }
                self.db.save_signal(signal_data)
                self.socketio.emit('signal_detected', signal_data, namespace='/copytrade')
                logger.info(f"✅ Decoded Target Swap: {sent_token['amount']} {sent_token['symbol']} -> {received_token['amount']} {received_token['symbol']}")
