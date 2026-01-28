#!/usr/bin/env python3
"""Main entry point for SolanaAutoTrade."""
import eventlet
eventlet.monkey_patch()

import os
import threading
import logging
import signal
import sys
from flask import request, render_template, jsonify

# Configure logging
logging.basicConfig(level=logging.INFO, format='[%(asctime)s.%(msecs)03d] [%(levelname)s] %(name)s: %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger("tactix")

from config import SERVER_HOST, SERVER_PORT, WALLET_ADDRESS, HELIUS_API_KEY
from extensions import create_app, socketio, helius, db
from routes import api_bp, copytrade_bp, wallet_bp, yield_bp, dlmm_bp, register_websocket_handlers, init_dlmm_services
from routes.arb import arb_bp, set_arb_engine
from routes.copytrade import set_copy_trader
from routes.services import services_bp, init_services  # Service control routes
from services.portfolio import balance_poller, broadcast_balance
from arb_engine import ArbEngine
from services.bots import dca_scheduler
from services.trading import execute_trade_logic
from copy_trader import CopyTraderEngine
from services.notifications import send_discord_notification, notify_system_status
from services.sniper import sniper_engine
from services.news import news_service
from services.wolfpack import wolf_pack
from services.meteora_dlmm import init_dlmm_sniper, get_dlmm_sniper

# Create Flask application
app = create_app()

# Clear any stale is_processing flags from previous runs
db.clear_stale_processing_flags()

# Issue 17: Initialize rate limiter

# Register blueprints
app.register_blueprint(api_bp)
app.register_blueprint(copytrade_bp)
app.register_blueprint(arb_bp)
app.register_blueprint(services_bp)
app.register_blueprint(wallet_bp)
app.register_blueprint(yield_bp)
app.register_blueprint(dlmm_bp)

# Initialize DLMM services with socketio
init_dlmm_services(socketio)

# Register WebSocket handlers
register_websocket_handlers()

# SPA Fallback
@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({"error": "Not Found"}), 404
    return render_template('index.html')

# Initialize engines (but don't auto-start high-RPS modules)
copy_trader = CopyTraderEngine(helius, db, socketio, execute_trade_logic)
arb_engine = ArbEngine(helius, db, socketio)
set_arb_engine(arb_engine)
set_copy_trader(copy_trader)

# Initialize DLMM sniper (detection-only by default)
dlmm_sniper = init_dlmm_sniper(db, socketio, HELIUS_API_KEY)

# Initialize service control references
init_services(copy_trader, arb_engine, wolf_pack, news_service, dlmm_sniper)

def handle_shutdown(signum, frame):
    """Graceful shutdown handler for Discord notification."""
    logger.info(f"🛑 Received signal {signum}. Shutting down...")
    try:
        notify_system_status("OFFLINE", "TacTix.sol System Core is shutting down.")
    except:
        pass
    sys.exit(0)

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

if __name__ == '__main__':
    # Core services - always run
    threading.Thread(target=dca_scheduler, args=(app,), daemon=True).start()
    threading.Thread(target=balance_poller, args=(app,), daemon=True).start()

    # High-RPS modules - DO NOT auto-start
    # These are now controlled via /api/services endpoints and ControlPanel UI:
    # - copy_trader (Helius WebSocket)
    # - arb_engine (Jupiter quote polling)
    # - wolf_pack (signal scanning)
    # - news_service (RSS/API polling)
    #
    # Users can enable them via the ControlPanel widget when needed.

    notify_system_status("ONLINE", "TacTix.sol System Core has initialized. Services await manual activation.")

    socketio.run(
        app,
        host=SERVER_HOST,
        port=SERVER_PORT,
        debug=False,
        allow_unsafe_werkzeug=True
    )