#!/usr/bin/env python3
"""Copy trading API routes for SolanaAutoTrade."""
import json
import time
import requests
from datetime import datetime
from flask import Blueprint, jsonify, request, current_app

from config import SOLANA_TRACKER_API_KEY
from extensions import db, socketio, helius
from service_registry import registry

copytrade_bp = Blueprint('copytrade', __name__)


def _ct():
    return registry.get('copy_trader')


def fetch_wallet_pnl(wallet_address):
    """Fetch PnL from Solana Tracker API if available."""
    if not SOLANA_TRACKER_API_KEY:
        return {}
    try:
        url = f"https://data.solanatracker.io/pnl/{wallet_address}"
        headers = {"x-api-key": SOLANA_TRACKER_API_KEY}
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code == 200:
            data = res.json()
            return {
                "total_profit_sol": data.get('totalProfit', 0),
                "win_rate": data.get('winRate', 0),
                "total_trades": data.get('totalTrades', 0)
            }
    except Exception as e:
        current_app.logger.error(f"PnL Fetch Error: {e}")
    return {}


def get_formatted_targets():
    """Get all targets with parsed JSON fields."""
    targets = db.get_all_targets()
    for t in targets:
        t['tags'] = json.loads(t.get('tags', '[]'))
        t['config'] = json.loads(t.get('config_json', '{}'))
        t['performance'] = json.loads(t.get('performance_json', '{}'))
    return targets


# --- Target Management ---

@copytrade_bp.route('/api/copytrade/targets')
def api_copytrade_targets():
    return jsonify(get_formatted_targets())


@copytrade_bp.route('/api/copytrade/targets/add', methods=['POST'])
def api_copytrade_targets_add():
    data = request.json
    performance = {}
    if SOLANA_TRACKER_API_KEY:
        performance = fetch_wallet_pnl(data['address'])

    db.save_target(
        data['address'],
        data.get('alias', 'Unnamed Whale'),
        data.get('tags', []),
        data.get('config', {"scale_factor": 0.1, "max_per_trade": 1.0}),
        performance,
        'active'
    )

    ct = _ct()
    if ct:
        ct.refresh()

    socketio.emit('targets_update', {'targets': get_formatted_targets()}, namespace='/copytrade')
    return jsonify({"success": True})


@copytrade_bp.route('/api/copytrade/targets/delete', methods=['POST'])
def api_copytrade_targets_delete():
    db.delete_target(request.json.get('address'))

    ct = _ct()
    if ct:
        ct.refresh()

    socketio.emit('targets_update', {'targets': get_formatted_targets()}, namespace='/copytrade')
    return jsonify({"success": True})


@copytrade_bp.route('/api/copytrade/targets/rename', methods=['POST'])
def api_copytrade_targets_rename():
    data = request.json
    db.update_target_alias(data.get('address'), data.get('new_alias'))
    socketio.emit('targets_update', {'targets': get_formatted_targets()}, namespace='/copytrade')
    return jsonify({"success": True})


@copytrade_bp.route('/api/copytrade/targets/update', methods=['POST'])
def api_copytrade_targets_update():
    data = request.json
    address = data.get('address')

    current = db.get_target(address)
    if not current:
        return jsonify({"error": "Target not found"}), 404

    config = data.get('config')
    if config:
        current_config = json.loads(current['config_json'])
        current_config.update(config)
        db.update_target_config(address, current_config)

    status = data.get('status')
    if status:
        db.update_target_status(address, status)

    ct = _ct()
    if ct:
        ct.refresh()

    socketio.emit('targets_update', {'targets': get_formatted_targets()}, namespace='/copytrade')
    return jsonify({"success": True})


# --- Signals & History ---

@copytrade_bp.route('/api/copytrade/signals')
def api_copytrade_signals():
    wallet = request.args.get('wallet')
    limit = int(request.args.get('limit', 50))
    signals = db.get_signals(limit, wallet)

    for s in signals:
        details = json.loads(s.pop('details_json', '{}'))
        s.update(details)
        if 'wallet_address' in s:
            s['wallet'] = s.pop('wallet_address')
        if isinstance(s['timestamp'], str):
            try:
                s['timestamp'] = datetime.strptime(s['timestamp'], '%Y-%m-%d %H:%M:%S').timestamp()
            except:
                pass

    return jsonify(signals)


@copytrade_bp.route('/api/copytrade/history/<address>')
def api_copytrade_history(address):
    try:
        signatures = helius.rpc.get_signatures_for_address(address, limit=10)
        history = []
        ct = _ct()

        for sig_info in signatures:
            sig = sig_info.get('signature')
            err = sig_info.get('err')
            block_time = sig_info.get('blockTime')

            item = {
                'signature': sig,
                'wallet': address,
                'timestamp': block_time or time.time(),
                'type': 'Failed TX' if err else 'Transaction',
                'status': 'error' if err else 'success'
            }

            if not err and ct:
                details = ct.decode_swap(sig, address)
                if details:
                    item['sent'] = details['sent']
                    item['received'] = details['received']
                    item['type'] = 'Swap'

            history.append(item)

        return jsonify(history)

    except Exception as e:
        current_app.logger.error(f"History Fetch Error: {e}")
        return jsonify([]), 500
