#!/usr/bin/env python3
"""WebSocket (SocketIO) event handlers for SolanaAutoTrade."""
import json
from datetime import datetime
from flask_socketio import emit

from extensions import db, socketio
from services.portfolio import broadcast_balance
from routes.copytrade import get_formatted_targets


def register_websocket_handlers():
    """Register all SocketIO event handlers."""

    @socketio.on('connect', namespace='/prices')
    def handle_prices_connect():
        pass

    @socketio.on('request_balance', namespace='/portfolio')
    def handle_bal_req():
        print("DEBUG: Received request_balance from client")
        broadcast_balance()

    @socketio.on('request_bots', namespace='/bots')
    def handle_bots_req():
        from services.bots import get_formatted_bots
        emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

    @socketio.on('request_history', namespace='/history')
    def handle_history_req(data=None):
        wallet = data.get('wallet') if data else None
        emit('history_update', {'history': db.get_history(50, wallet_address=wallet)}, namespace='/history')

    @socketio.on('request_targets', namespace='/copytrade')
    def handle_targets_req():
        emit('targets_update', {'targets': get_formatted_targets()}, namespace='/copytrade')

    @socketio.on('request_signals', namespace='/copytrade')
    def handle_signals_req():
        signals = db.get_signals(50)
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
        emit('signals_update', {'signals': signals}, namespace='/copytrade')
