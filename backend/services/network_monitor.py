#!/usr/bin/env python3
"""
Network Security Monitor Service for TacTix
Monitors network connections and alerts on suspicious activity.
"""

import os
import time
import socket
import logging
import threading
import requests
from datetime import datetime
from typing import Set, Dict, List, Optional

logger = logging.getLogger('network_monitor')

# Configuration
MONITOR_INTERVAL = int(os.getenv('NETWORK_MONITOR_INTERVAL', '30'))
DISCORD_WEBHOOK = os.getenv('DISCORD_SYSTEM_WEBHOOK_URL', '')
ALERT_COOLDOWN = 300  # 5 minutes between repeat alerts

# Ports we're monitoring (TacTix services)
MONITORED_PORTS = {5001, 5002, 5003, 5173}

# Whitelisted IPs (localhost variants)
WHITELISTED_IPS = {'127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'}


class NetworkMonitor:
    """Network security monitoring service."""

    def __init__(self):
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_alerts: Dict[str, float] = {}
        self._suspicious_seen: Set[str] = set()
        self._connection_history: List[Dict] = []
        self._stats = {
            'checks': 0,
            'suspicious_connections': 0,
            'alerts_sent': 0,
            'last_check': None
        }

    def is_running(self) -> bool:
        return self._running and self._thread is not None and self._thread.is_alive()

    def start(self):
        """Start the network monitor."""
        if self.is_running():
            logger.warning("Network monitor already running")
            return

        self._running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        logger.info("Network monitor started")

    def stop(self):
        """Stop the network monitor."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        logger.info("Network monitor stopped")

    def get_stats(self) -> Dict:
        """Get monitoring statistics."""
        return {
            **self._stats,
            'running': self.is_running(),
            'suspicious_seen': len(self._suspicious_seen),
            'history_size': len(self._connection_history)
        }

    def get_current_connections(self) -> List[Dict]:
        """Get current monitored connections."""
        return self._get_connections()

    def _monitor_loop(self):
        """Main monitoring loop."""
        logger.info(f"Monitoring ports: {MONITORED_PORTS}, interval: {MONITOR_INTERVAL}s")

        while self._running:
            try:
                connections = self._get_connections()
                self._stats['checks'] += 1
                self._stats['last_check'] = datetime.now().isoformat()

                # Check for exposed ports
                for issue in self._check_port_bindings(connections):
                    logger.warning(f"⚠️ {issue}")
                    self._send_alert("Exposed Port Detected", issue, 'critical')

                # Check for suspicious connections
                for conn in connections:
                    if self._is_suspicious(conn):
                        conn_key = f"{conn['remote_ip']}:{conn['remote_port']}->{conn['local_port']}"

                        if conn_key not in self._suspicious_seen:
                            self._suspicious_seen.add(conn_key)
                            self._stats['suspicious_connections'] += 1

                            msg = (
                                f"**Suspicious connection detected!**\n"
                                f"• Remote: `{conn['remote_ip']}:{conn['remote_port']}`\n"
                                f"• Local Port: `{conn['local_port']}`\n"
                                f"• State: `{conn['state']}`"
                            )
                            logger.warning(f"🚨 Suspicious: {conn_key}")
                            self._send_alert("Suspicious Connection", msg, 'critical')

                            self._connection_history.append(conn)
                            if len(self._connection_history) > 1000:
                                self._connection_history.pop(0)

            except Exception as e:
                logger.error(f"Monitor error: {e}")

            # Sleep in small intervals to allow quick shutdown
            for _ in range(MONITOR_INTERVAL):
                if not self._running:
                    break
                time.sleep(1)

    def _get_connections(self) -> List[Dict]:
        """Get current network connections."""
        connections = []

        for proto, path in [('tcp', '/proc/net/tcp'), ('tcp6', '/proc/net/tcp6')]:
            if not os.path.exists(path):
                continue

            try:
                with open(path, 'r') as f:
                    lines = f.readlines()[1:]

                for line in lines:
                    parts = line.split()
                    if len(parts) < 10:
                        continue

                    local_ip, local_port = self._parse_addr(parts[1], proto == 'tcp6')
                    remote_ip, remote_port = self._parse_addr(parts[2], proto == 'tcp6')
                    state = self._get_state_name(int(parts[3], 16))

                    if local_port in MONITORED_PORTS:
                        connections.append({
                            'proto': proto,
                            'local_ip': local_ip,
                            'local_port': local_port,
                            'remote_ip': remote_ip,
                            'remote_port': remote_port,
                            'state': state,
                            'timestamp': datetime.now().isoformat()
                        })
            except Exception as e:
                logger.debug(f"Error reading {path}: {e}")

        return connections

    def _parse_addr(self, addr: str, is_ipv6: bool = False) -> tuple:
        """Parse address from /proc/net format."""
        ip_hex, port_hex = addr.split(':')
        port = int(port_hex, 16)

        if is_ipv6:
            if ip_hex == '00000000000000000000000000000000':
                ip = '::'
            else:
                try:
                    bytes_rev = bytes.fromhex(ip_hex)
                    ip = socket.inet_ntop(socket.AF_INET6, bytes_rev[::-1])
                except:
                    ip = ip_hex
        else:
            ip = '.'.join(str(int(ip_hex[i:i+2], 16)) for i in range(6, -1, -2))

        return ip, port

    def _get_state_name(self, state: int) -> str:
        """Convert TCP state number to name."""
        states = {
            0x01: 'ESTABLISHED', 0x02: 'SYN_SENT', 0x03: 'SYN_RECV',
            0x04: 'FIN_WAIT1', 0x05: 'FIN_WAIT2', 0x06: 'TIME_WAIT',
            0x07: 'CLOSE', 0x08: 'CLOSE_WAIT', 0x09: 'LAST_ACK',
            0x0A: 'LISTEN', 0x0B: 'CLOSING'
        }
        return states.get(state, f'UNKNOWN({state})')

    def _is_suspicious(self, conn: Dict) -> bool:
        """Check if a connection is suspicious."""
        remote_ip = conn['remote_ip']
        state = conn['state']

        if state == 'LISTEN':
            return False
        if remote_ip in WHITELISTED_IPS:
            return False
        if remote_ip in ('0.0.0.0', '::'):
            return False
        if state == 'ESTABLISHED':
            return True
        return False

    def _check_port_bindings(self, connections: List[Dict]) -> List[str]:
        """Check if any monitored ports are exposed externally."""
        issues = []
        for conn in connections:
            if conn['state'] == 'LISTEN':
                local_ip = conn['local_ip']
                if local_ip in ('0.0.0.0', '::'):
                    issues.append(f"Port {conn['local_port']} exposed on all interfaces!")
        return issues

    def _send_alert(self, title: str, message: str, level: str = 'warning'):
        """Send alert via Discord webhook."""
        if not DISCORD_WEBHOOK:
            return

        alert_key = f"{title}:{message[:50]}"
        now = time.time()
        if alert_key in self._last_alerts:
            if now - self._last_alerts[alert_key] < ALERT_COOLDOWN:
                return
        self._last_alerts[alert_key] = now

        colors = {'info': 3447003, 'warning': 16776960, 'critical': 16711680}

        try:
            requests.post(DISCORD_WEBHOOK, json={
                "embeds": [{
                    "title": f"🛡️ {title}",
                    "description": message,
                    "color": colors.get(level, 16776960),
                    "timestamp": datetime.utcnow().isoformat(),
                    "footer": {"text": "TacTix Network Monitor"}
                }]
            }, timeout=10)
            self._stats['alerts_sent'] += 1
        except Exception as e:
            logger.error(f"Failed to send alert: {e}")


# Singleton instance
network_monitor = NetworkMonitor()
