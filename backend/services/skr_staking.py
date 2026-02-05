#!/usr/bin/env python3
"""SKR Staking Monitor Service.

Monitors the SKR staking program on Solana for stake/unstake events.
Uses polling (getProgramAccounts) + WebSocket (programSubscribe) for real-time detection.
"""
import asyncio
import base64
import logging
import struct
import threading
import time
from typing import Dict, List, Optional

from helius_infrastructure import HeliusClient
from database import TactixDB
import sio_bridge

logger = logging.getLogger("skr_staking")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(levelname)s:%(name)s:%(message)s'))
    logger.addHandler(ch)

# SKR Staking Program constants
SKR_PROGRAM_ID = "SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ"
SKR_TOKEN_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3"
SKR_TOKEN_DECIMALS = 6
SKR_TOTAL_SUPPLY = 10_000_000_000  # 10 billion
SKR_SHARE_SCALE = 256  # shares are stored scaled by 256

# Known Guardian names (addresses TBD - will be filled as discovered)
GUARDIAN_NAMES = {
    # "pubkey": "name" - populated at runtime from on-chain data
}

# Polling intervals
POLL_INTERVAL = 60          # seconds between full account scans
SNAPSHOT_INTERVAL = 14400   # 4 hours in seconds
WHALE_CACHE_TTL = 300       # 5 minutes
MAX_EVENTS_CACHE = 200      # in-memory event buffer
CIRC_SUPPLY_INTERVAL = 600  # 10 minutes between supply fetches


class SKRStakingService:
    """
    Monitors SKR staking program for stake/unstake events.

    Two monitoring modes:
    1. Polling: getProgramAccounts every POLL_INTERVAL to build snapshots
    2. WebSocket: programSubscribe for real-time event detection
    """

    def __init__(self, helius_client: HeliusClient, db: TactixDB):
        self.helius = helius_client
        self.db = db

        self._running = False
        self._thread = None
        self._ws_thread = None
        self._loop = None
        self._stream_manager = None

        # In-memory state
        self._current_accounts: Dict[str, Dict] = {}
        self._total_staked: float = 0.0
        self._circulating_supply: float = SKR_TOTAL_SUPPLY  # updated from API
        self._total_stakers: int = 0
        self._share_price: int = 1_000_000_000  # default 1.0 in 9-decimal precision
        self._recent_events: List[Dict] = []
        self._last_snapshot_time: float = 0
        self._whale_cache: List[Dict] = []
        self._whale_cache_time: float = 0
        self._circ_supply_time: float = 0
        self._account_size: Optional[int] = None  # discovered on first poll
        self._grpc_account_updates: int = 0

        # Thread safety
        self._lock = threading.Lock()

    def start(self):
        """Start polling thread (and WebSocket if no gRPC stream)."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

        # Only start WebSocket if gRPC is not configured (gRPC replaces WS)
        if not self._stream_manager:
            self._ws_thread = threading.Thread(target=self._run_ws_listener, daemon=True)
            self._ws_thread.start()
            logger.info("[SKR] Staking monitor started (polling + WebSocket)")
        else:
            logger.info("[SKR] Staking monitor started (gRPC + reconciliation polling)")

    def stop(self):
        """Stop all monitoring."""
        self._running = False
        if self._loop:
            try:
                self._loop.call_soon_threadsafe(self._loop.stop)
            except Exception:
                pass
        self._thread = None
        self._ws_thread = None
        logger.info("[SKR] Staking monitor stopped")

    def is_running(self):
        return self._running

    def set_stream_manager(self, stream_manager):
        """Register gRPC program subscription for real-time account changes.

        Replaces the old WebSocket subscription + reduces polling to a
        10-minute reconciliation cycle. Individual account changes arrive
        in real-time (<2s) via Geyser program subscription.
        """
        self._stream_manager = stream_manager
        stream_manager.subscribe_program(
            'skr_staking',
            SKR_PROGRAM_ID,
            self._on_grpc_account_update,
            data_size=169  # Only 169-byte staking accounts, skip config accounts
        )
        logger.info("[SKR] Registered gRPC program subscription for real-time staking events")

    def _on_grpc_account_update(self, pubkey: str, data: bytes, slot: int):
        """Handle real-time program account change from gRPC Geyser stream.

        Called for each individual 169-byte staking account change.
        """
        self._grpc_account_updates += 1

        if len(data) != 169:
            return

        parsed = self._parse_stake_account(data)
        if not parsed:
            return

        with self._lock:
            existing = self._current_accounts.get(pubkey)

            if existing:
                old_amt = existing['staked_amount']
                new_amt = parsed['staked_amount']
                delta = new_amt - old_amt

                if abs(delta) > 0.001:
                    event = {
                        'event_type': 'stake' if delta > 0 else 'unstake',
                        'wallet_address': parsed['wallet'],
                        'amount': abs(delta),
                        'guardian': parsed.get('guardian_name'),
                        'signature': f"grpc-{pubkey[:16]}-{int(time.time() * 1000)}",
                        'slot': slot,
                        'block_time': int(time.time())
                    }
                    self._process_event(event)
                    self._current_accounts[pubkey] = parsed
                    logger.info(f"[SKR] gRPC: {'Stake' if delta > 0 else 'Unstake'} {abs(delta):,.0f} SKR by {parsed['wallet'][:8]}...")
            else:
                # New account — stake event
                if parsed['staked_amount'] > 0:
                    # Only emit event if we've done at least one full poll
                    # (otherwise we'd flood with events on startup)
                    if self._current_accounts:
                        event = {
                            'event_type': 'stake',
                            'wallet_address': parsed['wallet'],
                            'amount': parsed['staked_amount'],
                            'guardian': parsed.get('guardian_name'),
                            'signature': f"grpc-new-{pubkey[:16]}-{int(time.time() * 1000)}",
                            'slot': slot,
                            'block_time': int(time.time())
                        }
                        self._process_event(event)
                        logger.info(f"[SKR] gRPC: New stake {parsed['staked_amount']:,.0f} SKR by {parsed['wallet'][:8]}...")
                    self._current_accounts[pubkey] = parsed

            # Update staker count
            self._total_stakers = len(set(p['wallet'] for p in self._current_accounts.values()))

    def get_stats(self) -> Dict:
        """Return current stats dict (for REST API)."""
        return {
            'total_staked': self._total_staked,
            'total_stakers': self._total_stakers,
            'circulating_supply': self._circulating_supply,
            'supply_pct_staked': round((self._total_staked / self._circulating_supply) * 100, 2) if self._total_staked > 0 and self._circulating_supply > 0 else 0,
            'is_running': self._running,
            'recent_events_count': len(self._recent_events),
            'account_size': self._account_size,
            'grpc_active': self._stream_manager is not None,
            'grpc_account_updates': self._grpc_account_updates,
        }

    # ─── Polling Loop ────────────────────────────────────────────────────

    def _poll_loop(self):
        """Main polling loop - fetches all staking accounts periodically.

        When gRPC is active, the full getProgramAccounts poll runs every
        10 minutes as reconciliation (not primary detection). Share price,
        vault balance, and circulating supply continue on their normal timers.
        """
        GRPC_RECONCILE_INTERVAL = 600  # 10 minutes when gRPC is active
        poll_interval = POLL_INTERVAL

        logger.info("[SKR] Polling loop started")
        while self._running:
            try:
                self._fetch_share_price()
                self._fetch_vault_balance()
                self._fetch_circulating_supply()
                self._fetch_all_staking_accounts()
                self._maybe_take_snapshot()
                self._update_whale_leaderboard()
                self._broadcast_stats()
            except Exception as e:
                logger.error(f"[SKR] Poll error: {e}", exc_info=True)

            # Use longer interval if gRPC is delivering account updates
            if self._stream_manager and self._grpc_account_updates > 0:
                poll_interval = GRPC_RECONCILE_INTERVAL
            else:
                poll_interval = POLL_INTERVAL

            time.sleep(poll_interval)

    def _fetch_share_price(self):
        """Fetch the current share price from the 193-byte config account."""
        try:
            accounts = self.helius.rpc.get_program_accounts(
                SKR_PROGRAM_ID,
                encoding="base64",
                filters=[{"dataSize": 193}]
            )
            if accounts:
                raw = base64.b64decode(accounts[0]['account']['data'][0])
                if len(raw) >= 144:
                    raw_price = struct.unpack('<Q', raw[136:144])[0]
                    self._share_price = raw_price // SKR_SHARE_SCALE
                    logger.debug(f"[SKR] Share price: {self._share_price} ({self._share_price / 1e9:.6f})")
        except Exception as e:
            logger.warning(f"[SKR] Share price fetch error: {e}")

    def _fetch_circulating_supply(self):
        """Fetch circulating supply from CoinGecko (throttled to every 10 min)."""
        now = time.time()
        if now - self._circ_supply_time < CIRC_SUPPLY_INTERVAL:
            return
        self._circ_supply_time = now
        try:
            from urllib.request import urlopen, Request
            import json as _json
            url = 'https://api.coingecko.com/api/v3/coins/seeker?localization=false&tickers=false&community_data=false&developer_data=false'
            req = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'TacTix/1.0'})
            with urlopen(req, timeout=15) as resp:
                body = _json.loads(resp.read().decode())
            circ = body.get('market_data', {}).get('circulating_supply')
            if circ and circ > 0:
                self._circulating_supply = circ
                logger.info(f"[SKR] Circulating supply: {self._circulating_supply:,.0f} SKR")
            else:
                logger.warning(f"[SKR] CoinGecko returned no circulating_supply")
        except Exception as e:
            logger.warning(f"[SKR] Circulating supply fetch error: {e}")

    def _fetch_vault_balance(self):
        """Fetch actual vault token balance as ground truth for total staked."""
        try:
            result = self.helius.rpc._make_request(
                'getTokenLargestAccounts', [SKR_TOKEN_MINT]
            )
            holders = result.get('value', [])
            if holders:
                vault_raw = int(holders[0]['amount'])
                self._total_staked = vault_raw / (10 ** SKR_TOKEN_DECIMALS)
                logger.info(f"[SKR] Vault balance: {self._total_staked:,.0f} SKR")
        except Exception as e:
            logger.warning(f"[SKR] Vault balance fetch error: {e}")

    def _fetch_all_staking_accounts(self):
        """
        Call getProgramAccounts on the SKR staking program.
        Parse account data to extract staked amounts per wallet.
        """
        try:
            filters = []
            # If we've discovered the account size, filter by it to reduce payload
            if self._account_size:
                filters = [{"dataSize": self._account_size}]

            accounts = self.helius.rpc.get_program_accounts(
                SKR_PROGRAM_ID,
                encoding="base64",
                filters=filters
            )

            if not accounts:
                logger.debug("[SKR] No accounts returned from getProgramAccounts")
                return

            new_accounts = {}

            for acct in accounts:
                pubkey = acct.get('pubkey', '')
                account_data = acct.get('account', {})
                data_arr = account_data.get('data', [])

                if not data_arr or len(data_arr) < 1:
                    continue

                raw = base64.b64decode(data_arr[0]) if isinstance(data_arr[0], str) else data_arr[0]

                # Only parse 169-byte staking accounts (skip config/state accounts)
                if len(raw) != 169:
                    continue

                # Discover account size on first successful parse
                if self._account_size is None:
                    self._account_size = 169
                    logger.info(f"[SKR] Staking account size: {self._account_size} bytes")

                parsed = self._parse_stake_account(raw)
                if parsed and parsed['staked_amount'] > 0:
                    new_accounts[pubkey] = parsed

            # Detect changes by comparing with previous state
            self._detect_changes(new_accounts)

            with self._lock:
                self._current_accounts = new_accounts
                # total_staked comes from _fetch_vault_balance (ground truth)
                self._total_stakers = len(set(p['wallet'] for p in new_accounts.values()))

            logger.info(f"[SKR] Poll: {self._total_staked:,.0f} SKR staked by {self._total_stakers} wallets ({len(new_accounts)} accounts)")

        except Exception as e:
            logger.error(f"[SKR] Fetch error: {e}", exc_info=True)

    def _shares_to_tokens(self, raw_shares: int) -> float:
        """Convert raw shares (scaled by 256) to token UI amount."""
        shares = raw_shares / SKR_SHARE_SCALE
        return shares * self._share_price / 1e9 / (10 ** SKR_TOKEN_DECIMALS)

    def _parse_stake_account(self, data: bytes) -> Optional[Dict]:
        """
        Parse the binary account data from the SKR staking program.

        Verified Anchor account layout (169 bytes):
        - [0:8]     discriminator (8 bytes)
        - [8:40]    pool/config pubkey (32 bytes) - same for all accounts
        - [40:72]   owner wallet (32 bytes)
        - [72:104]  guardian/delegate pubkey (32 bytes)
        - [104:112] shares (u64, scaled by 256) — NOT raw token amount
        - [112:120] reserved (u64)
        - [120:128] share price at deposit (u64, scaled by 256)
        - [128:168] remaining fields
        - [168]     status byte

        Token amount = (shares / 256) * current_share_price / 1e9 / 1e6
        """
        if len(data) < 112:
            return None

        try:
            # Skip discriminator (8 bytes) + pool pubkey (32 bytes)
            offset = 40

            # Owner wallet (32 bytes)
            wallet_bytes = data[offset:offset + 32]
            try:
                from solders.pubkey import Pubkey
                wallet = str(Pubkey.from_bytes(wallet_bytes))
            except Exception:
                wallet = wallet_bytes.hex()
            offset += 32  # now at 72

            # Guardian pubkey (32 bytes)
            guardian_name = None
            if offset + 32 <= len(data):
                guardian_bytes = data[offset:offset + 32]
                try:
                    guardian_key = str(Pubkey.from_bytes(guardian_bytes))
                    guardian_name = GUARDIAN_NAMES.get(guardian_key, guardian_key[:8] + '...')
                except Exception:
                    pass
                offset += 32  # now at 104

            # Shares (u64, scaled by 256)
            if offset + 8 > len(data):
                return None
            raw_shares = struct.unpack('<Q', data[offset:offset + 8])[0]
            staked_amount = self._shares_to_tokens(raw_shares)
            offset += 8  # now at 112

            return {
                'wallet': wallet,
                'staked_amount': staked_amount,
                'raw_shares': raw_shares,
                'guardian_name': guardian_name,
            }

        except Exception as e:
            logger.debug(f"[SKR] Parse error: {e}")
            return None

    def _detect_changes(self, new_accounts: Dict):
        """Compare new accounts snapshot with previous to detect stake/unstake events."""
        if not self._current_accounts:
            # First poll - don't generate events for existing state
            return

        old_keys = set(self._current_accounts.keys())
        new_keys = set(new_accounts.keys())

        # New stake accounts
        for key in new_keys - old_keys:
            acct = new_accounts[key]
            event = {
                'event_type': 'stake',
                'wallet_address': acct['wallet'],
                'amount': acct['staked_amount'],
                'guardian': acct.get('guardian_name'),
                'signature': f"poll-new-{key[:16]}-{int(time.time())}",
                'slot': 0,
                'block_time': int(time.time())
            }
            self._process_event(event)

        # Closed stake accounts (unstake completed)
        for key in old_keys - new_keys:
            acct = self._current_accounts[key]
            event = {
                'event_type': 'unstake',
                'wallet_address': acct['wallet'],
                'amount': acct['staked_amount'],
                'guardian': acct.get('guardian_name'),
                'signature': f"poll-close-{key[:16]}-{int(time.time())}",
                'slot': 0,
                'block_time': int(time.time())
            }
            self._process_event(event)

        # Changed amounts (partial stake/unstake)
        for key in old_keys & new_keys:
            old_amt = self._current_accounts[key]['staked_amount']
            new_amt = new_accounts[key]['staked_amount']
            delta = new_amt - old_amt
            if abs(delta) > 0.001:
                event = {
                    'event_type': 'stake' if delta > 0 else 'unstake',
                    'wallet_address': new_accounts[key]['wallet'],
                    'amount': abs(delta),
                    'guardian': new_accounts[key].get('guardian_name'),
                    'signature': f"poll-delta-{key[:16]}-{int(time.time())}",
                    'slot': 0,
                    'block_time': int(time.time())
                }
                self._process_event(event)

    def _process_event(self, event: Dict):
        """Save event to DB, add to in-memory buffer, and broadcast via Socket.IO."""
        try:
            self.db.save_skr_staking_event(event)
        except Exception as e:
            logger.warning(f"[SKR] DB save error: {e}")

        with self._lock:
            self._recent_events.insert(0, event)
            if len(self._recent_events) > MAX_EVENTS_CACHE:
                self._recent_events = self._recent_events[:MAX_EVENTS_CACHE]

        # Broadcast individual event in real-time
        try:
            sio_bridge.emit('staking_event', event, namespace='/skr')
        except Exception as e:
            logger.debug(f"[SKR] Emit error: {e}")

    def _maybe_take_snapshot(self):
        """Take a snapshot every SNAPSHOT_INTERVAL seconds."""
        now = time.time()
        if now - self._last_snapshot_time < SNAPSHOT_INTERVAL:
            return

        try:
            snapshots = self.db.get_skr_staking_snapshots(limit=1)
            prev_total = snapshots[-1]['total_staked'] if snapshots else 0
            net_change = self._total_staked - prev_total

            self.db.save_skr_staking_snapshot(
                total_staked=self._total_staked,
                total_stakers=self._total_stakers,
                net_change=net_change
            )
            self._last_snapshot_time = now
            logger.info(f"[SKR] Snapshot: {self._total_staked:,.0f} SKR by {self._total_stakers} wallets (delta: {net_change:+,.0f})")
        except Exception as e:
            logger.error(f"[SKR] Snapshot error: {e}")

    def _update_whale_leaderboard(self):
        """Refresh the whale leaderboard cache."""
        now = time.time()
        if now - self._whale_cache_time < WHALE_CACHE_TTL:
            return
        try:
            self._whale_cache = self.db.get_skr_whale_leaderboard(limit=50)
            self._whale_cache_time = now
        except Exception as e:
            logger.error(f"[SKR] Whale cache error: {e}")

    def _broadcast_stats(self):
        """Emit current stats to all connected /skr clients."""
        try:
            sio_bridge.emit('stats_update', {
                'total_staked': self._total_staked,
                'total_stakers': self._total_stakers,
                'circulating_supply': self._circulating_supply,
                'supply_pct_staked': round((self._total_staked / self._circulating_supply) * 100, 2) if self._total_staked > 0 and self._circulating_supply > 0 else 0,
                'timestamp': time.time()
            }, namespace='/skr')
        except Exception as e:
            logger.debug(f"[SKR] Broadcast error: {e}")

    # ─── WebSocket Listener ──────────────────────────────────────────────

    def _run_ws_listener(self):
        """Run async WebSocket subscription for real-time detection."""
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._ws_subscribe())
        except Exception as e:
            logger.error(f"[SKR] WS listener exited: {e}")

    async def _ws_subscribe(self):
        """Subscribe to SKR staking program account changes via WebSocket."""
        while self._running:
            try:
                ws = self.helius.ws()
                async with ws:
                    await ws.subscribe_program(
                        SKR_PROGRAM_ID,
                        callback=self._handle_ws_notification,
                        encoding="base64"
                    )
                    logger.info("[SKR] WebSocket subscribed to staking program")
                    await ws.run(reconnect=True)

            except Exception as e:
                logger.warning(f"[SKR] WebSocket error: {e}, reconnecting in 10s")
                if self._running:
                    await asyncio.sleep(10)

    def _handle_ws_notification(self, data: Dict):
        """Handle real-time program account change notification."""
        try:
            pubkey = ''
            account_data = data.get('value', {}).get('account', data.get('account', {}))
            data_arr = account_data.get('data', [])

            if not data_arr:
                return

            raw = base64.b64decode(data_arr[0]) if isinstance(data_arr[0], str) else data_arr[0]
            parsed = self._parse_stake_account(raw)

            if parsed:
                # Check if this is a known account
                with self._lock:
                    existing = self._current_accounts.get(pubkey)
                    if existing:
                        old_amt = existing['staked_amount']
                        new_amt = parsed['staked_amount']
                        delta = new_amt - old_amt
                        if abs(delta) > 0.001:
                            event = {
                                'event_type': 'stake' if delta > 0 else 'unstake',
                                'wallet_address': parsed['wallet'],
                                'amount': abs(delta),
                                'guardian': parsed.get('guardian_name'),
                                'signature': f"ws-{int(time.time() * 1000)}",
                                'slot': data.get('slot', 0),
                                'block_time': int(time.time())
                            }
                            self._process_event(event)
                            # Update in-memory
                            self._current_accounts[pubkey] = parsed

        except Exception as e:
            logger.debug(f"[SKR] WS notification parse error: {e}")
