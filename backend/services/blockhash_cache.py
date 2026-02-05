"""
High-performance blockhash cache for low-latency transaction building.

Maintains a fresh blockhash in memory, eliminating HTTP round-trips during
time-critical operations like arbitrage execution.

Modes:
1. Fast-polling (default): Refresh every 400ms via HTTP
2. WebSocket: Subscribe to slot updates (Helius Enhanced WebSockets)
3. gRPC: Full LaserStream integration (requires proto setup)
"""

import threading
import time
import logging
import requests
import json
from typing import Optional, Tuple
from config import SOLANA_RPC, HELIUS_API_KEY, HELIUS_STAKED_RPC

logger = logging.getLogger("blockhash_cache")
logger.setLevel(logging.INFO)


class BlockhashCache:
    """Thread-safe blockhash cache with automatic refresh."""

    def __init__(self, rpc_url: str = None, refresh_interval_ms: int = 400):
        self.rpc_url = rpc_url or HELIUS_STAKED_RPC or SOLANA_RPC
        self.refresh_interval = refresh_interval_ms / 1000.0

        self._blockhash: Optional[str] = None
        self._last_valid_block_height: int = 0
        self._slot: int = 0
        self._last_update: float = 0
        self._lock = threading.Lock()

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._ws_thread: Optional[threading.Thread] = None

        # Stats
        self._fetch_count = 0
        self._cache_hits = 0

    def start(self):
        """Start the background refresh thread."""
        if self._running:
            return

        self._running = True

        # Initial fetch
        self._refresh_blockhash()

        # Start polling thread
        self._thread = threading.Thread(target=self._refresh_loop, daemon=True)
        self._thread.start()

        # Try to start WebSocket for slot notifications
        self._start_websocket()

        logger.info(f"BlockhashCache started (interval={self.refresh_interval*1000}ms)")

    def stop(self):
        """Stop the background refresh."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("BlockhashCache stopped")

    def get_blockhash(self) -> Tuple[str, int]:
        """
        Get cached blockhash instantly (no HTTP call).

        Returns:
            Tuple of (blockhash, last_valid_block_height)
        """
        with self._lock:
            self._cache_hits += 1
            return self._blockhash, self._last_valid_block_height

    def get_fresh_blockhash(self, max_age_ms: int = 1000) -> Tuple[str, int]:
        """
        Get blockhash, refreshing if stale.

        Args:
            max_age_ms: Maximum acceptable age in milliseconds

        Returns:
            Tuple of (blockhash, last_valid_block_height)
        """
        with self._lock:
            age = (time.time() - self._last_update) * 1000
            if age > max_age_ms or not self._blockhash:
                self._refresh_blockhash_locked()
            self._cache_hits += 1
            return self._blockhash, self._last_valid_block_height

    def get_slot(self) -> int:
        """Get the current slot number."""
        with self._lock:
            return self._slot

    def get_stats(self) -> dict:
        """Get cache statistics."""
        with self._lock:
            return {
                "blockhash": self._blockhash[:8] + "..." if self._blockhash else None,
                "slot": self._slot,
                "last_valid_block_height": self._last_valid_block_height,
                "age_ms": int((time.time() - self._last_update) * 1000),
                "fetch_count": self._fetch_count,
                "cache_hits": self._cache_hits,
                "hit_rate": f"{self._cache_hits / max(1, self._fetch_count + self._cache_hits) * 100:.1f}%"
            }

    def _refresh_loop(self):
        """Background thread that refreshes blockhash."""
        while self._running:
            try:
                self._refresh_blockhash()
            except Exception as e:
                logger.error(f"Blockhash refresh error: {e}")
            time.sleep(self.refresh_interval)

    def _refresh_blockhash(self):
        """Fetch fresh blockhash from RPC."""
        with self._lock:
            self._refresh_blockhash_locked()

    def _refresh_blockhash_locked(self):
        """Internal refresh (must hold lock)."""
        try:
            response = requests.post(
                self.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getLatestBlockhash",
                    "params": [{"commitment": "confirmed"}]
                },
                timeout=2
            )

            if response.status_code == 200:
                result = response.json().get("result", {}).get("value", {})
                self._blockhash = result.get("blockhash")
                self._last_valid_block_height = result.get("lastValidBlockHeight", 0)
                self._last_update = time.time()
                self._fetch_count += 1

                # Also get slot
                slot_resp = requests.post(
                    self.rpc_url,
                    json={"jsonrpc": "2.0", "id": 2, "method": "getSlot"},
                    timeout=1
                )
                if slot_resp.status_code == 200:
                    self._slot = slot_resp.json().get("result", 0)

        except Exception as e:
            logger.debug(f"Blockhash fetch failed: {e}")

    def _start_websocket(self):
        """Start WebSocket for slot notifications (Helius Enhanced WS)."""
        try:
            import websocket

            ws_url = f"wss://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"

            def on_message(ws, message):
                try:
                    data = json.loads(message)
                    if "params" in data and "result" in data["params"]:
                        result = data["params"]["result"]
                        if isinstance(result, dict) and "slot" in result:
                            with self._lock:
                                self._slot = result["slot"]
                        elif isinstance(result, int):
                            with self._lock:
                                self._slot = result
                except:
                    pass

            def on_open(ws):
                # Subscribe to slot notifications
                ws.send(json.dumps({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "slotSubscribe"
                }))
                logger.info("WebSocket slot subscription started")

            def on_error(ws, error):
                logger.debug(f"WS error: {error}")

            def on_close(ws, close_status_code, close_msg):
                logger.debug("WS closed, will rely on polling")

            def run_ws():
                while self._running:
                    try:
                        ws = websocket.WebSocketApp(
                            ws_url,
                            on_message=on_message,
                            on_open=on_open,
                            on_error=on_error,
                            on_close=on_close
                        )
                        ws.run_forever(ping_interval=30, ping_timeout=10)
                    except Exception as e:
                        logger.debug(f"WS reconnect: {e}")
                    if self._running:
                        time.sleep(5)  # Reconnect delay

            self._ws_thread = threading.Thread(target=run_ws, daemon=True)
            self._ws_thread.start()

        except ImportError:
            logger.debug("websocket-client not installed, using polling only")
        except Exception as e:
            logger.debug(f"WebSocket setup failed: {e}")


# Global singleton
_cache: Optional[BlockhashCache] = None


def get_blockhash_cache() -> BlockhashCache:
    """Get or create the global blockhash cache."""
    global _cache
    if _cache is None:
        _cache = BlockhashCache()
        _cache.start()
    return _cache


def get_blockhash() -> Tuple[str, int]:
    """Convenience function to get cached blockhash."""
    return get_blockhash_cache().get_blockhash()


def get_fresh_blockhash(max_age_ms: int = 1000) -> Tuple[str, int]:
    """Convenience function to get fresh blockhash."""
    return get_blockhash_cache().get_fresh_blockhash(max_age_ms)
