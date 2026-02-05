#!/usr/bin/env python3
"""SKR Staking Dashboard API routes and Socket.IO handlers."""
import time
from flask import Blueprint, jsonify, request
import sio_bridge
from extensions import db
from service_registry import registry

skr_bp = Blueprint('skr', __name__)


def get_skr_service():
    return registry.get('skr_staking')


# ─── REST Endpoints ──────────────────────────────────────────────────────


@skr_bp.route('/api/skr/stats')
def api_skr_stats():
    """Get current staking statistics."""
    service = get_skr_service()
    if service:
        stats = service.get_stats()
    else:
        stats = {
            'total_staked': 0,
            'total_stakers': 0,
            'supply_pct_staked': 0,
            'is_running': False,
            'recent_events_count': 0,
        }
    return jsonify({'success': True, 'data': stats, 'timestamp': time.time()})


@skr_bp.route('/api/skr/events')
def api_skr_events():
    """Get recent staking events with optional filters."""
    limit = request.args.get('limit', 100, type=int)
    event_type = request.args.get('type')
    wallet = request.args.get('wallet')
    events = db.get_skr_staking_events(limit=limit, event_type=event_type, wallet=wallet)
    return jsonify({'success': True, 'events': events, 'timestamp': time.time()})


@skr_bp.route('/api/skr/snapshots')
def api_skr_snapshots():
    """Get historical staking snapshots for charting."""
    period = request.args.get('period', '7d')
    period_map = {'4h': 1, '24h': 6, '7d': 42, '30d': 180}
    limit = period_map.get(period, 42)
    snapshots = db.get_skr_staking_snapshots(limit=limit)
    return jsonify({'success': True, 'snapshots': snapshots, 'period': period, 'timestamp': time.time()})


@skr_bp.route('/api/skr/whales')
def api_skr_whales():
    """Get whale leaderboard (top stakers by net staked)."""
    limit = request.args.get('limit', 50, type=int)
    whales = db.get_skr_whale_leaderboard(limit=limit)
    return jsonify({'success': True, 'whales': whales, 'timestamp': time.time()})


# Socket.IO handlers for skr namespace are registered in main.py
