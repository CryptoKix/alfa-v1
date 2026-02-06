"""
EndpointManager — Multi-location endpoint failover for Shyft + Helius.

Manages ordered endpoint pools for each protocol (RPC, WS, gRPC, RabbitStream).
Tracks consecutive failures per-endpoint; after FAIL_THRESHOLD failures, promotes
the next healthy endpoint. A background health monitor probes degraded primaries
and auto-recovers them when healthy again.

Failover chain:
  RPC/WS:  Shyft AMS → Shyft FRA
  gRPC:    Shyft EU  → Shyft AMS
  Rabbit:  Shyft AMS → Shyft FRA
"""

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import List, Optional

import requests

logger = logging.getLogger("endpoint_mgr")
logger.setLevel(logging.INFO)

FAIL_THRESHOLD = 2       # consecutive failures before demotion
PROBE_INTERVAL = 15.0    # seconds between health probes
PROBE_TIMEOUT = 3.0      # seconds for health probe RPC call
RECOVERY_PROBES = 2      # consecutive successful probes before promotion


@dataclass
class Endpoint:
    """Single endpoint with health tracking."""
    url: str
    label: str
    healthy: bool = True
    consecutive_failures: int = 0
    consecutive_recovery_probes: int = 0
    total_failures: int = 0
    total_successes: int = 0
    last_failure_time: float = 0.0
    last_success_time: float = 0.0


class EndpointPool:
    """Ordered list of endpoints for a single protocol."""

    def __init__(self, protocol: str, endpoints: List[Endpoint]):
        self.protocol = protocol
        self.endpoints = endpoints
        self._lock = threading.Lock()

    def get_active(self) -> Optional[str]:
        """Return the URL of the first healthy endpoint, or the first endpoint if all unhealthy."""
        with self._lock:
            for ep in self.endpoints:
                if ep.healthy:
                    return ep.url
            # All unhealthy — return first (best hope)
            return self.endpoints[0].url if self.endpoints else None

    def get_active_label(self) -> str:
        """Return the label of the currently active endpoint."""
        with self._lock:
            for ep in self.endpoints:
                if ep.healthy:
                    return ep.label
            return self.endpoints[0].label if self.endpoints else "none"

    def report_success(self):
        """Report a successful call to the active endpoint."""
        with self._lock:
            for ep in self.endpoints:
                if ep.healthy:
                    ep.consecutive_failures = 0
                    ep.total_successes += 1
                    ep.last_success_time = time.time()
                    return

    def report_failure(self) -> bool:
        """Report a failed call. Returns True if endpoint was demoted."""
        with self._lock:
            for ep in self.endpoints:
                if ep.healthy:
                    ep.consecutive_failures += 1
                    ep.total_failures += 1
                    ep.last_failure_time = time.time()
                    if ep.consecutive_failures >= FAIL_THRESHOLD:
                        ep.healthy = False
                        next_ep = self._next_healthy_unlocked()
                        next_label = next_ep.label if next_ep else "none"
                        logger.warning(
                            f"[EndpointMgr] {self.protocol} endpoint DEMOTED: "
                            f"{ep.label} → failover to {next_label} "
                            f"(after {ep.consecutive_failures} consecutive failures)"
                        )
                        return True
                    return False
            return False

    def _next_healthy_unlocked(self) -> Optional[Endpoint]:
        """Find next healthy endpoint (caller holds lock)."""
        for ep in self.endpoints:
            if ep.healthy:
                return ep
        return None

    def get_status(self) -> list:
        """Return status info for all endpoints."""
        with self._lock:
            return [
                {
                    "url": ep.url,
                    "label": ep.label,
                    "healthy": ep.healthy,
                    "consecutive_failures": ep.consecutive_failures,
                    "total_failures": ep.total_failures,
                    "total_successes": ep.total_successes,
                    "active": ep.healthy and all(
                        not prev.healthy for prev in self.endpoints[:i]
                    ) if ep.healthy else False,
                }
                for i, ep in enumerate(self.endpoints)
            ]

    def get_degraded_primaries(self) -> List[Endpoint]:
        """Return non-first endpoints that are active because earlier ones failed."""
        with self._lock:
            return [ep for ep in self.endpoints if not ep.healthy]

    def promote(self, ep: Endpoint):
        """Mark an endpoint as healthy again (recovered)."""
        with self._lock:
            ep.healthy = True
            ep.consecutive_failures = 0
            ep.consecutive_recovery_probes = 0
            logger.info(
                f"[EndpointMgr] {self.protocol} endpoint RECOVERED: {ep.label} — promoted back to active pool"
            )


class EndpointManager:
    """
    Singleton managing multi-location endpoint failover.

    Implements TactixService protocol: start()/stop()/is_running()
    """

    def __init__(self, config):
        self._pools: dict[str, EndpointPool] = {}
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._config = config

        # Build endpoint pools from config
        self._build_pools(config)

    def _build_pools(self, cfg):
        """Initialize endpoint pools from config module."""
        # RPC pool: Shyft AMS → Shyft FRA
        rpc_eps = []
        if getattr(cfg, 'SHYFT_RPC_PRIMARY', ''):
            rpc_eps.append(Endpoint(url=cfg.SHYFT_RPC_PRIMARY, label="Shyft AMS"))
        if getattr(cfg, 'SHYFT_RPC_SECONDARY', ''):
            rpc_eps.append(Endpoint(url=cfg.SHYFT_RPC_SECONDARY, label="Shyft FRA"))
        if rpc_eps:
            self._pools['rpc'] = EndpointPool('rpc', rpc_eps)

        # WS pool: Shyft AMS → Shyft FRA
        ws_eps = []
        if getattr(cfg, 'SHYFT_WS_PRIMARY', ''):
            ws_eps.append(Endpoint(url=cfg.SHYFT_WS_PRIMARY, label="Shyft AMS"))
        if getattr(cfg, 'SHYFT_WS_SECONDARY', ''):
            ws_eps.append(Endpoint(url=cfg.SHYFT_WS_SECONDARY, label="Shyft FRA"))
        if ws_eps:
            self._pools['ws'] = EndpointPool('ws', ws_eps)

        # gRPC pool: Shyft EU → Shyft AMS (no Helius equivalent)
        grpc_eps = []
        if getattr(cfg, 'SHYFT_GRPC_PRIMARY', ''):
            grpc_eps.append(Endpoint(url=cfg.SHYFT_GRPC_PRIMARY, label="Shyft EU"))
        if getattr(cfg, 'SHYFT_GRPC_SECONDARY', ''):
            grpc_eps.append(Endpoint(url=cfg.SHYFT_GRPC_SECONDARY, label="Shyft AMS"))
        if grpc_eps:
            self._pools['grpc'] = EndpointPool('grpc', grpc_eps)

        # RabbitStream pool: Shyft AMS → Shyft FRA (no Helius equivalent)
        rabbit_eps = []
        if getattr(cfg, 'SHYFT_RABBIT_PRIMARY', ''):
            rabbit_eps.append(Endpoint(url=cfg.SHYFT_RABBIT_PRIMARY, label="Shyft AMS"))
        if getattr(cfg, 'SHYFT_RABBIT_SECONDARY', ''):
            rabbit_eps.append(Endpoint(url=cfg.SHYFT_RABBIT_SECONDARY, label="Shyft FRA"))
        if rabbit_eps:
            self._pools['rabbit'] = EndpointPool('rabbit', rabbit_eps)

    # ─── Public API ───────────────────────────────────────────────────

    def get_rpc_url(self) -> str:
        """Get the current best RPC endpoint URL."""
        pool = self._pools.get('rpc')
        return pool.get_active() if pool else self._config.SOLANA_RPC

    def get_ws_url(self) -> str:
        """Get the current best WebSocket endpoint URL."""
        pool = self._pools.get('ws')
        return pool.get_active() if pool else ""

    def get_grpc_endpoint(self) -> str:
        """Get the current best gRPC endpoint."""
        pool = self._pools.get('grpc')
        return pool.get_active() if pool else self._config.SHYFT_GRPC_PRIMARY

    def get_rabbit_endpoint(self) -> str:
        """Get the current best RabbitStream endpoint."""
        pool = self._pools.get('rabbit')
        return pool.get_active() if pool else self._config.SHYFT_RABBIT_PRIMARY

    def report_success(self, protocol: str):
        """Report a successful call on a protocol."""
        pool = self._pools.get(protocol)
        if pool:
            pool.report_success()

    def report_failure(self, protocol: str) -> bool:
        """Report a failed call. Returns True if failover was triggered."""
        pool = self._pools.get(protocol)
        if pool:
            return pool.report_failure()
        return False

    # ─── Service Protocol ─────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._health_monitor_loop, daemon=True, name="endpoint-health")
        self._thread.start()

        # Log initial state
        for proto, pool in self._pools.items():
            labels = [ep.label for ep in pool.endpoints]
            logger.info(f"[EndpointMgr] {proto}: {' → '.join(labels)}")
        logger.info("[EndpointMgr] Started — health monitor active")

    def stop(self):
        self._running = False
        logger.info("[EndpointMgr] Stopped")

    def is_running(self) -> bool:
        return self._running

    # ─── Health Monitor ───────────────────────────────────────────────

    def _health_monitor_loop(self):
        """Periodically probe demoted endpoints to detect recovery."""
        while self._running:
            time.sleep(PROBE_INTERVAL)
            if not self._running:
                break
            self._probe_degraded_endpoints()

    def _probe_degraded_endpoints(self):
        """Probe all demoted endpoints with a getSlot RPC call."""
        for proto, pool in self._pools.items():
            for ep in pool.get_degraded_primaries():
                if proto in ('rpc', 'ws'):
                    # Probe RPC endpoints with getSlot
                    probe_url = ep.url
                    if proto == 'ws':
                        # Convert WS URL to HTTP for probing
                        probe_url = ep.url.replace('wss://', 'https://').replace('ws://', 'http://')
                    success = self._probe_rpc(probe_url)
                elif proto == 'grpc':
                    # For gRPC, we probe via a simple RPC check on the corresponding
                    # Shyft HTTP endpoint (same location, different protocol)
                    success = self._probe_grpc_via_rpc(ep)
                elif proto == 'rabbit':
                    # RabbitStream — probe via corresponding RPC endpoint
                    success = self._probe_grpc_via_rpc(ep)
                else:
                    continue

                if success:
                    ep.consecutive_recovery_probes += 1
                    if ep.consecutive_recovery_probes >= RECOVERY_PROBES:
                        pool.promote(ep)
                else:
                    ep.consecutive_recovery_probes = 0

    def _probe_rpc(self, url: str) -> bool:
        """Send a getSlot RPC call to probe endpoint health."""
        try:
            resp = requests.post(
                url,
                json={"jsonrpc": "2.0", "id": 1, "method": "getSlot"},
                timeout=PROBE_TIMEOUT,
            )
            if resp.status_code == 200:
                result = resp.json()
                if "result" in result and isinstance(result["result"], int):
                    return True
        except Exception:
            pass
        return False

    def _probe_grpc_via_rpc(self, ep: Endpoint) -> bool:
        """Probe gRPC/Rabbit endpoints by hitting the corresponding Shyft RPC.

        If the RPC at that location works, we assume gRPC/Rabbit is likely back too.
        """
        # Map endpoint labels to RPC probe URLs
        label_to_rpc = {
            "Shyft EU": f"https://rpc.ams.shyft.to?api_key={self._config.SHYFT_API_KEY}",
            "Shyft AMS": f"https://rpc.ams.shyft.to?api_key={self._config.SHYFT_API_KEY}",
            "Shyft FRA": f"https://rpc.fra.shyft.to?api_key={self._config.SHYFT_API_KEY}",
        }
        probe_url = label_to_rpc.get(ep.label)
        if not probe_url or not self._config.SHYFT_API_KEY:
            return False
        return self._probe_rpc(probe_url)

    # ─── Status ───────────────────────────────────────────────────────

    def get_status(self) -> dict:
        """Return full endpoint health state for Control Panel."""
        return {
            proto: {
                "active": pool.get_active_label(),
                "endpoints": pool.get_status(),
            }
            for proto, pool in self._pools.items()
        }


# ─── Module-level singleton ──────────────────────────────────────────
_instance: Optional[EndpointManager] = None


def get_endpoint_manager(config=None) -> EndpointManager:
    """Get or create the global EndpointManager singleton."""
    global _instance
    if _instance is None:
        if config is None:
            import config as _config
            config = _config
        _instance = EndpointManager(config)
    return _instance
