#!/usr/bin/env python3
"""
Network Security Monitor for TacTix
Monitors network connections and alerts on suspicious activity.
"""

import os
import time
import json
import socket
import logging
import requests
from datetime import datetime
from collections import defaultdict
from typing import Set, Dict, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('logs/network_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('network_monitor')

# Configuration
MONITOR_INTERVAL = int(os.getenv('NETWORK_MONITOR_INTERVAL', '30'))  # seconds
DISCORD_WEBHOOK = os.getenv('DISCORD_SYSTEM_WEBHOOK_URL', '')
ALERT_COOLDOWN = 300  # 5 minutes between repeat alerts

# Ports we're monitoring (TacTix services)
MONITORED_PORTS = {5001, 5002, 5003, 5173}

# Whitelisted IPs (localhost variants)
WHITELISTED_IPS = {'127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'}

# Track alerts to avoid spam
last_alerts: Dict[str, float] = {}
connection_history: List[Dict] = []


def get_connections() -> List[Dict]:
    """Get current network connections using /proc/net."""
    connections = []

    try:
        # Parse TCP connections from /proc/net/tcp and /proc/net/tcp6
        for proto, path in [('tcp', '/proc/net/tcp'), ('tcp6', '/proc/net/tcp6')]:
            if not os.path.exists(path):
                continue

            with open(path, 'r') as f:
                lines = f.readlines()[1:]  # Skip header

            for line in lines:
                parts = line.split()
                if len(parts) < 10:
                    continue

                # Parse local address
                local_addr = parts[1]
                local_ip, local_port = parse_addr(local_addr, proto == 'tcp6')

                # Parse remote address
                remote_addr = parts[2]
                remote_ip, remote_port = parse_addr(remote_addr, proto == 'tcp6')

                # State (0A = LISTEN, 01 = ESTABLISHED, etc.)
                state = int(parts[3], 16)
                state_name = get_state_name(state)

                if local_port in MONITORED_PORTS:
                    connections.append({
                        'proto': proto,
                        'local_ip': local_ip,
                        'local_port': local_port,
                        'remote_ip': remote_ip,
                        'remote_port': remote_port,
                        'state': state_name,
                        'timestamp': datetime.now().isoformat()
                    })

    except Exception as e:
        logger.error(f"Error reading connections: {e}")

    return connections


def parse_addr(addr: str, is_ipv6: bool = False) -> tuple:
    """Parse address from /proc/net format."""
    ip_hex, port_hex = addr.split(':')
    port = int(port_hex, 16)

    if is_ipv6:
        # IPv6 address parsing
        if ip_hex == '00000000000000000000000000000000':
            ip = '::'
        elif ip_hex == '00000000000000000000FFFF00000000'[::-1]:
            ip = '::ffff:0.0.0.0'
        else:
            # Reverse bytes and format as IPv6
            try:
                bytes_rev = bytes.fromhex(ip_hex)
                ip = socket.inet_ntop(socket.AF_INET6, bytes_rev[::-1])
            except:
                ip = ip_hex
    else:
        # IPv4 address (little-endian)
        ip = '.'.join(str(int(ip_hex[i:i+2], 16)) for i in range(6, -1, -2))

    return ip, port


def get_state_name(state: int) -> str:
    """Convert TCP state number to name."""
    states = {
        0x01: 'ESTABLISHED',
        0x02: 'SYN_SENT',
        0x03: 'SYN_RECV',
        0x04: 'FIN_WAIT1',
        0x05: 'FIN_WAIT2',
        0x06: 'TIME_WAIT',
        0x07: 'CLOSE',
        0x08: 'CLOSE_WAIT',
        0x09: 'LAST_ACK',
        0x0A: 'LISTEN',
        0x0B: 'CLOSING'
    }
    return states.get(state, f'UNKNOWN({state})')


def is_suspicious(conn: Dict) -> bool:
    """Check if a connection is suspicious."""
    remote_ip = conn['remote_ip']
    state = conn['state']

    # LISTEN and localhost connections are fine
    if state == 'LISTEN':
        return False

    # Check if remote IP is whitelisted
    if remote_ip in WHITELISTED_IPS:
        return False

    # 0.0.0.0 means no connection
    if remote_ip == '0.0.0.0' or remote_ip == '::':
        return False

    # Any established connection from non-localhost is suspicious
    if state == 'ESTABLISHED':
        return True

    return False


def send_alert(title: str, message: str, level: str = 'warning'):
    """Send alert via Discord webhook."""
    if not DISCORD_WEBHOOK:
        logger.warning("Discord webhook not configured, can't send alert")
        return

    # Check cooldown
    alert_key = f"{title}:{message[:50]}"
    now = time.time()
    if alert_key in last_alerts:
        if now - last_alerts[alert_key] < ALERT_COOLDOWN:
            return
    last_alerts[alert_key] = now

    colors = {'info': 3447003, 'warning': 16776960, 'critical': 16711680}

    payload = {
        "embeds": [{
            "title": f"🛡️ Security Alert: {title}",
            "description": message,
            "color": colors.get(level, 16776960),
            "timestamp": datetime.utcnow().isoformat(),
            "footer": {"text": "TacTix Network Monitor"}
        }]
    }

    try:
        requests.post(DISCORD_WEBHOOK, json=payload, timeout=10)
        logger.info(f"Alert sent: {title}")
    except Exception as e:
        logger.error(f"Failed to send alert: {e}")


def check_port_bindings(connections: List[Dict]) -> List[str]:
    """Check if any monitored ports are exposed externally."""
    issues = []

    for conn in connections:
        if conn['state'] == 'LISTEN':
            local_ip = conn['local_ip']
            port = conn['local_port']

            # Check if bound to 0.0.0.0 (all interfaces)
            if local_ip == '0.0.0.0' or local_ip == '::':
                issues.append(f"Port {port} is exposed on all interfaces!")

    return issues


def monitor_loop():
    """Main monitoring loop."""
    logger.info("=" * 50)
    logger.info("TacTix Network Monitor Started")
    logger.info(f"Monitoring ports: {MONITORED_PORTS}")
    logger.info(f"Check interval: {MONITOR_INTERVAL}s")
    logger.info("=" * 50)

    suspicious_seen: Set[str] = set()

    while True:
        try:
            connections = get_connections()

            # Check for exposed ports
            binding_issues = check_port_bindings(connections)
            for issue in binding_issues:
                logger.warning(f"⚠️ {issue}")
                send_alert("Exposed Port Detected", issue, 'critical')

            # Check for suspicious connections
            for conn in connections:
                if is_suspicious(conn):
                    conn_key = f"{conn['remote_ip']}:{conn['remote_port']}->{conn['local_port']}"

                    if conn_key not in suspicious_seen:
                        suspicious_seen.add(conn_key)

                        msg = (
                            f"**Suspicious connection detected!**\n"
                            f"• Remote: `{conn['remote_ip']}:{conn['remote_port']}`\n"
                            f"• Local Port: `{conn['local_port']}`\n"
                            f"• State: `{conn['state']}`\n"
                            f"• Time: `{conn['timestamp']}`"
                        )
                        logger.warning(f"🚨 Suspicious: {conn_key}")
                        send_alert("Suspicious Connection", msg, 'critical')

                        # Log to history
                        connection_history.append(conn)
                        if len(connection_history) > 1000:
                            connection_history.pop(0)

            # Log healthy status periodically
            listen_ports = [c['local_port'] for c in connections if c['state'] == 'LISTEN']
            logger.debug(f"Healthy - Listening on ports: {listen_ports}")

        except Exception as e:
            logger.error(f"Monitor error: {e}")

        time.sleep(MONITOR_INTERVAL)


def main():
    """Entry point."""
    # Ensure logs directory exists
    os.makedirs('logs', exist_ok=True)

    # Initial check
    logger.info("Performing initial security check...")
    connections = get_connections()

    # Report current state
    listen_conns = [c for c in connections if c['state'] == 'LISTEN']
    logger.info(f"Found {len(listen_conns)} listening ports:")
    for conn in listen_conns:
        binding = "localhost" if conn['local_ip'] in WHITELISTED_IPS or conn['local_ip'].startswith('127.') else "ALL INTERFACES ⚠️"
        logger.info(f"  Port {conn['local_port']}: {binding}")

    # Check for issues
    issues = check_port_bindings(connections)
    if issues:
        logger.warning("⚠️ Security issues found:")
        for issue in issues:
            logger.warning(f"  - {issue}")
        send_alert("Startup Security Check", "\n".join(issues), 'warning')
    else:
        logger.info("✅ All ports properly bound to localhost")

    # Start monitoring
    monitor_loop()


if __name__ == '__main__':
    main()
