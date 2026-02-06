"""
ShyftStreamManager — Singleton gRPC streaming client for Shyft Yellowstone + RabbitStream.

Runs synchronous (blocking) gRPC streams in dedicated daemon threads.
Callbacks are invoked directly from the stream thread.

Two streaming channels:
  - Yellowstone gRPC (Geyser): account/slot/program subscriptions (post-execution, full metadata)
  - RabbitStream: transaction streaming from shreds (pre-execution, 15-100ms faster, no logs/meta)
"""

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict, List, Optional

import grpc

from generated import geyser_pb2, geyser_pb2_grpc

logger = logging.getLogger("shyft_stream")
logger.setLevel(logging.INFO)

# Reconnect backoff settings
INITIAL_BACKOFF = 1.0
MAX_BACKOFF = 60.0
BACKOFF_MULTIPLIER = 2.0
PING_INTERVAL = 30  # seconds between keepalive pings
CHANNEL_READY_TIMEOUT = 15  # seconds


class ShyftStreamManager:
    """
    Manages Yellowstone gRPC (Geyser) and RabbitStream connections to Shyft.

    Usage:
        manager = ShyftStreamManager(config)
        manager.subscribe_slots('my_slot_sub', callback)
        manager.subscribe_blocks_meta('blockhash', callback)
        manager.subscribe_program('skr', program_id, callback, data_size=169)
        manager.subscribe_accounts('portfolio', [wallet], callback)
        manager.subscribe_transactions('copytrade', wallets, callback)
        manager.start()
    """

    def __init__(self, config):
        self._geyser_endpoint = config.SHYFT_GRPC_ENDPOINT
        self._rabbit_endpoint = config.SHYFT_RABBIT_ENDPOINT
        self._token = config.SHYFT_GRPC_TOKEN

        # Endpoint failover manager
        self._endpoint_mgr = None
        try:
            from endpoint_manager import get_endpoint_manager
            self._endpoint_mgr = get_endpoint_manager()
        except Exception:
            pass

        # Subscription registrations (name → config)
        self._slot_subs: Dict[str, Callable] = {}
        self._blocks_meta_subs: Dict[str, Callable] = {}  # name → callback(slot, blockhash, block_height)
        self._account_subs: Dict[str, dict] = {}      # name → {accounts: [], callback: fn}
        self._program_subs: Dict[str, dict] = {}       # name → {program_id, callback, data_size}
        self._tx_subs: Dict[str, dict] = {}            # name → {account_include: [], callback: fn}

        # Runtime state
        self._running = False
        self._stop_event = threading.Event()
        self._geyser_thread: Optional[object] = None
        self._rabbit_thread: Optional[object] = None
        self._geyser_connected = False
        self._rabbit_connected = False

        # Callback thread pool — keeps gRPC reader thread free from blocking I/O
        self._callback_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='shyft-cb')

        # Stats
        self._geyser_updates = 0
        self._rabbit_updates = 0
        self._geyser_errors = 0
        self._rabbit_errors = 0
        self._last_geyser_update = 0.0
        self._last_rabbit_update = 0.0
        self._lock = threading.Lock()

    # ─── Service Pattern ──────────────────────────────────────────────

    def start(self):
        """Start gRPC streaming threads."""
        if self._running:
            return
        if not self._token:
            logger.warning("[ShyftStream] No SHYFT_GRPC_TOKEN configured, cannot start")
            return

        self._running = True
        self._stop_event = threading.Event()

        # Start Geyser thread if there are subscriptions
        if self._slot_subs or self._blocks_meta_subs or self._account_subs or self._program_subs:
            self._geyser_thread = threading.Thread(
                target=self._run_geyser_thread, daemon=True, name="shyft-geyser"
            )
            self._geyser_thread.start()
            logger.info("[ShyftStream] Geyser stream thread started")

        # Start RabbitStream thread if there are transaction subscriptions
        if self._tx_subs:
            self._rabbit_thread = threading.Thread(
                target=self._run_rabbit_thread, daemon=True, name="shyft-rabbit"
            )
            self._rabbit_thread.start()
            logger.info("[ShyftStream] RabbitStream thread started")

        if not self._geyser_thread and not self._rabbit_thread:
            logger.info("[ShyftStream] Started (no subscriptions yet — streams will start when subscriptions are added)")

    def stop(self):
        """Stop all streaming."""
        self._running = False
        self._stop_event.set()
        self._geyser_connected = False
        self._rabbit_connected = False
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

    def subscribe_blocks_meta(self, name: str, callback: Callable):
        """
        Subscribe to block metadata updates via Geyser.

        callback(slot: int, blockhash: str, block_height: int)
        """
        self._blocks_meta_subs[name] = callback
        logger.info(f"[ShyftStream] Registered blocks_meta subscription: {name}")
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

    # ─── Geyser Stream (Synchronous gRPC) ─────────────────────────────

    def _run_geyser_thread(self):
        """Thread entry: synchronous geyser stream with reconnection."""
        backoff = INITIAL_BACKOFF

        while self._running:
            try:
                self._run_geyser_stream()
                backoff = INITIAL_BACKOFF  # Reset on clean disconnect
            except grpc.RpcError as e:
                self._geyser_connected = False
                with self._lock:
                    self._geyser_errors += 1
                logger.warning(f"[ShyftStream] Geyser gRPC error: {e}")
            except Exception as e:
                self._geyser_connected = False
                with self._lock:
                    self._geyser_errors += 1
                logger.error(f"[ShyftStream] Geyser stream error: {e}")

            if self._running:
                logger.info(f"[ShyftStream] Geyser reconnecting in {backoff:.1f}s")
                if self._stop_event.wait(timeout=backoff):
                    break  # Stop requested during backoff
                backoff = min(backoff * BACKOFF_MULTIPLIER, MAX_BACKOFF)

    def _run_geyser_stream(self):
        """Single synchronous geyser connection session."""
        # Use endpoint manager for failover if available
        grpc_endpoint = self._geyser_endpoint
        if self._endpoint_mgr:
            grpc_endpoint = self._endpoint_mgr.get_grpc_endpoint() or grpc_endpoint

        credentials = grpc.ssl_channel_credentials()
        channel = grpc.secure_channel(
            grpc_endpoint,
            credentials,
            options=[
                ('grpc.max_receive_message_length', 64 * 1024 * 1024),  # 64MB
                ('grpc.keepalive_time_ms', 10000),
                ('grpc.keepalive_timeout_ms', 5000),
                ('grpc.keepalive_permit_without_calls', 1),
            ],
        )

        # Wait for channel to be ready (with timeout)
        try:
            grpc.channel_ready_future(channel).result(timeout=CHANNEL_READY_TIMEOUT)
            logger.info("[ShyftStream] Geyser channel ready")
            if self._endpoint_mgr:
                self._endpoint_mgr.report_success('grpc')
        except grpc.FutureTimeoutError:
            channel.close()
            if self._endpoint_mgr:
                self._endpoint_mgr.report_failure('grpc')
            raise Exception(f"Geyser channel connect timeout ({CHANNEL_READY_TIMEOUT}s) to {grpc_endpoint}")

        stub = geyser_pb2_grpc.GeyserStub(channel)
        metadata = [('x-token', self._token)]
        request = self._build_geyser_request()
        stop_event = self._stop_event

        def request_iter():
            """Yield initial subscription then periodic pings."""
            yield request
            ping_id = 0
            while not stop_event.is_set():
                if stop_event.wait(timeout=PING_INTERVAL):
                    return  # Stop requested
                ping_id += 1
                yield geyser_pb2.SubscribeRequest(
                    ping=geyser_pb2.SubscribeRequestPing(id=ping_id)
                )

        logger.info(f"[ShyftStream] Subscribing to Geyser at {grpc_endpoint}")

        try:
            stream = stub.Subscribe(request_iter(), metadata=metadata)

            first = True
            for update in stream:
                if not self._running:
                    break
                if first:
                    self._geyser_connected = True
                    logger.info("[ShyftStream] Geyser stream connected — first update received")
                    first = False
                self._dispatch_geyser_update(update)

        finally:
            channel.close()
            self._geyser_connected = False

    def _build_geyser_request(self) -> geyser_pb2.SubscribeRequest:
        """Build the SubscribeRequest from all registered subscriptions."""
        accounts = {}
        slots = {}
        transactions = {}
        blocks_meta = {}

        # Slot subscriptions
        if self._slot_subs:
            slots['slot_sub'] = geyser_pb2.SubscribeRequestFilterSlots(
                filter_by_commitment=True
            )

        # Blocks meta subscriptions
        if self._blocks_meta_subs:
            blocks_meta['blocks_meta_sub'] = geyser_pb2.SubscribeRequestFilterBlocksMeta()

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
            blocks_meta=blocks_meta,
            commitment=geyser_pb2.CONFIRMED,
        )
        return request

    def _safe_submit(self, fn, *args):
        """Submit a callback to the thread pool with error logging."""
        def _wrapper():
            try:
                fn(*args)
            except Exception as e:
                logger.error(f"[ShyftStream] Callback error in {fn}: {e}")
        self._callback_pool.submit(_wrapper)

    def _dispatch_geyser_update(self, update):
        """Route a geyser SubscribeUpdate to the appropriate callback(s).

        Callbacks are dispatched to a thread pool so the gRPC reader thread
        is never blocked by slow I/O in subscriber callbacks.
        """
        with self._lock:
            self._geyser_updates += 1
            self._last_geyser_update = time.time()

        update_type = update.WhichOneof('update_oneof')

        if update_type == 'slot':
            slot_update = update.slot
            status_name = geyser_pb2.SlotStatus.Name(slot_update.status)
            for callback in self._slot_subs.values():
                self._safe_submit(callback, slot_update.slot, status_name)

        elif update_type == 'account':
            acct_update = update.account
            acct_info = acct_update.account
            slot = acct_update.slot

            try:
                from solders.pubkey import Pubkey
                pubkey_b58 = str(Pubkey.from_bytes(acct_info.pubkey))
            except Exception:
                pubkey_b58 = acct_info.pubkey.hex()

            filter_names = list(update.filters)
            data = bytes(acct_info.data)
            lamports = acct_info.lamports

            # Dispatch to account subscriptions
            for name, sub in self._account_subs.items():
                if pubkey_b58 in sub['accounts']:
                    self._safe_submit(sub['callback'], pubkey_b58, lamports, data, slot)

            # Dispatch to program subscriptions
            for name, sub in self._program_subs.items():
                filter_key = f'program_{name}'
                if filter_key in filter_names:
                    self._safe_submit(sub['callback'], pubkey_b58, data, slot)

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
                    self._safe_submit(sub['callback'], sig_b58, account_keys, slot)

        elif update_type == 'block_meta':
            bm = update.block_meta
            block_height = bm.block_height.block_height if bm.block_height else 0
            for callback in self._blocks_meta_subs.values():
                self._safe_submit(callback, bm.slot, bm.blockhash, block_height)

        elif update_type == 'ping':
            pass  # Server keepalive
        elif update_type == 'pong':
            pass  # Response to our ping

    # ─── RabbitStream (shred-level transactions) ──────────────────────

    def _run_rabbit_thread(self):
        """Thread entry: synchronous RabbitStream with reconnection."""
        backoff = INITIAL_BACKOFF

        while self._running:
            try:
                self._run_rabbit_stream()
                backoff = INITIAL_BACKOFF
            except grpc.RpcError as e:
                self._rabbit_connected = False
                with self._lock:
                    self._rabbit_errors += 1
                logger.warning(f"[ShyftStream] RabbitStream gRPC error: {e}")
            except Exception as e:
                self._rabbit_connected = False
                with self._lock:
                    self._rabbit_errors += 1
                logger.error(f"[ShyftStream] RabbitStream error: {e}")

            if self._running:
                logger.info(f"[ShyftStream] RabbitStream reconnecting in {backoff:.1f}s")
                if self._stop_event.wait(timeout=backoff):
                    break
                backoff = min(backoff * BACKOFF_MULTIPLIER, MAX_BACKOFF)

    def _run_rabbit_stream(self):
        """Single synchronous RabbitStream connection session.

        RabbitStream uses the same Yellowstone gRPC protocol but on a different
        endpoint. It streams transactions from shreds (pre-execution) so no
        logs/meta are available — only the raw transaction + account keys.
        """
        # Use endpoint manager for failover if available
        rabbit_endpoint = self._rabbit_endpoint
        if self._endpoint_mgr:
            rabbit_endpoint = self._endpoint_mgr.get_rabbit_endpoint() or rabbit_endpoint

        credentials = grpc.ssl_channel_credentials()
        channel = grpc.secure_channel(
            rabbit_endpoint,
            credentials,
            options=[
                ('grpc.max_receive_message_length', 64 * 1024 * 1024),
                ('grpc.keepalive_time_ms', 10000),
                ('grpc.keepalive_timeout_ms', 5000),
                ('grpc.keepalive_permit_without_calls', 1),
            ],
        )

        try:
            grpc.channel_ready_future(channel).result(timeout=CHANNEL_READY_TIMEOUT)
            logger.info("[ShyftStream] RabbitStream channel ready")
            if self._endpoint_mgr:
                self._endpoint_mgr.report_success('rabbit')
        except grpc.FutureTimeoutError:
            channel.close()
            if self._endpoint_mgr:
                self._endpoint_mgr.report_failure('rabbit')
            raise Exception(f"RabbitStream channel connect timeout ({CHANNEL_READY_TIMEOUT}s) to {rabbit_endpoint}")

        stub = geyser_pb2_grpc.GeyserStub(channel)
        metadata = [('x-token', self._token)]
        request = self._build_rabbit_request()
        stop_event = self._stop_event

        def request_iter():
            yield request
            ping_id = 0
            while not stop_event.is_set():
                if stop_event.wait(timeout=PING_INTERVAL):
                    return
                ping_id += 1
                yield geyser_pb2.SubscribeRequest(
                    ping=geyser_pb2.SubscribeRequestPing(id=ping_id)
                )

        logger.info(f"[ShyftStream] Subscribing to RabbitStream at {rabbit_endpoint}")

        try:
            stream = stub.Subscribe(request_iter(), metadata=metadata)

            first = True
            for update in stream:
                if not self._running:
                    break

                update_type = update.WhichOneof('update_oneof')
                if update_type == 'transaction':
                    if first:
                        self._rabbit_connected = True
                        logger.info("[ShyftStream] RabbitStream connected — first update received")
                        first = False

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
                            self._safe_submit(sub['callback'], sig_b58, account_keys, slot)

                elif update_type == 'ping' or update_type == 'pong':
                    if first:
                        self._rabbit_connected = True
                        logger.info("[ShyftStream] RabbitStream connected (ping/pong)")
                        first = False

        finally:
            channel.close()
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
                'blocks_meta_subs': list(self._blocks_meta_subs.keys()),
                'account_subs': list(self._account_subs.keys()),
                'program_subs': list(self._program_subs.keys()),
                'tx_subs': list(self._tx_subs.keys()),
            }
