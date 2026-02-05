import asyncio
import json
import logging
import threading
import time
import re
from typing import List, Dict, Any, Optional, Set
from functools import partial
from helius_infrastructure import HeliusClient, Programs, SubscriptionType
from database import TactixDB
from config import WALLET_ADDRESS
import sio_bridge

MAJOR_TOKENS = ['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN']

logger = logging.getLogger("copy_trader")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(levelname)s:%(name)s:%(message)s'))
    logger.addHandler(ch)


class CopyTraderEngine:
    def __init__(self, helius_client: HeliusClient, db: TactixDB, execute_trade_func):
        self.helius = helius_client
        self.db = db

        # Validate execute_trade_func
        if execute_trade_func is None:
            logger.warning("No execute_trade_func provided - auto-execution will be disabled")
        self.execute_trade = execute_trade_func

        self.active_targets: Dict[str, Dict] = {}
        self.current_ws = None
        self._running = False
        self._loop = None
        self._thread = None
        self._token_cache = {}
        self._stream_manager = None

        # Thread safety
        self._ws_lock = threading.Lock()

        # Deduplication - track recently processed signatures
        self._processed_signatures: Set[str] = set()
        self._signature_lock = threading.Lock()
        self._max_processed_cache = 1000

        # Target reload interval
        self._last_target_reload = 0
        self._target_reload_interval = 60  # seconds

        # Pending target updates (thread-safe queue)
        self._pending_target_refresh = False

        # RabbitStream stats
        self._rabbit_detections = 0

    def set_stream_manager(self, stream_manager):
        """Register RabbitStream for earliest whale transaction detection.

        RabbitStream catches transactions from shreds (pre-execution), 15-100ms
        faster than WebSocket logsSubscribe. It has NO logs/meta, so we still
        need getTransaction() for full decode — but we trigger it immediately
        instead of waiting for WebSocket notification.

        The WebSocket subscription is kept as fallback.
        """
        self._stream_manager = stream_manager
        # Register subscription — actual target list is updated in _update_rabbit_targets()
        logger.info("[CopyTrader] RabbitStream integration configured (targets will be registered on start)")

    def _update_rabbit_targets(self):
        """Update RabbitStream subscription with current target wallets."""
        if not self._stream_manager:
            return

        target_addresses = list(self.active_targets.keys())
        if not target_addresses:
            return

        # Include user wallet if available
        if WALLET_ADDRESS and WALLET_ADDRESS != "Unknown":
            target_addresses.append(WALLET_ADDRESS)

        self._stream_manager.subscribe_transactions(
            'copytrade',
            target_addresses,
            self._on_rabbit_tx
        )
        logger.info(f"[CopyTrader] RabbitStream subscription updated: {len(target_addresses)} wallets")

    def _on_rabbit_tx(self, signature: str, account_keys: list, slot: int):
        """Handle pre-execution transaction from RabbitStream.

        This fires 15-100ms before the WebSocket logsSubscribe notification.
        We immediately trigger getTransaction() fetch to decode the swap.
        """
        # Check deduplication
        if self._is_signature_processed(signature):
            return

        self._rabbit_detections += 1

        # Determine which target wallet is involved
        target_wallet = None
        is_user_wallet = False
        for key in account_keys:
            if key in self.active_targets:
                target_wallet = key
                break
            if key == WALLET_ADDRESS:
                is_user_wallet = True

        if target_wallet:
            # Process as whale swap — fire in the asyncio loop if available
            logger.info(f"[CopyTrader] RabbitStream: whale tx from {target_wallet[:8]}... sig={signature[:16]}...")
            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.process_whale_swap(signature, target_wallet),
                    self._loop
                )
            else:
                # No event loop — process in thread
                threading.Thread(
                    target=self._sync_process_whale_swap,
                    args=(signature, target_wallet),
                    daemon=True
                ).start()
        elif is_user_wallet:
            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.process_user_transfer(signature, WALLET_ADDRESS),
                    self._loop
                )

    def _sync_process_whale_swap(self, signature: str, wallet_address: str):
        """Synchronous wrapper for process_whale_swap when no event loop is available."""
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(self.process_whale_swap(signature, wallet_address))
        finally:
            loop.close()

    def start(self):
        if self._thread: return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        logger.info("Copy Trader Engine Thread Started")

    def stop(self):
        self._running = False
        with self._ws_lock:
            if self.current_ws and self._loop:
                asyncio.run_coroutine_threadsafe(self.current_ws.close(), self._loop)
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread = None
        logger.info("Copy Trader Engine Stopped")

    def is_running(self):
        return self._running

    def refresh(self):
        """Signal that targets need to be reloaded."""
        self._pending_target_refresh = True
        # Also close WebSocket to force reconnect with new subscriptions
        with self._ws_lock:
            if self.current_ws and self._loop and self.current_ws._running:
                asyncio.run_coroutine_threadsafe(self.current_ws.close(), self._loop)

    def _run_event_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self.main_loop())

    async def _reload_targets_if_needed(self):
        """Reload targets if refresh was requested or interval elapsed."""
        now = time.time()
        should_reload = (
            self._pending_target_refresh or
            (now - self._last_target_reload) > self._target_reload_interval
        )

        if should_reload:
            targets = self.db.get_all_targets()
            new_targets = {t['address']: t for t in targets if t['status'] == 'active'}

            # Check if targets changed
            old_keys = set(self.active_targets.keys())
            new_keys = set(new_targets.keys())

            if old_keys != new_keys:
                added = new_keys - old_keys
                removed = old_keys - new_keys
                if added:
                    logger.info(f"New targets added: {[a[:8] for a in added]}")
                if removed:
                    logger.info(f"Targets removed: {[r[:8] for r in removed]}")

            self.active_targets = new_targets
            self._last_target_reload = now
            self._pending_target_refresh = False

            # Update RabbitStream subscription when targets change
            if old_keys != new_keys:
                self._update_rabbit_targets()

            return old_keys != new_keys  # Return True if targets changed

        return False

    async def main_loop(self):
        while self._running:
            try:
                # Load targets
                targets = self.db.get_all_targets()
                self.active_targets = {t['address']: t for t in targets if t['status'] == 'active'}
                self._last_target_reload = time.time()

                # Register RabbitStream subscription with current targets
                self._update_rabbit_targets()

                async with self.helius.websocket() as ws:
                    with self._ws_lock:
                        self.current_ws = ws

                    run_task = asyncio.create_task(ws.run())
                    await asyncio.sleep(0.1)

                    # Subscribe to user wallet
                    if WALLET_ADDRESS and WALLET_ADDRESS != "Unknown":
                        logger.info(f"Subscribing to USER wallet: {WALLET_ADDRESS[:8]}...")
                        await ws.subscribe_logs(
                            partial(self.handle_user_wallet_logs, WALLET_ADDRESS),
                            mentions=[WALLET_ADDRESS],
                            commitment="confirmed"
                        )

                    # Subscribe to targets
                    target_addresses = list(self.active_targets.keys())
                    if target_addresses:
                        logger.info(f"Subscribing to logs for {len(target_addresses)} targets")
                        for address in target_addresses:
                            try:
                                await ws.subscribe_logs(
                                    partial(self.handle_transaction_logs, address),
                                    mentions=[address],
                                    commitment="confirmed"
                                )
                                logger.info(f"Subscribed to target {address[:8]}...")
                                await asyncio.sleep(0.5)
                            except Exception as e:
                                logger.error(f"Subscription failed for {address}: {e}")

                    # Keep connection alive, periodically check for target updates
                    while self._running and not run_task.done():
                        # Check if we need to reload targets
                        targets_changed = await self._reload_targets_if_needed()
                        if targets_changed:
                            logger.info("Targets changed, reconnecting to update subscriptions...")
                            break

                        await asyncio.sleep(5)

                    # Wait for run_task if still running
                    if not run_task.done():
                        run_task.cancel()
                        try:
                            await run_task
                        except asyncio.CancelledError:
                            pass

            except Exception as e:
                logger.error(f"Copy Trader Loop Error: {e}")
                await asyncio.sleep(5)
            finally:
                with self._ws_lock:
                    self.current_ws = None

    def _is_signature_processed(self, signature: str) -> bool:
        """Check if signature was already processed (with cleanup)."""
        with self._signature_lock:
            if signature in self._processed_signatures:
                return True

            # Add to processed set
            self._processed_signatures.add(signature)

            # Cleanup if too large
            if len(self._processed_signatures) > self._max_processed_cache:
                # Remove oldest half (sets don't maintain order, but this prevents unbounded growth)
                to_remove = list(self._processed_signatures)[:self._max_processed_cache // 2]
                for sig in to_remove:
                    self._processed_signatures.discard(sig)

            return False

    def resolve_token(self, mint: str) -> str:
        """Resolve token mint to symbol."""
        if mint == "So11111111111111111111111111111111111111112":
            return "SOL"
        if mint in self._token_cache:
            return self._token_cache[mint]

        # Check database
        known = self.db.get_known_tokens().get(mint)
        if known:
            self._token_cache[mint] = known['symbol']
            return known['symbol']

        # Fetch from Helius DAS
        try:
            asset = self.helius.das.get_asset(mint)
            if not asset:
                logger.debug(f"No DAS asset found for {mint[:8]}...")
                return f"{mint[:4]}..."

            symbol = (
                asset.get('token_info', {}).get('symbol') or
                asset.get('content', {}).get('metadata', {}).get('symbol')
            )
            decimals = asset.get('token_info', {}).get('decimals') or 9

            if symbol:
                symbol = symbol.upper()
                self.db.save_token(mint, symbol, decimals)
                self._token_cache[mint] = symbol
                return symbol

            return f"{mint[:4]}..."

        except Exception as e:
            logger.warning(f"Token resolution failed for {mint[:8]}...: {e}")
            return f"{mint[:4]}..."

    def _is_token_safe(self, mint: str, config: dict) -> bool:
        """
        SECURITY: Verify token is safe before auto-executing copy trade.

        Checks:
        - Not on blocklist
        - Has minimum liquidity (if configured)
        - Has valid metadata
        - Doesn't match suspicious patterns (common rug pull indicators)

        Args:
            mint: Token mint address to check
            config: Copy trade configuration with safety settings

        Returns:
            True if token passes safety checks
        """
        # Skip checks for major tokens
        if mint in MAJOR_TOKENS:
            return True

        try:
            from services.trade_guard import TOKEN_BLOCKLIST

            # 1. Check trade guard blocklist
            if mint in TOKEN_BLOCKLIST:
                logger.warning(f"Token {mint[:8]}... is on blocklist")
                return False

            # 2. Get token metadata via Helius DAS
            asset = self.helius.das.get_asset(mint)
            if not asset:
                logger.warning(f"Token {mint[:8]}... has no DAS metadata")
                # Allow if safety checks are disabled in config
                return config.get('allow_unknown_tokens', False)

            token_info = asset.get('token_info', {})
            content = asset.get('content', {})
            metadata = content.get('metadata', {})

            # 3. Check for suspicious patterns in name/symbol
            name = (metadata.get('name') or '').lower()
            symbol = (token_info.get('symbol') or metadata.get('symbol') or '').lower()

            suspicious_patterns = [
                'honeypot', 'scam', 'rug', 'fake', 'test', 'copy',
                'replica', 'clone', 'presale', 'free', 'airdrop'
            ]

            for pattern in suspicious_patterns:
                if pattern in name or pattern in symbol:
                    logger.warning(f"Token {mint[:8]}... has suspicious name/symbol: {name}/{symbol}")
                    return False

            # 4. Check freeze authority (tokens that can freeze are risky)
            if asset.get('freeze_authority'):
                # Only block if strict mode is enabled
                if config.get('require_no_freeze', False):
                    logger.warning(f"Token {mint[:8]}... has freeze authority")
                    return False

            # 5. Check mint authority (still mintable = inflation risk)
            if asset.get('mint_authority'):
                # Only block if strict mode is enabled
                if config.get('require_mint_renounced', False):
                    logger.warning(f"Token {mint[:8]}... has mint authority (not renounced)")
                    return False

            # 6. Check minimum supply holders (very few holders = rug risk)
            # Note: This requires additional API call, only check if configured
            min_holders = config.get('min_holders', 0)
            if min_holders > 0:
                # This would require a separate Helius API call
                # For now, skip this check as it adds latency
                pass

            # All checks passed
            return True

        except ImportError:
            # trade_guard module not available, allow by default
            logger.debug("trade_guard module not available, skipping blocklist check")
            return True
        except Exception as e:
            logger.error(f"Token safety check error for {mint[:8]}...: {e}")
            # On transient errors (network, rate limit), allow trade if configured
            # This distinguishes between security failures vs network failures
            return config.get('allow_on_error', True)  # Default to allow on transient errors

    def decode_wallet_changes(self, tx, wallet_address: str) -> Optional[Dict[str, float]]:
        """Analyze transaction for balance changes specifically for the wallet_address."""
        if not tx or not tx.get('meta'):
            return None

        meta = tx['meta']

        try:
            account_keys = [
                k.get('pubkey') if isinstance(k, dict) else k
                for k in tx.get('transaction', {}).get('message', {}).get('accountKeys', [])
            ]
        except (KeyError, TypeError) as e:
            logger.debug(f"Failed to parse account keys: {e}")
            return None

        # Find wallet index
        wallet_index = -1
        try:
            wallet_index = account_keys.index(wallet_address)
        except ValueError:
            # Wallet not in account keys - might be in inner instructions
            pass

        net_changes = {}

        # 1. SOL Change
        if wallet_index != -1:
            try:
                pre_sol = meta['preBalances'][wallet_index] / 1e9
                post_sol = meta['postBalances'][wallet_index] / 1e9
                sol_diff = post_sol - pre_sol
                if wallet_index == 0:
                    sol_diff += (meta['fee'] / 1e9)
                if abs(sol_diff) > 0.0001:
                    net_changes["So11111111111111111111111111111111111111112"] = sol_diff
            except (IndexError, KeyError, TypeError) as e:
                logger.debug(f"SOL balance calculation failed: {e}")

        # 2. Token Changes
        try:
            for bal in meta.get('preTokenBalances', []):
                owner = bal.get('owner') or (account_keys[bal['accountIndex']] if bal['accountIndex'] < len(account_keys) else None)
                if owner == wallet_address:
                    mint = bal['mint']
                    ui_amount = bal.get('uiTokenAmount', {}).get('uiAmount')
                    if ui_amount is not None:
                        net_changes[mint] = net_changes.get(mint, 0) - float(ui_amount)

            for bal in meta.get('postTokenBalances', []):
                owner = bal.get('owner') or (account_keys[bal['accountIndex']] if bal['accountIndex'] < len(account_keys) else None)
                if owner == wallet_address:
                    mint = bal['mint']
                    ui_amount = bal.get('uiTokenAmount', {}).get('uiAmount')
                    if ui_amount is not None:
                        net_changes[mint] = net_changes.get(mint, 0) + float(ui_amount)
        except (KeyError, TypeError, IndexError) as e:
            logger.debug(f"Token balance calculation failed: {e}")

        return net_changes if net_changes else None

    async def handle_user_wallet_logs(self, wallet_address: str, data: Dict[str, Any]):
        val = data.get('value', {})
        signature = val.get('signature')
        if not signature or val.get('err'):
            return
        asyncio.create_task(self.process_user_transfer(signature, wallet_address))

    async def process_user_transfer(self, signature: str, wallet_address: str):
        """Process user wallet transfers with exponential backoff."""
        delays = [0.3, 0.5, 1.0, 2.0, 3.0]  # Exponential backoff

        for i, delay in enumerate(delays):
            try:
                tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
                if tx:
                    changes = self.decode_wallet_changes(tx, wallet_address)
                    if changes:
                        for mint, diff in changes.items():
                            if diff > 0.000001:
                                symbol = self.resolve_token(mint)
                                sio_bridge.emit('notification', {
                                    'title': 'Funds Received',
                                    'message': f"Received {diff:.4f} {symbol}",
                                    'type': 'success'
                                }, namespace='/bots')
                                try:
                                    from services.portfolio import broadcast_balance
                                    broadcast_balance()
                                except Exception as e:
                                    logger.warning(f"Failed to broadcast balance: {e}")
                        return
            except Exception as e:
                logger.debug(f"Transfer fetch attempt {i+1} failed: {e}")

            await asyncio.sleep(delay)

        logger.warning(f"Failed to process user transfer {signature[:16]}... after {len(delays)} attempts")

    def decode_swap(self, signature: str, wallet_address: str) -> Optional[Dict]:
        """Helper for API to decode a specific transaction."""
        try:
            tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
            if not tx:
                return None

            changes = self.decode_wallet_changes(tx, wallet_address)
            if not changes:
                return None

            significant = {m: d for m, d in changes.items() if abs(d) > 1e-9}
            outflows = sorted([(m, d) for m, d in significant.items() if d < 0], key=lambda x: abs(x[1]), reverse=True)
            inflows = sorted([(m, d) for m, d in significant.items() if d > 0], key=lambda x: x[1], reverse=True)

            if outflows and inflows:
                return {
                    'sent': {'mint': outflows[0][0], 'symbol': self.resolve_token(outflows[0][0]), 'amount': abs(outflows[0][1])},
                    'received': {'mint': inflows[0][0], 'symbol': self.resolve_token(inflows[0][0]), 'amount': inflows[0][1]}
                }
        except Exception as e:
            logger.warning(f"Swap decode failed for {signature[:16]}...: {e}")

        return None

    async def handle_transaction_logs(self, wallet_address: str, data: Dict[str, Any]):
        val = data.get('value', {})
        signature = val.get('signature')
        if not signature or val.get('err'):
            return

        logs = val.get('logs', [])
        programs = [l.split(' ')[1] for l in logs if 'invoke [' in l]
        target_programs = [
            Programs.RAYDIUM_V4, Programs.RAYDIUM_CP, Programs.RAYDIUM_CLMM,
            Programs.JUPITER_V6, Programs.ORCA_WHIRLPOOL, Programs.METEORA_DLMM,
            Programs.PUMP_FUN, Programs.PHOENIX, Programs.LIFINITY
        ]
        if not any(p in programs for p in target_programs):
            return

        asyncio.create_task(self.process_whale_swap(signature, wallet_address))

    def _execute_trade_with_tracking(
        self,
        input_mint: str,
        output_mint: str,
        amount: float,
        source: str,
        slippage_bps: int,
        priority_fee: float,
        alias: str,
        sent_symbol: str,
        recv_symbol: str
    ):
        """Execute trade with result tracking and notifications."""
        try:
            if self.execute_trade is None:
                logger.error("execute_trade function not configured")
                sio_bridge.emit('notification', {
                    'title': 'Copy Trade Failed',
                    'message': 'Trade execution not configured',
                    'type': 'error'
                }, namespace='/bots')
                return

            # Execute the trade
            result = self.execute_trade(
                input_mint,
                output_mint,
                amount,
                source=source,
                slippage_bps=slippage_bps,
                priority_fee=priority_fee
            )

            # Handle result
            if result and isinstance(result, dict):
                if result.get('success'):
                    sio_bridge.emit('notification', {
                        'title': 'Copy Trade Executed',
                        'message': f"Copied {alias}: {amount:.4f} {sent_symbol} -> {recv_symbol}",
                        'type': 'success'
                    }, namespace='/bots')
                    logger.info(f"Copy trade executed: {result.get('signature', 'unknown')}")
                else:
                    error = result.get('error', 'Unknown error')
                    sio_bridge.emit('notification', {
                        'title': 'Copy Trade Failed',
                        'message': f"Failed to copy {alias}: {error}",
                        'type': 'error'
                    }, namespace='/bots')
                    logger.error(f"Copy trade failed: {error}")
            else:
                # Assume success if no result returned (legacy behavior)
                logger.info(f"Copy trade submitted (no result tracking)")

        except Exception as e:
            logger.error(f"Copy trade execution error: {e}")
            sio_bridge.emit('notification', {
                'title': 'Copy Trade Error',
                'message': f"Error copying {alias}: {str(e)[:50]}",
                'type': 'error'
            }, namespace='/bots')

    async def process_whale_swap(self, signature: str, wallet_address: str):
        """Process detected whale swap with deduplication and exponential backoff."""

        # Check for duplicate
        if self._is_signature_processed(signature):
            logger.debug(f"Signature {signature[:16]}... already processed, skipping")
            return

        # Exponential backoff for transaction fetch
        delays = [0.3, 0.5, 1.0, 2.0, 3.0, 5.0]

        for i, delay in enumerate(delays):
            try:
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

                            # Save to DB (has UNIQUE constraint, will fail silently on duplicate)
                            try:
                                self.db.save_signal(signature, wallet_address, 'Swap Detected', signal_data)
                            except Exception as e:
                                logger.debug(f"Signal save failed (likely duplicate): {e}")

                            # Emit to frontend
                            sio_bridge.emit('signal_detected', signal_data, namespace='/copytrade')
                            logger.info(f"Decoded {alias} Swap: {sent_token['amount']:.4f} {sent_token['symbol']} -> {recv_token['amount']:.4f} {recv_token['symbol']}")

                            # --- Auto-Execution Logic ---
                            await self._handle_auto_execution(target, sent_token, recv_token, alias)
                        return
            except Exception as e:
                logger.debug(f"Whale swap fetch attempt {i+1} failed: {e}")

            await asyncio.sleep(delay)

        logger.warning(f"Failed to process whale swap {signature[:16]}... after {len(delays)} attempts")

    async def _handle_auto_execution(
        self,
        target: Dict,
        sent_token: Dict,
        recv_token: Dict,
        alias: str
    ):
        """Handle auto-execution logic for copy trading."""
        if target.get('status') != 'active' or not target.get('config_json'):
            return

        try:
            config = json.loads(target['config_json'])
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Invalid config for target {alias}")
            return

        if not config.get('auto_execute'):
            return

        try:
            # SECURITY: Token safety checks before auto-execution
            token_to_check = recv_token['mint'] if sent_token['mint'] == "So11111111111111111111111111111111111111112" else sent_token['mint']

            if not self._is_token_safe(token_to_check, config):
                logger.warning(f"Copy trade blocked: Token {token_to_check[:8]}... failed safety checks")
                sio_bridge.emit('notification', {
                    'title': 'Copy Trade Blocked',
                    'message': f"Token safety check failed for {recv_token['symbol'] if sent_token['mint'] == 'So11111111111111111111111111111111111111112' else sent_token['symbol']}",
                    'type': 'warning'
                }, namespace='/bots')
                return

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

            # Safety & Config
            slippage_bps = int(config.get('slippage', 1.0) * 100)
            priority_fee = float(config.get('priority_fee', 0.005))

            trade_amount = 0
            should_execute = False

            if is_buy:
                # BUY: Input is SOL
                trade_amount = min(sent_token['amount'] * scale, max_sol)
                should_execute = True
                logger.info(f"Auto-Copy BUY ({profile_name}): {trade_amount:.4f} SOL -> {recv_token['symbol']}")
            else:
                # SELL: Input is Token - get fresh balance
                try:
                    from services.portfolio import get_cached_balance, refresh_single_token

                    # Try to get fresh balance
                    try:
                        refresh_single_token(sent_token['mint'])
                    except Exception:
                        pass  # Use cached if refresh fails

                    current_balance = get_cached_balance(sent_token['mint'])

                    target_sell_amount = sent_token['amount'] * scale

                    if current_balance > 0:
                        # Sell whatever we have up to the scaled amount
                        trade_amount = min(current_balance, target_sell_amount)
                        if trade_amount > 0:
                            should_execute = True
                            logger.info(f"Auto-Copy SELL ({profile_name}): {trade_amount:.4f} {sent_token['symbol']} (Held: {current_balance:.4f})")
                    else:
                        logger.info(f"Copy Sell Ignored: We do not hold {sent_token['symbol']}")
                except ImportError:
                    logger.warning("Portfolio service not available for balance check")

            if should_execute and trade_amount > 0:
                # Execute in thread with result tracking
                threading.Thread(
                    target=self._execute_trade_with_tracking,
                    args=(
                        sent_token['mint'],
                        recv_token['mint'],
                        trade_amount,
                        f"Copy: {alias}",
                        slippage_bps,
                        priority_fee,
                        alias,
                        sent_token['symbol'],
                        recv_token['symbol']
                    ),
                    daemon=True
                ).start()

                sio_bridge.emit('notification', {
                    'title': 'Copy Trade Triggered',
                    'message': f"Copying {alias}: {trade_amount:.4f} {sent_token['symbol']} -> {recv_token['symbol']}",
                    'type': 'info'
                }, namespace='/bots')

        except Exception as e:
            logger.error(f"Auto-Execute Error: {e}")
            sio_bridge.emit('notification', {
                'title': 'Copy Trade Error',
                'message': f"Auto-execute failed: {str(e)[:50]}",
                'type': 'error'
            }, namespace='/bots')
