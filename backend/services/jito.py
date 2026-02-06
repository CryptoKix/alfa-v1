import os
import json
import requests
import base64
import logging
import time
import threading
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import transfer, TransferParams
from solders.transaction import VersionedTransaction
from solders.message import MessageV0
from config import KEYPAIR, BASE_DIR

logger = logging.getLogger("jito")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Jito Whitelisted Keypair — used to sign tip transactions for authenticated
# bundle inclusion.  Falls back to main KEYPAIR if not found.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JITO_KEYPAIR: Optional[Keypair] = None
JITO_KEYPAIR_PATH = os.path.join(BASE_DIR, "jito_keypair.json")

try:
    with open(JITO_KEYPAIR_PATH, "r") as f:
        _jito_kp_data = json.load(f)
    JITO_KEYPAIR = Keypair.from_bytes(_jito_kp_data)
    logger.info(f"Loaded Jito whitelisted wallet: {JITO_KEYPAIR.pubkey()}")
except FileNotFoundError:
    logger.warning("jito_keypair.json not found — tip txns will use main wallet (unauthenticated)")
except Exception as e:
    logger.error(f"Failed to load jito_keypair.json: {e} — tip txns will use main wallet")

# Module-level executor for parallel Jito submissions
_jito_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix='jito')

# Jito Block Engine Endpoints
JITO_ENDPOINTS = [
    "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
]

# Jito Tip Floor API
JITO_TIP_FLOOR_URL = "https://bundles.jito.wtf/api/v1/bundles/tip_floor"

# Jito Tip Accounts
JITO_TIP_ACCOUNTS = [
    "96gWu9sjJJcc9wGvBk9SshLeWvAeCQGZvS9dg9yrGU4G",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyMvGrnC7AByELoUzrFP4Wniw1Y8JGuEGUZBPTio",
    "ADaUMid9yfUytqMBqkh6AqnvT4vBNpZpS7UngeatWhpY",
    "DfXygSm4jCyvG8UMEXrS8qXobJuUn2js5qR2pbtqyAg8",
    "ADuUkR4vqMvS2ri6bcSCCKcYsyR8niSpsUSSM91YQYzZ",
    "DttWaMuVvTiduGmq2hpWyDHJDsSNTwd2NoTuMaw79asz",
    "3AVi9Tg9Uo68tJfuAWMwoIrKVw5S9uBjsJAnatS8ipAn",
]

# Tip floor defaults (lamports) — used when API is unavailable
DEFAULT_TIP_LAMPORTS = 50_000          # 0.00005 SOL
MIN_TIP_LAMPORTS = 1_000              # Jito absolute minimum
MAX_TIP_LAMPORTS = 5_000_000          # 0.005 SOL cap — don't overpay

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Dynamic Tip Floor Cache
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class TipFloorCache:
    """
    Cached Jito tip floor data.

    Polls the Jito tip_floor REST API every ~10 seconds in a background thread.
    Consumers read cached values with zero latency via get_optimal_tip().
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._data: Optional[dict] = None
        self._last_fetch: float = 0
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self.CACHE_TTL = 10  # seconds

    def start(self):
        """Start background polling thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True, name="jito-tip-floor")
        self._thread.start()
        logger.info("💰 Jito tip floor cache started (10s poll)")

    def stop(self):
        self._running = False

    def _poll_loop(self):
        """Background poll loop — fetches tip floor every CACHE_TTL seconds."""
        while self._running:
            try:
                self._fetch_tip_floor()
            except Exception as e:
                logger.debug(f"Tip floor fetch error: {e}")
            time.sleep(self.CACHE_TTL)

    def _fetch_tip_floor(self):
        """Fetch current tip floor from Jito REST API."""
        resp = requests.get(JITO_TIP_FLOOR_URL, timeout=3)
        resp.raise_for_status()
        data = resp.json()
        # API returns a list with one element
        if isinstance(data, list) and len(data) > 0:
            data = data[0]
        with self._lock:
            self._data = data
            self._last_fetch = time.time()

    def get_tip_floor(self) -> Optional[dict]:
        """Return cached tip floor data, or None if stale/unavailable."""
        with self._lock:
            if self._data and (time.time() - self._last_fetch) < self.CACHE_TTL * 3:
                return dict(self._data)
        return None

    def get_optimal_tip(self, percentile: str = "75th", user_min_lamports: int = 0) -> int:
        """
        Return the optimal Jito tip in lamports.

        Args:
            percentile: Which percentile to target.
                "50th" — median, cheapest competitive option
                "75th" — default, good balance of cost vs inclusion speed
                "95th" — aggressive, near-guaranteed fast inclusion
            user_min_lamports: User-configured minimum tip (from sniper settings).
                               The returned tip will be at least this value.

        Returns:
            Tip amount in lamports, clamped to [MIN_TIP_LAMPORTS, MAX_TIP_LAMPORTS].
        """
        floor = self.get_tip_floor()

        if floor:
            key_map = {
                "25th": "landed_tips_25th_percentile",
                "50th": "landed_tips_50th_percentile",
                "75th": "landed_tips_75th_percentile",
                "95th": "landed_tips_95th_percentile",
                "99th": "landed_tips_99th_percentile",
                "ema50": "ema_landed_tips_50th_percentile",
            }
            key = key_map.get(percentile, "landed_tips_75th_percentile")
            tip_sol = floor.get(key, 0)
            tip_lamports = int(tip_sol * 1e9)
        else:
            tip_lamports = DEFAULT_TIP_LAMPORTS

        # Enforce user minimum
        tip_lamports = max(tip_lamports, user_min_lamports)

        # Clamp to safety bounds
        tip_lamports = max(tip_lamports, MIN_TIP_LAMPORTS)
        tip_lamports = min(tip_lamports, MAX_TIP_LAMPORTS)

        return tip_lamports

    def get_status(self) -> dict:
        """Return cache status for diagnostics / Control Panel."""
        floor = self.get_tip_floor()
        if floor:
            return {
                "available": True,
                "age_s": round(time.time() - self._last_fetch, 1),
                "p50_lamports": int(floor.get("landed_tips_50th_percentile", 0) * 1e9),
                "p75_lamports": int(floor.get("landed_tips_75th_percentile", 0) * 1e9),
                "p95_lamports": int(floor.get("landed_tips_95th_percentile", 0) * 1e9),
                "ema50_lamports": int(floor.get("ema_landed_tips_50th_percentile", 0) * 1e9),
            }
        return {"available": False, "fallback_lamports": DEFAULT_TIP_LAMPORTS}


# Module-level singleton
tip_floor_cache = TipFloorCache()


def get_random_tip_account():
    import random
    return JITO_TIP_ACCOUNTS[random.randint(0, len(JITO_TIP_ACCOUNTS) - 1)]

def _post_jito_endpoint(endpoint: str, payload: dict) -> dict:
    """POST bundle to a single Jito endpoint."""
    try:
        response = requests.post(endpoint, json=payload, timeout=5)
        return {"endpoint": endpoint, "status": response.status_code, "data": response.json()}
    except Exception as e:
        return {"endpoint": endpoint, "error": str(e)}


def send_jito_bundle(transactions_b64: List[str]) -> List[dict]:
    """Send a bundle to all Jito endpoints in parallel, return early on first HTTP 200."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendBundle",
        "params": [transactions_b64]
    }

    futures = {
        _jito_executor.submit(_post_jito_endpoint, ep, payload): ep
        for ep in JITO_ENDPOINTS
    }

    results = []
    for future in as_completed(futures):
        result = future.result()
        results.append(result)
        if result.get("status") == 200:
            logger.info(f"Jito bundle accepted by {result['endpoint']}")
            # Cancel remaining futures (best-effort)
            for f in futures:
                f.cancel()
            return results

    return results

def build_tip_transaction(tip_amount_lamports: int, recent_blockhash):
    """Build a VersionedTransaction (V0) that sends a tip to a random Jito tip account.

    Uses the Jito whitelisted keypair if available so Jito can identify us as
    an authenticated sender for priority bundle inclusion.  Falls back to the
    main execution wallet if jito_keypair.json is missing.
    """
    signer = JITO_KEYPAIR or KEYPAIR
    if not signer:
        return None

    tip_account = Pubkey.from_string(get_random_tip_account())
    sender = signer.pubkey()

    ix = transfer(TransferParams(
        from_pubkey=sender,
        to_pubkey=tip_account,
        lamports=tip_amount_lamports
    ))

    msg = MessageV0.try_compile(
        payer=sender,
        instructions=[ix],
        address_lookup_table_accounts=[],
        recent_blockhash=recent_blockhash,
    )
    tx = VersionedTransaction(msg, [signer])

    return base64.b64encode(bytes(tx)).decode("utf-8")
