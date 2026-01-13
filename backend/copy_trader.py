import asyncio
import json
import logging
import threading
import time
from typing import List, Dict, Any
from functools import partial
from helius_infrastructure import HeliusClient, Programs, SubscriptionType
from database import TactixDB

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
        self._token_cache = {} # Cache for symbols/decimals

    def start(self):
        """Start the engine in a separate thread."""
        if self._thread:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        logger.info("🚀 Copy Trader Engine Thread Started")

    def stop(self):
        self._running = False
        if self.current_ws and self._loop:
             asyncio.run_coroutine_threadsafe(self.current_ws.close(), self._loop)
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)

    def refresh(self):
        """Force a restart of the WebSocket session to update targets."""
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
                # Update local target cache
                self.active_targets = {t['address']: t for t in targets if t['status'] == 'active'}
                
                async with self.helius.websocket() as ws:
                    self.current_ws = ws
                    # Start the message listener loop in the background
                    run_task = asyncio.create_task(ws.run())
                    await asyncio.sleep(0.1)

                    # Subscribe to logs for all active targets
                    # Note: Helius/Solana RPC limits 'mentions' to 1 address per subscription
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
                                logger.info(f"✅ Subscribed to {address[:8]}...")
                            except Exception as e:
                                logger.error(f"Subscription failed for {address}: {e}")
                    
                    # Wait for the run loop to finish (e.g. connection closed)
                    await run_task
            except Exception as e:
                logger.error(f"❌ Copy Trader Loop Error: {e}")
                await asyncio.sleep(5)
            finally:
                self.current_ws = None

    def resolve_token(self, mint: str):
        """Get symbol for a mint, discover if unknown."""
        if mint == "So11111111111111111111111111111111111111112":
            return "SOL"
            
        if mint in self._token_cache:
            return self._token_cache[mint]

        known = self.db.get_known_tokens().get(mint)
        if known:
            self._token_cache[mint] = known['symbol']
            return known['symbol']
            
        try:
            logger.info(f"🔍 Discovering metadata for {mint}...")
            asset = self.helius.das.get_asset(mint)
            if not asset:
                return f"{mint[:4]}..."

            # Try multiple paths for symbol
            token_info = asset.get('token_info', {})
            content = asset.get('content', {})
            metadata = content.get('metadata', {})
            
            symbol = token_info.get('symbol') or metadata.get('symbol')
            decimals = token_info.get('decimals') or 9
            
            if symbol:
                symbol = symbol.upper()
                self.db.save_token(mint, symbol, decimals)
                self._token_cache[mint] = symbol
                logger.info(f"✅ Resolved {mint} -> {symbol}")
                return symbol
            
            return f"{mint[:4]}..."
        except Exception as e:
            logger.warning(f"Metadata fetch failed for {mint}: {e}")
            return f"{mint[:4]}..."

    def decode_swap(self, signature: str, wallet_address: str):
        """Fetch and parse transaction to determine swapped assets."""
        for attempt in range(3):
            try:
                tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
                if not tx:
                    if attempt < 2:
                        time.sleep(1)
                        continue
                    return None

                meta = tx.get('meta')
                if not meta or meta.get('err'):
                    return None

                # Find the index of the tracked wallet in the transaction accounts
                message = tx.get('transaction', {}).get('message', {})
                account_keys = message.get('accountKeys', [])
                wallet_index = -1
                for i, acc in enumerate(account_keys):
                    # Handle both dict (jsonParsed) and string (legacy/versioned)
                    pubkey = acc.get('pubkey') if isinstance(acc, dict) else acc
                    if pubkey == wallet_address:
                        wallet_index = i
                        break
                
                if wallet_index == -1:
                    logger.warning(f"Wallet {wallet_address} not found in transaction accounts for {signature}")
                    return None

                # 1. Calculate Native SOL Change
                pre_sol = meta['preBalances'][wallet_index] / 1e9
                post_sol = meta['postBalances'][wallet_index] / 1e9
                sol_diff = post_sol - pre_sol
                
                # If they were the fee payer (usually index 0), add the fee back to see actual trade amount
                if wallet_index == 0:
                    sol_diff += (meta['fee'] / 1e9)
                
                print(f"DEBUG: decode_swap {signature[:8]} SOL diff: {sol_diff}")
                
                changes = {}
                if abs(sol_diff) > 0.0001: # Ignore tiny dust/rent
                    changes["So11111111111111111111111111111111111111112"] = sol_diff

                # 2. Calculate Token Changes
                pre_token = meta.get('preTokenBalances', [])
                post_token = meta.get('postTokenBalances', [])
                
                if pre_token:
                    print(f"DEBUG: decode_swap {signature[:8]} sample preTokenBalance: {pre_token[0]}")
                
                for bal in pre_token:
                    if bal.get('owner') == wallet_address:
                        mint = bal['mint']
                        changes[mint] = changes.get(mint, 0) - float(bal['uiTokenAmount'].get('uiAmount') or 0)

                for bal in post_token:
                    if bal.get('owner') == wallet_address:
                        mint = bal['mint']
                        changes[mint] = changes.get(mint, 0) + float(bal['uiTokenAmount'].get('uiAmount') or 0)

                print(f"DEBUG: decode_swap {signature[:8]} all changes: {changes}")

                # 3. Identify Sent (negative) and Received (positive)
                sent_token = None
                received_token = None
                
                for mint, diff in sorted(changes.items(), key=lambda x: abs(x[1]), reverse=True):
                    if abs(diff) < 1e-9: continue
                    
                    symbol = self.resolve_token(mint)
                    print(f"DEBUG: decode_swap {signature[:8]} analyzing {symbol}: diff={diff}")
                    
                    if diff < 0 and not sent_token:
                        sent_token = {'mint': mint, 'symbol': symbol, 'amount': abs(diff)}
                    elif diff > 0 and not received_token:
                        received_token = {'mint': mint, 'symbol': symbol, 'amount': abs(diff)}

                if sent_token and received_token:
                    print(f"DEBUG: decode_swap {signature[:8]} SUCCESS: Sent {sent_token['symbol']} -> Recv {received_token['symbol']}")
                    return {
                        'sent': sent_token,
                        'received': received_token,
                        'signature': signature
                    }
                
                print(f"DEBUG: decode_swap {signature[:8]} FAILED: sent={sent_token} recv={received_token}")
                return None

            except Exception as e:
                if attempt < 2:
                    time.sleep(1)
                    continue
                logger.error(f"Decoding failed for {signature}: {e}")
                return None
        return None

    async def handle_transaction_logs(self, wallet_address: str, data: Dict[str, Any]):
        """Callback for transaction log notifications."""
        # Solana RPC wraps the actual data in a 'value' field
        val = data.get('value', {})
        signature = val.get('signature')
        
        if not signature:
            return

        logger.info(f"📩 Incoming transaction detected: {signature}")
        print(f"DEBUG: copy_trader detected TX from {wallet_address[:8]}: {signature}")
        logs = val.get('logs', [])
        print(f"DEBUG: logs summary for {signature[:8]}: {str(logs)[:100]}...")
        
        err = val.get('err')
        
        print(f"DEBUG: copy_trader logs for {signature[:8]}: {len(logs)} entries")
        programs = [l.split(' ')[1] for l in logs if 'invoke [' in l]
        print(f"DEBUG: copy_trader programs for {signature[:8]}: {list(set(programs))}")

        if err:
            logger.info(f"⚠️ Skipping transaction {signature} due to error: {err}")
            return

        # Look for swap program invocations
        target_programs = [
            Programs.RAYDIUM_V4, Programs.RAYDIUM_CP, Programs.RAYDIUM_CLMM,
            Programs.JUPITER_V6, Programs.ORCA_WHIRLPOOL, Programs.METEORA_DLMM,
            Programs.PUMP_FUN, Programs.PHOENIX, Programs.LIFINITY
        ]
        is_swap = any(p in programs for p in target_programs)

        if is_swap:
            logger.info(f"🔄 Potential Swap Detected: {signature}")
            
            # Phase 2: Decode Transaction
            swap_details = self.decode_swap(signature, wallet_address)
            
            signal_data = {
                'signature': signature,
                'wallet': wallet_address,
                'timestamp': time.time(),
                'type': 'Swap Detected'
            }
            
            if swap_details:
                signal_data['sent'] = swap_details['sent']
                signal_data['received'] = swap_details['received']
                logger.info(f"✅ Decoded: Sent {swap_details['sent']['amount']} {swap_details['sent']['symbol']} -> Recv {swap_details['received']['amount']} {swap_details['received']['symbol']}")
            else:
                print(f"DEBUG: copy_trader Potential swap {signature[:8]} could not be decoded.")

            # Persist to DB
            self.db.save_signal(signature, wallet_address, 'Swap Detected', signal_data)
            
            # Emit to frontend
            self.socketio.emit('signal_detected', signal_data, namespace='/copytrade')
        else:
            print(f"DEBUG: copy_trader TX {signature[:8]} ignored (not a swap). Programs: {programs}")
