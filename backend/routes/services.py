#!/usr/bin/env python3
"""Service control API routes for on-demand module activation."""
from flask import Blueprint, jsonify, request
from services.blockhash_cache import get_blockhash_cache

services_bp = Blueprint('services', __name__)

# Service references - set by app.py after initialization
_copy_trader = None
_arb_engine = None
_wolf_pack = None
_news_service = None
_dlmm_sniper = None
_network_monitor = None
_skr_staking = None

def init_services(copy_trader, arb_engine, wolf_pack, news_service, dlmm_sniper=None, network_monitor=None, skr_staking=None):
    """Initialize service references from app.py"""
    global _copy_trader, _arb_engine, _wolf_pack, _news_service, _dlmm_sniper, _network_monitor, _skr_staking
    _copy_trader = copy_trader
    _arb_engine = arb_engine
    _wolf_pack = wolf_pack
    _news_service = news_service
    _dlmm_sniper = dlmm_sniper
    _network_monitor = network_monitor
    _skr_staking = skr_staking

SERVICE_MAP = {
    'copy_trader': lambda: _copy_trader,
    'arb_engine': lambda: _arb_engine,
    'wolf_pack': lambda: _wolf_pack,
    'news': lambda: _news_service,
    'dlmm_sniper': lambda: _dlmm_sniper,
    'network_monitor': lambda: _network_monitor,
    'skr_staking': lambda: _skr_staking
}

SERVICE_INFO = {
    'copy_trader': {
        'name': 'Copy Trader',
        'description': 'Whale wallet tracking via Helius WebSocket',
        'icon': 'Users',
        'color': 'cyan'
    },
    'arb_engine': {
        'name': 'Arb Scanner',
        'description': 'Cross-DEX spread detection',
        'icon': 'TrendingUp',
        'color': 'green'
    },
    'wolf_pack': {
        'name': 'Wolf Pack',
        'description': 'Whale consensus trading',
        'icon': 'Crosshair',
        'color': 'purple'
    },
    'news': {
        'name': 'Intel Feed',
        'description': 'News & social aggregation',
        'icon': 'Newspaper',
        'color': 'pink'
    },
    'dlmm_sniper': {
        'name': 'DLMM Sniper',
        'description': 'Meteora pool detection',
        'icon': 'Layers',
        'color': 'purple'
    },
    'network_monitor': {
        'name': 'Network Monitor',
        'description': 'Security surveillance & alerts',
        'icon': 'Shield',
        'color': 'cyan'
    },
    'skr_staking': {
        'name': 'SKR Staking Monitor',
        'description': 'SKR staking event tracking',
        'icon': 'Lock',
        'color': 'cyan'
    }
}


@services_bp.route('/api/services/status', methods=['GET'])
def get_services_status():
    """Get status of all toggleable services."""
    statuses = {}
    for key, getter in SERVICE_MAP.items():
        try:
            service = getter()
            is_running = False
            if service is not None:
                is_running = service.is_running()
            statuses[key] = {
                **SERVICE_INFO.get(key, {}),
                'running': is_running,
                'initialized': service is not None
            }
        except Exception as e:
            print(f"Error getting status for {key}: {e}")
            statuses[key] = {
                **SERVICE_INFO.get(key, {}),
                'running': False,
                'initialized': False,
                'error': str(e)
            }
    return jsonify(statuses)


@services_bp.route('/api/services/<service_name>/toggle', methods=['POST'])
def toggle_service(service_name):
    """Toggle a service on/off."""
    if service_name not in SERVICE_MAP:
        return jsonify({'error': f'Unknown service: {service_name}'}), 404

    service = SERVICE_MAP[service_name]()
    if not service:
        return jsonify({'error': f'Service not initialized: {service_name}'}), 500

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
    if service_name not in SERVICE_MAP:
        return jsonify({'error': f'Unknown service: {service_name}'}), 404

    service = SERVICE_MAP[service_name]()
    if not service:
        return jsonify({'error': f'Service not initialized: {service_name}'}), 500

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
    if service_name not in SERVICE_MAP:
        return jsonify({'error': f'Unknown service: {service_name}'}), 404

    service = SERVICE_MAP[service_name]()
    if not service:
        return jsonify({'error': f'Service not initialized: {service_name}'}), 500

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
