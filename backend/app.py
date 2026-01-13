#!/usr/bin/env python3
"""Main entry point for SolanaAutoTrade."""
import eventlet
eventlet.monkey_patch()

import os
import threading
from flask import request, render_template, jsonify

from config import SERVER_HOST, SERVER_PORT, WALLET_ADDRESS
from extensions import create_app, socketio, helius, db
from routes import api_bp, copytrade_bp, register_websocket_handlers
from routes.arb import arb_bp, set_arb_engine
from routes.copytrade import set_copy_trader
from services.portfolio import balance_poller, broadcast_balance
from arb_engine import ArbEngine
from services.bots import dca_scheduler
from services.trading import execute_trade_logic
from copy_trader import CopyTraderEngine

# Create Flask application
app = create_app()

# Register blueprints
app.register_blueprint(api_bp)
app.register_blueprint(copytrade_bp)
app.register_blueprint(arb_bp)

# Register WebSocket handlers
register_websocket_handlers()

# SPA Fallback
@app.errorhandler(404)
def not_found(e):
    # If the path starts with /api/, it's a genuine 404 for an API call
    if request.path.startswith('/api/'):
        return jsonify({"error": "Not Found"}), 404
    # Otherwise, serve the SPA entry point
    return render_template('index.html')

# Initialize copy trader engine
copy_trader = CopyTraderEngine(helius, db, socketio, execute_trade_logic)
arb_engine = ArbEngine(helius, db, socketio)
set_arb_engine(arb_engine)
set_copy_trader(copy_trader)

if __name__ == '__main__':
    # Start background tasks
    import threading
    threading.Thread(target=dca_scheduler, args=(app,), daemon=True).start()
    threading.Thread(target=balance_poller, args=(app,), daemon=True).start()
    copy_trader.start()
    arb_engine.start()

    socketio.run(
        app,
        host=SERVER_HOST,
        port=SERVER_PORT,
        debug=False,
        allow_unsafe_werkzeug=True
    )
