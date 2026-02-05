"""
ShyftStreamManager — Singleton gRPC streaming client for Shyft Yellowstone + RabbitStream.

Runs gRPC async streams in a dedicated thread with its own asyncio event loop,
bridging to the main eventlet thread via thread-safe callbacks.

Two streaming channels:
  - Yellowstone gRPC (Geyser): account/slot/program subscriptions (post-execution, full metadata)
  - RabbitStream: transaction streaming from shreds (pre-execution, 15-100ms faster, no logs/meta)
"""

import asyncio
import base64
import logging
import threading
import time
from typing import Callable, Dict, List, Optional

import eventlet.patcher
import grpc

# Use real OS threads for asyncio loops — eventlet green threads block the hub
# when running asyncio.run_until_complete()
_real_threading = eventlet.patcher.original('threading')

from generated import geyser_pb2, geyser_pb2_grpc

logger = logging.getLogger("shyft_stream")
logger.setLevel(logging.INFO)

# Reconnect backoff settings
INITIAL_BACKOFF = 1.0
MAX_BACKOFF = 60.0
BACKOFF_MULTIPLIER = 2.0
PING_INTERVAL = 30  # seconds between keepalive pings


class ShyftStreamManager:
    """
    Manages Yellowstone gRPC (Geyser) and RabbitStream connections to Shyft.

    Usage:
        manager = ShyftStreamManager(config)
        manager.subscribe_slots('blockhash', callback)
        manager.subscribe_program('skr', program_id, callback, data_size=169)
        manager.subscribe_accounts('portfolio', [wallet], callback)
        manager.subscribe_transactions('copytrade', wallets, callback)
        manager.start()
    """

    def __init__(self, config):
        self._geyser_endpoint = config.SHYFT_GRPC_ENDPOINT
        self._rabbit_endpoint = config.SHYFT_RABBIT_ENDPOINT
        self._token = config.SHYFT_GRPC_TOKEN

        # Subscription registrations (name → config)
        self._slot_subs: Dict[str, Callable] = {}
        self._account_subs: Dict[str, dict] = {}      # name → {accounts: [], callback: fn}
        self._program_subs: Dict[str, dict] = {}       # name → {program_id, callback, data_size}
        self._tx_subs: Dict[str, dict] = {}            # name → {account_include: [], callback: fn}

        # Runtime state
        self._running = False
        self._geyser_thread: Optional[threading.Thread] = None
        self._rabbit_thread: Optional[threading.Thread] = None
        self._geyser_loop: Optional[asyncio.AbstractEventLoop] = None
        self._rabbit_loop: Optional[asyncio.AbstractEventLoop] = None
        self._geyser_connected = False
        self._rabbit_connected = False

        # Stats
        self._geyser_updates = 0
        self._rabbit_updates = 0
        self._geyser_errors = 0
        self._rabbit_errors = 0
        self._last_geyser_update = 0.0
        self._last_rabbit_update = 0.0
        self._lock = _real_threading.Lock()

    # ─── Service Pattern ──────────────────────────────────────────────

    def start(self):
        """Start gRPC streaming threads."""
        if self._running:
            return
        if not self._token:
            logger.warning("[ShyftStream] No SHYFT_GRPC_TOKEN configured, cannot start")
            return

        self._running = True

        # Start Geyser thread if there are subscriptions
        # Use real OS threads — asyncio event loops block eventlet green threads
        if self._slot_subs or self._account_subs or self._program_subs:
            self._geyser_thread = _real_threading.Thread(
                target=self._run_geyser_thread, daemon=True, name="shyft-geyser"
            )
            self._geyser_thread.start()
            logger.info("[ShyftStream] Geyser stream thread started")

        # Start RabbitStream thread if there are transaction subscriptions
        if self._tx_subs:
            self._rabbit_thread = _real_threading.Thread(
                target=self._run_rabbit_thread, daemon=True, name="shyft-rabbit"
            )
            self._rabbit_thread.start()
            logger.info("[ShyftStream] RabbitStream thread started")

        if not self._geyser_thread and not self._rabbit_thread:
            logger.info("[ShyftStream] Started (no subscriptions yet — streams will start when subscriptions are added)")

    def stop(self):
        """Stop all streaming."""
        self._running = False
        self._geyser_connected = False
        self._rabbit_connected = False

        # Cancel async loops
        for loop in [self._geyser_loop, self._rabbit_loop]:
            if loop and loop.is_running():
                loop.call_soon_threadsafe(loop.stop)

        self._geyser_thread = None
        self._rabbit_thread = None
        logger.info("[ShyftStream] Stopped")

    def is_running(self):
        return self._running

    # ─── Subscription Registration ────────────────────────────────────

    def subscribe_slots(self, name: str, callback: Callable):
        """
        Subscribe to slot updates via Geyser.

        callback(slot: int, status: str)
        """
        self._slot_subs[name] = callback
        logger.info(f"[ShyftStream] Registered slot subscription: {name}")
        self._maybe_start_geyser()

    def subscribe_accounts(self, name: str, accounts: List[str], callback: Callable):
        """
        Subscribe to account changes via Geyser.

        callback(pubkey: str, lamports: int, data: bytes, slot: int)
        """
        self._account_subs[name] = {
            'accounts': accounts,
            'callback': callback,
        }
        logger.info(f"[ShyftStream] Registered account subscription: {name} ({len(accounts)} accounts)")
        self._maybe_start_geyser()

    def subscribe_program(self, name: str, program_id: str, callback: Callable, data_size: int = None):
        """
        Subscribe to program account changes via Geyser.

        callback(pubkey: str, data: bytes, slot: int)
        """
        self._program_subs[name] = {
            'program_id': program_id,
            'callback': callback,
            'data_size': data_size,
        }
        logger.info(f"[ShyftStream] Registered program subscription: {name} (program={program_id[:8]}...)")
        self._maybe_start_geyser()

    def subscribe_transactions(self, name: str, account_include: List[str], callback: Callable):
        """
        Subscribe to transactions via RabbitStream (shred-level, pre-execution).

        callback(signature: str, account_keys: list, slot: int)
        """
        self._tx_subs[name] = {
            'account_include': account_include,
            'callback': callback,
        }
        logger.info(f"[ShyftStream] Registered tx subscription: {name} ({len(account_include)} accounts)")
        self._maybe_start_rabbit()

    # ─── Dynamic Start Helpers ────────────────────────────────────────

    def _maybe_start_geyser(self):
        """Start geyser thread if running but thread not started yet."""
        if self._running and not self._geyser_thread:
            self._geyser_thread = threading.Thread(
                target=self._run_geyser_thread, daemon=True, name="shyft-geyser"
            )
            self._geyser_thread.start()
            logger.info("[ShyftStream] Geyser stream thread started (late)")

    def _maybe_start_rabbit(self):
        """Start rabbit thread if running but thread not started yet."""
        if self._running and not self._rabbit_thread:
            self._rabbit_thread = threading.Thread(
                target=self._run_rabbit_thread, daemon=True, name="shyft-rabbit"
            )
            self._rabbit_thread.start()
            logger.info("[ShyftStream] RabbitStream thread started (late)")

    # ─── Geyser Stream (Yellowstone gRPC) ─────────────────────────────

    def _run_geyser_thread(self):
        """Thread entry: create event loop and run geyser stream."""
        self._geyser_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._geyser_loop)
        try:
            self._geyser_loop.run_until_complete(self._geyser_stream_loop())
        except Exception as e:
            logger.error(f"[ShyftStream] Geyser thread exited: {e}")
        finally:
            self._geyser_connected = False

    async def _geyser_stream_loop(self):
        """Reconnecting geyser stream loop with exponential backoff."""
        backoff = INITIAL_BACKOFF

        while self._running:
            try:
                await self._run_geyser_stream()
            except grpc.aio.AioRpcError as e:
                self._geyser_connected = False
                with self._lock:
                    self._geyser_errors += 1
                logger.warning(f"[ShyftStream] Geyser gRPC error: {e.code()} {e.details()}")
            except Exception as e:
                self._geyser_connected = False
                with self._lock:
                    self._geyser_errors += 1
                logger.error(f"[ShyftStream] Geyser stream error: {e}")

            if self._running:
                logger.info(f"[ShyftStream] Geyser reconnecting in {backoff:.1f}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * BACKOFF_MULTIPLIER, MAX_BACKOFF)

    async def _run_geyser_stream(self):
        """Single geyser connection session."""
        # Build channel with auth metadata
        credentials = grpc.ssl_channel_credentials()
        channel = grpc.aio.secure_channel(
            self._geyser_endpoint,
            credentials,
            options=[
                ('grpc.max_receive_message_length', 64 * 1024 * 1024),  # 64MB
                ('grpc.keepalive_time_ms', 10000),
                ('grpc.keepalive_timeout_ms', 5000),
            ],
        )

        stub = geyser_pb2_grpc.GeyserStub(channel)
        metadata = [('x-token', self._token)]

        # Build subscribe request with all registered subscriptions
        request = self._build_geyser_request()

        logger.info(f"[ShyftStream] Connecting to Geyser at {self._geyser_endpoint}")

        async def request_iterator():
            """Yield the initial subscribe request then keep alive with pings."""
            yield request
            ping_id = 0
            while self._running:
                await asyncio.sleep(PING_INTERVAL)
                ping_id += 1
                ping_req = geyser_pb2.SubscribeRequest(
                    ping=geyser_pb2.SubscribeRequestPing(id=ping_id)
                )
                yield ping_req

        try:
            stream = stub.Subscribe(request_iterator(), metadata=metadata)
            self._geyser_connected = True
            logger.info("[ShyftStream] Geyser stream connected")

            async for update in stream:
                if not self._running:
                    break
                self._dispatch_geyser_update(update)

        finally:
            await channel.close()
            self._geyser_connected = False

    def _build_geyser_request(self) -> geyser_pb2.SubscribeRequest:
        """Build the SubscribeRequest from all registered subscriptions."""
        accounts = {}
        slots = {}
        transactions = {}

        # Slot subscriptions
        if self._slot_subs:
            slots['slot_sub'] = geyser_pb2.SubscribeRequestFilterSlots(
                filter_by_commitment=True
            )

        # Account subscriptions (direct account addresses)
        all_account_addrs = []
        for name, sub in self._account_subs.items():
            all_account_addrs.extend(sub['accounts'])

        if all_account_addrs:
            accounts['account_sub'] = geyser_pb2.SubscribeRequestFilterAccounts(
                account=all_account_addrs
            )

        # Program subscriptions (owner-based, with optional data_size filter)
        for name, sub in self._program_subs.items():
            filters = []
            if sub.get('data_size'):
                filters.append(
                    geyser_pb2.SubscribeRequestFilterAccountsFilter(
                        datasize=sub['data_size']
                    )
                )
            accounts[f'program_{name}'] = geyser_pb2.SubscribeRequestFilterAccounts(
                owner=[sub['program_id']],
                filters=filters
            )

        request = geyser_pb2.SubscribeRequest(
            accounts=accounts,
            slots=slots,
            transactions=transactions,
            commitment=geyser_pb2.CONFIRMED,
        )
        return request

    def _dispatch_geyser_update(self, update):
        """Route a geyser SubscribeUpdate to the appropriate callback(s)."""
        with self._lock:
            self._geyser_updates += 1
            self._last_geyser_update = time.time()

        update_type = update.WhichOneof('update_oneof')

        if update_type == 'slot':
            slot_update = update.slot
            status_name = geyser_pb2.SlotStatus.Name(slot_update.status)
            for callback in self._slot_subs.values():
                try:
                    callback(slot_update.slot, status_name)
                except Exception as e:
                    logger.error(f"[ShyftStream] Slot callback error: {e}")

        elif update_type == 'account':
            acct_update = update.account
            acct_info = acct_update.account
            pubkey_b58 = base64.b58encode(acct_info.pubkey).decode() if len(acct_info.pubkey) == 32 else acct_info.pubkey.hex()
            owner_b58 = base64.b58encode(acct_info.owner).decode() if len(acct_info.owner) == 32 else acct_info.owner.hex()
            slot = acct_update.slot

            # Try to use solders for proper base58 encoding
            try:
                from solders.pubkey import Pubkey
                pubkey_b58 = str(Pubkey.from_bytes(acct_info.pubkey))
                owner_b58 = str(Pubkey.from_bytes(acct_info.owner))
            except Exception:
                pass

            filter_names = list(update.filters)

            # Dispatch to account subscriptions
            for name, sub in self._account_subs.items():
                if pubkey_b58 in sub['accounts']:
                    try:
                        sub['callback'](pubkey_b58, acct_info.lamports, bytes(acct_info.data), slot)
                    except Exception as e:
                        logger.error(f"[ShyftStream] Account callback error ({name}): {e}")

            # Dispatch to program subscriptions
            for name, sub in self._program_subs.items():
                filter_key = f'program_{name}'
                if filter_key in filter_names:
                    try:
                        sub['callback'](pubkey_b58, bytes(acct_info.data), slot)
                    except Exception as e:
                        logger.error(f"[ShyftStream] Program callback error ({name}): {e}")

        elif update_type == 'transaction':
            tx_update = update.transaction
            tx_info = tx_update.transaction
            try:
                from solders.signature import Signature
                sig_b58 = str(Signature.from_bytes(bytes(tx_info.signature)))
            except Exception:
                sig_b58 = tx_info.signature.hex()

            slot = tx_update.slot

            # Extract account keys from the transaction message
            account_keys = []
            if tx_info.transaction and tx_info.transaction.message:
                for key_bytes in tx_info.transaction.message.account_keys:
                    try:
                        from solders.pubkey import Pubkey
                        account_keys.append(str(Pubkey.from_bytes(key_bytes)))
                    except Exception:
                        account_keys.append(key_bytes.hex())

            # Dispatch to transaction subscribers
            for name, sub in self._tx_subs.items():
                include_set = set(sub['account_include'])
                if include_set.intersection(account_keys):
                    try:
                        sub['callback'](sig_b58, account_keys, slot)
                    except Exception as e:
                        logger.error(f"[ShyftStream] Tx callback error ({name}): {e}")

        elif update_type == 'ping':
            pass  # Server keepalive
        elif update_type == 'pong':
            pass  # Response to our ping

    # ─── RabbitStream (shred-level transactions) ──────────────────────

    def _run_rabbit_thread(self):
        """Thread entry: create event loop and run RabbitStream."""
        self._rabbit_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._rabbit_loop)
        try:
            self._rabbit_loop.run_until_complete(self._rabbit_stream_loop())
        except Exception as e:
            logger.error(f"[ShyftStream] RabbitStream thread exited: {e}")
        finally:
            self._rabbit_connected = False

    async def _rabbit_stream_loop(self):
        """Reconnecting RabbitStream loop with exponential backoff."""
        backoff = INITIAL_BACKOFF

        while self._running:
            try:
                await self._run_rabbit_stream()
            except grpc.aio.AioRpcError as e:
                self._rabbit_connected = False
                with self._lock:
                    self._rabbit_errors += 1
                logger.warning(f"[ShyftStream] RabbitStream gRPC error: {e.code()} {e.details()}")
            except Exception as e:
                self._rabbit_connected = False
                with self._lock:
                    self._rabbit_errors += 1
                logger.error(f"[ShyftStream] RabbitStream error: {e}")

            if self._running:
                logger.info(f"[ShyftStream] RabbitStream reconnecting in {backoff:.1f}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * BACKOFF_MULTIPLIER, MAX_BACKOFF)

    async def _run_rabbit_stream(self):
        """Single RabbitStream connection session.

        RabbitStream uses the same Yellowstone gRPC protocol but on a different
        endpoint. It streams transactions from shreds (pre-execution) so no
        logs/meta are available — only the raw transaction + account keys.
        """
        credentials = grpc.ssl_channel_credentials()
        channel = grpc.aio.secure_channel(
            self._rabbit_endpoint,
            credentials,
            options=[
                ('grpc.max_receive_message_length', 64 * 1024 * 1024),
                ('grpc.keepalive_time_ms', 10000),
                ('grpc.keepalive_timeout_ms', 5000),
            ],
        )

        stub = geyser_pb2_grpc.GeyserStub(channel)
        metadata = [('x-token', self._token)]

        # Build transaction-only subscribe request
        request = self._build_rabbit_request()

        logger.info(f"[ShyftStream] Connecting to RabbitStream at {self._rabbit_endpoint}")

        async def request_iterator():
            yield request
            ping_id = 0
            while self._running:
                await asyncio.sleep(PING_INTERVAL)
                ping_id += 1
                yield geyser_pb2.SubscribeRequest(
                    ping=geyser_pb2.SubscribeRequestPing(id=ping_id)
                )

        try:
            stream = stub.Subscribe(request_iterator(), metadata=metadata)
            self._rabbit_connected = True
            logger.info("[ShyftStream] RabbitStream connected")

            async for update in stream:
                if not self._running:
                    break

                update_type = update.WhichOneof('update_oneof')
                if update_type == 'transaction':
                    with self._lock:
                        self._rabbit_updates += 1
                        self._last_rabbit_update = time.time()

                    tx_update = update.transaction
                    tx_info = tx_update.transaction
                    slot = tx_update.slot

                    try:
                        from solders.signature import Signature
                        sig_b58 = str(Signature.from_bytes(bytes(tx_info.signature)))
                    except Exception:
                        sig_b58 = tx_info.signature.hex()

                    account_keys = []
                    if tx_info.transaction and tx_info.transaction.message:
                        for key_bytes in tx_info.transaction.message.account_keys:
                            try:
                                from solders.pubkey import Pubkey
                                account_keys.append(str(Pubkey.from_bytes(key_bytes)))
                            except Exception:
                                account_keys.append(key_bytes.hex())

                    for name, sub in self._tx_subs.items():
                        include_set = set(sub['account_include'])
                        if include_set.intersection(account_keys):
                            try:
                                sub['callback'](sig_b58, account_keys, slot)
                            except Exception as e:
                                logger.error(f"[ShyftStream] RabbitStream tx callback error ({name}): {e}")

        finally:
            await channel.close()
            self._rabbit_connected = False

    def _build_rabbit_request(self) -> geyser_pb2.SubscribeRequest:
        """Build transaction-only subscribe request for RabbitStream."""
        transactions = {}

        # Combine all tx subscription account filters
        all_accounts = []
        for name, sub in self._tx_subs.items():
            all_accounts.extend(sub['account_include'])

        if all_accounts:
            transactions['tx_sub'] = geyser_pb2.SubscribeRequestFilterTransactions(
                vote=False,
                failed=False,
                account_include=list(set(all_accounts)),
            )

        return geyser_pb2.SubscribeRequest(
            transactions=transactions,
            commitment=geyser_pb2.CONFIRMED,
        )

    # ─── Stats & Status ──────────────────────────────────────────────

    def get_stats(self) -> dict:
        """Return current connection stats."""
        with self._lock:
            return {
                'is_running': self._running,
                'geyser_connected': self._geyser_connected,
                'rabbit_connected': self._rabbit_connected,
                'geyser_updates': self._geyser_updates,
                'rabbit_updates': self._rabbit_updates,
                'geyser_errors': self._geyser_errors,
                'rabbit_errors': self._rabbit_errors,
                'geyser_age_ms': int((time.time() - self._last_geyser_update) * 1000) if self._last_geyser_update else None,
                'rabbit_age_ms': int((time.time() - self._last_rabbit_update) * 1000) if self._last_rabbit_update else None,
                'slot_subs': list(self._slot_subs.keys()),
                'account_subs': list(self._account_subs.keys()),
                'program_subs': list(self._program_subs.keys()),
                'tx_subs': list(self._tx_subs.keys()),
            }
