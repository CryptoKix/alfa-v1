#!/usr/bin/env python3
"""Service control API routes for on-demand module activation."""
import threading
import time
import logging
import os
import socket as _socket

from flask import Blueprint, jsonify, request
from services.blockhash_cache import get_blockhash_cache
from service_registry import registry

logger = logging.getLogger("services_route")

services_bp = Blueprint('services', __name__)

# ─── Background Health Cache ─────────────────────────────────────────
_health_cache = {
    'meteora_sidecar': {'status': 'unknown', 'response_ms': None, 'port': 5002, 'checked_at': 0},
    'orca_sidecar': {'status': 'unknown', 'response_ms': None, 'port': 5003, 'checked_at': 0},
    'sniper_outrider': {'status': 'unknown', 'checked_at': 0},
}
_health_lock = threading.Lock()
_health_thread_started = False


def _probe_sidecar(port: int):
    """Probe a sidecar via raw TCP connect (eventlet-safe, no requests lib)."""
    try:
        start = time.monotonic()
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
        s.settimeout(1)
        s.connect(('127.0.0.1', port))
        s.close()
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return ('running', elapsed_ms)
    except Exception:
        return ('stopped', None)


def _probe_process(pattern: str):
    """Check if a process matching pattern is running (eventlet-safe, no subprocess)."""
    try:
        for pid in os.listdir('/proc'):
            if not pid.isdigit():
                continue
            try:
                with open(f'/proc/{pid}/cmdline', 'rb') as f:
                    cmdline = f.read().decode('utf-8', errors='ignore')
                if pattern in cmdline:
                    return 'running'
            except (PermissionError, FileNotFoundError, ProcessLookupError):
                continue
        return 'stopped'
    except Exception:
        return 'unknown'


def _health_probe_loop():
    """Background loop that probes sidecars + processes every 10s."""
    import eventlet
    while True:
        # Sidecars
        for name in ('meteora_sidecar', 'orca_sidecar'):
            port = _health_cache[name]['port']
            status, ms = _probe_sidecar(port)
            with _health_lock:
                _health_cache[name]['status'] = status
                _health_cache[name]['response_ms'] = ms
                _health_cache[name]['checked_at'] = time.time()

        # Sniper outrider process check
        status = _probe_process("sniper_outrider.py")
        with _health_lock:
            _health_cache['sniper_outrider']['status'] = status
            _health_cache['sniper_outrider']['checked_at'] = time.time()

        eventlet.sleep(10)


def _ensure_health_thread():
    """Start the background health probe as an eventlet greenthread."""
    global _health_thread_started
    if not _health_thread_started:
        _health_thread_started = True
        import eventlet
        eventlet.spawn(_health_probe_loop)


@services_bp.route('/api/services/status', methods=['GET'])
def get_services_status():
    """Get status of all toggleable services."""
    return jsonify(registry.get_all_status())


@services_bp.route('/api/services/<service_name>/toggle', methods=['POST'])
def toggle_service(service_name):
    """Toggle a service on/off."""
    service = registry.get(service_name)
    if service is None:
        return jsonify({'error': f'Unknown service: {service_name}'}), 404

    try:
        if service.is_running():
            service.stop()
            action = 'stopped'
        else:
            service.start()
            action = 'started'

        return jsonify({
            'success': True,
            'service': service_name,
            'action': action,
            'running': service.is_running()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@services_bp.route('/api/services/<service_name>/start', methods=['POST'])
def start_service(service_name):
    """Start a specific service."""
    service = registry.get(service_name)
    if service is None:
        return jsonify({'error': f'Unknown service: {service_name}'}), 404

    try:
        if not service.is_running():
            service.start()
        return jsonify({
            'success': True,
            'service': service_name,
            'running': service.is_running()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@services_bp.route('/api/services/<service_name>/stop', methods=['POST'])
def stop_service(service_name):
    """Stop a specific service."""
    service = registry.get(service_name)
    if service is None:
        return jsonify({'error': f'Unknown service: {service_name}'}), 404

    try:
        if service.is_running():
            service.stop()
        return jsonify({
            'success': True,
            'service': service_name,
            'running': service.is_running()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@services_bp.route('/api/services/blockhash/stats', methods=['GET'])
def get_blockhash_stats():
    """Get blockhash cache statistics for monitoring latency."""
    try:
        cache = get_blockhash_cache()
        return jsonify(cache.get_stats())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@services_bp.route('/api/services/shyft_stream/stats', methods=['GET'])
def get_shyft_stream_stats():
    """Get Shyft gRPC stream connection statistics."""
    try:
        service = registry.get('shyft_stream')
        if not service:
            return jsonify({'error': 'Shyft stream not initialized'}), 500
        return jsonify(service.get_stats())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─── Combined Monitor Endpoint ──────────────────────────────────────

@services_bp.route('/api/services/monitor', methods=['GET'])
def get_monitor_data():
    """Combined monitoring endpoint — never blocks on HTTP.

    Returns system_services, trading_modules, blockhash, shyft, and sidecar
    health from background cache.
    """
    _ensure_health_thread()

    # 1) System services — all reads from cache or in-memory, no blocking
    import extensions
    system_services = []
    svc_defs = [
        {"id": "backend", "name": "Backend API", "description": "Flask API & Socket.IO server", "port": 5001, "log_file": "backend/server.log"},
        {"id": "price_server", "name": "Price Server", "description": "Real-time price feed updates", "port": None, "log_file": "backend/price_server.log"},
        {"id": "sniper_outrider", "name": "Sniper Outrider", "description": "New token discovery scanner", "port": None, "log_file": "backend/sniper_outrider.log"},
        {"id": "meteora_sidecar", "name": "Meteora Sidecar", "description": "DLMM SDK transaction builder", "port": 5002, "log_file": "backend/meteora_sidecar.log"},
        {"id": "orca_sidecar", "name": "Orca Sidecar", "description": "Whirlpools SDK transaction builder", "port": 5003, "log_file": "backend/meteora_sidecar/orca_sidecar.log"},
    ]

    for svc in svc_defs:
        status = "unknown"
        try:
            if svc["id"] == "backend":
                status = "running"
            elif svc["id"] == "price_server":
                status = "running" if (time.time() - extensions.last_price_update) < 15 else "stopped"
            elif svc["id"] in _health_cache:
                with _health_lock:
                    status = _health_cache[svc["id"]]["status"]
        except Exception:
            status = "error"
        system_services.append({**svc, "status": status, "last_log": ""})

    # 2) Trading modules from registry
    trading_modules = registry.get_all_status()

    # 3) Blockhash cache stats
    blockhash = {}
    try:
        cache = get_blockhash_cache()
        blockhash = cache.get_stats()
    except Exception:
        pass

    # 4) Shyft stream stats
    shyft = {}
    try:
        svc = registry.get('shyft_stream')
        if svc:
            shyft = svc.get_stats()
    except Exception:
        pass

    # 5) Sidecar latency from cache
    with _health_lock:
        sidecars = {k: dict(v) for k, v in _health_cache.items() if 'port' in v}

    return jsonify({
        'system_services': system_services,
        'trading_modules': trading_modules,
        'blockhash': blockhash,
        'shyft': shyft,
        'sidecars': sidecars,
        'timestamp': time.time(),
    })
