import asyncio
import json
import logging
import threading
import time
import re
from typing import List, Dict, Any
from functools import partial
from helius_infrastructure import HeliusClient, Programs, SubscriptionType
from database import TactixDB
from config import WALLET_ADDRESS

MAJOR_TOKENS = ['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN']

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
        if self._thread: return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        print("🚀 Copy Trader Engine Thread Started")

    def stop(self):
        self._running = False
        if self.current_ws and self._loop:
             asyncio.run_coroutine_threadsafe(self.current_ws.close(), self._loop)
        if self._loop: self._loop.call_soon_threadsafe(self._loop.stop)

    def refresh(self):
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
        if mint == "So11111111111111111111111111111111111111112": return "SOL"
        if mint in self._token_cache: return self._token_cache[mint]
        known = self.db.get_known_tokens().get(mint)
        if known:
            self._token_cache[mint] = known['symbol']
            return known['symbol']
        try:
            asset = self.helius.das.get_asset(mint)
            if not asset: return f"{mint[:4]}..."
            symbol = (asset.get('token_info', {}).get('symbol') or asset.get('content', {}).get('metadata', {}).get('symbol'))
            decimals = (asset.get('token_info', {}).get('decimals') or 9)
            if symbol:
                symbol = symbol.upper()
                self.db.save_token(mint, symbol, decimals)
                self._token_cache[mint] = symbol
                return symbol
            return f"{mint[:4]}..."
        except: return f"{mint[:4]}..."

    def decode_wallet_changes(self, tx, wallet_address: str):
        """Analyze transaction for balance changes specifically for the wallet_address."""
        if not tx or not tx.get('meta'): return None
        meta = tx['meta']
        
        account_keys = [k.get('pubkey') if isinstance(k, dict) else k for k in tx.get('transaction', {}).get('message', {}).get('accountKeys', [])]
        
        wallet_index = -1
        try: wallet_index = account_keys.index(wallet_address)
        except: pass

        net_changes = {}

        # 1. SOL Change
        if wallet_index != -1:
            pre_sol = meta['preBalances'][wallet_index] / 1e9
            post_sol = meta['postBalances'][wallet_index] / 1e9
            sol_diff = post_sol - pre_sol
            if wallet_index == 0: sol_diff += (meta['fee'] / 1e9)
            if abs(sol_diff) > 0.0001:
                net_changes["So11111111111111111111111111111111111111112"] = sol_diff

        # 2. Token Changes
        for bal in meta.get('preTokenBalances', []):
            owner = bal.get('owner') or (account_keys[bal['accountIndex']] if bal['accountIndex'] < len(account_keys) else None)
            if owner == wallet_address:
                mint = bal['mint']
                net_changes[mint] = net_changes.get(mint, 0) - float(bal['uiTokenAmount'].get('uiAmount') or 0)
        
        for bal in meta.get('postTokenBalances', []):
            owner = bal.get('owner') or (account_keys[bal['accountIndex']] if bal['accountIndex'] < len(account_keys) else None)
            if owner == wallet_address:
                mint = bal['mint']
                net_changes[mint] = net_changes.get(mint, 0) + float(bal['uiTokenAmount'].get('uiAmount') or 0)
        
        return net_changes

    async def handle_user_wallet_logs(self, wallet_address: str, data: Dict[str, Any]):
        val = data.get('value', {})
        signature = val.get('signature')
        if not signature or val.get('err'): return
        asyncio.create_task(self.process_user_transfer(signature, wallet_address))

    async def process_user_transfer(self, signature, wallet_address):
        for _ in range(10): # Smart Polling
            tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
            if tx:
                changes = self.decode_wallet_changes(tx, wallet_address)
                if changes:
                    for mint, diff in changes.items():
                        if diff > 0.000001:
                            symbol = self.resolve_token(mint)
                            self.socketio.emit('notification', {'title': 'Funds Received', 'message': f"Received {diff:.4f} {symbol}", 'type': 'success'}, namespace='/bots')
                            from services.portfolio import broadcast_balance
                            broadcast_balance()
                    return
            await asyncio.sleep(0.3)


    def decode_swap(self, signature, wallet_address):
        """Helper for API to decode a specific transaction."""
        try:
            tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
            if not tx: return None
            changes = self.decode_wallet_changes(tx, wallet_address)
            if not changes: return None
            
            significant = {m: d for m, d in changes.items() if abs(d) > 1e-9}
            outflows = sorted([(m, d) for m, d in significant.items() if d < 0], key=lambda x: abs(x[1]), reverse=True)
            inflows = sorted([(m, d) for m, d in significant.items() if d > 0], key=lambda x: x[1], reverse=True)
            
            if outflows and inflows:
                return {
                    'sent': {'mint': outflows[0][0], 'symbol': self.resolve_token(outflows[0][0]), 'amount': abs(outflows[0][1])},
                    'received': {'mint': inflows[0][0], 'symbol': self.resolve_token(inflows[0][0]), 'amount': inflows[0][1]}
                }
        except: pass
        return None

    async def handle_transaction_logs(self, wallet_address: str, data: Dict[str, Any]):
        val = data.get('value', {})
        signature = val.get('signature')
        if not signature or val.get('err'): return
        
        logs = val.get('logs', [])
        programs = [l.split(' ')[1] for l in logs if 'invoke [' in l]
        target_programs = [Programs.RAYDIUM_V4, Programs.RAYDIUM_CP, Programs.RAYDIUM_CLMM, Programs.JUPITER_V6, Programs.ORCA_WHIRLPOOL, Programs.METEORA_DLMM, Programs.PUMP_FUN, Programs.PHOENIX, Programs.LIFINITY]
        if not any(p in programs for p in target_programs): return

        asyncio.create_task(self.process_whale_swap(signature, wallet_address))

    async def process_whale_swap(self, signature, wallet_address):
        for _ in range(10): # Smart Polling
            tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
            if tx:
                changes = self.decode_wallet_changes(tx, wallet_address)
                if changes:
                    significant = {m: d for m, d in changes.items() if abs(d) > 1e-9}
                    outflows = sorted([(m, d) for m, d in significant.items() if d < 0], key=lambda x: abs(x[1]), reverse=True)
                    inflows = sorted([(m, d) for m, d in significant.items() if d > 0], key=lambda x: x[1], reverse=True)
                    
                    if outflows and inflows:
                        sent_token = {'mint': outflows[0][0], 'symbol': self.resolve_token(outflows[0][0]), 'amount': abs(outflows[0][1])}
                        recv_token = {'mint': inflows[0][0], 'symbol': self.resolve_token(inflows[0][0]), 'amount': inflows[0][1]}
                        
                        target = self.active_targets.get(wallet_address, {})
                        alias = target.get('alias', wallet_address[:8])
                        
                        signal_data = {
                            'signature': signature, 'wallet': wallet_address, 'alias': alias,
                            'timestamp': time.time(), 'type': 'Swap Detected',
                            'sent': sent_token, 'received': recv_token
                        }

                        self.db.save_signal(signature, wallet_address, 'Swap Detected', signal_data)
                        self.socketio.emit('signal_detected', signal_data, namespace='/copytrade')
                        logger.info(f"✅ Decoded {alias} Swap: {sent_token['amount']} {sent_token['symbol']} -> {recv_token['amount']} {recv_token['symbol']}")
                        
                        # --- Auto-Execution Logic ---
                        if target.get('status') == 'active' and target.get('config_json'):
                            config = json.loads(target['config_json'])
                            if config.get('auto_execute'):
                                try:
                                    # --- Risk Profile Determination ---
                                    is_pump = recv_token['mint'].endswith('pump') or sent_token['mint'].endswith('pump')
                                    is_major = recv_token['mint'] in MAJOR_TOKENS and sent_token['mint'] in MAJOR_TOKENS
                                    
                                    if is_pump:
                                        scale = float(config.get('pump_scale', 0.05))
                                        max_sol = float(config.get('pump_max', 0.2))
                                        profile_name = "Pump.fun"
                                    elif is_major:
                                        scale = float(config.get('major_scale', 0.5))
                                        max_sol = float(config.get('major_max', 5.0))
                                        profile_name = "Major"
                                    else:
                                        scale = float(config.get('scale_factor', 0.1))
                                        max_sol = float(config.get('max_per_trade', 1.0))
                                        profile_name = "Standard"

                                    is_buy = sent_token['mint'] == "So11111111111111111111111111111111111111112"
                                    
                                    trade_amount = 0
                                    if is_buy:
                                        trade_amount = min(sent_token['amount'] * scale, max_sol)
                                        logger.info(f"🤖 Auto-Copy Buy ({profile_name}): {trade_amount} SOL -> {recv_token['symbol']}")
                                    else:
                                        trade_amount = sent_token['amount'] * scale
                                        logger.info(f"🤖 Auto-Copy Sell ({profile_name}): {trade_amount} {sent_token['symbol']} -> {recv_token['symbol']}")
                                    
                                    if trade_amount > 0:
                                        import threading
                                        threading.Thread(
                                            target=self.execute_trade,
                                            args=(sent_token['mint'], recv_token['mint'], trade_amount),
                                            kwargs={'source': f"Copy: {alias}"},
                                            daemon=True
                                        ).start()
                                        
                                        self.socketio.emit('notification', {
                                            'title': 'Copy Trade Triggered',
                                            'message': f"Copying {alias}: {trade_amount:.4f} {sent_token['symbol']} -> {recv_token['symbol']}",
                                            'type': 'info'
                                        }, namespace='/bots')
                                except Exception as e:
                                    logger.error(f"❌ Auto-Execute Error: {e}")
                        return

            await asyncio.sleep(0.3)
