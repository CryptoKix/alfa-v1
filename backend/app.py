#!/usr/bin/env python3
"""Main entry point for SolanaAutoTrade."""
import eventlet
eventlet.monkey_patch()

import logging
import signal
import sys
from flask import request, render_template, jsonify

# Configure logging
logging.basicConfig(level=logging.INFO, format='[%(asctime)s.%(msecs)03d] [%(levelname)s] %(name)s: %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger("tactix")

from config import SERVER_HOST, SERVER_PORT, WALLET_ADDRESS, HELIUS_API_KEY, BASE_DIR
from extensions import create_app, socketio, helius, db
from routes import api_bp, copytrade_bp, wallet_bp, yield_bp, dlmm_bp, liquidity_bp, skr_bp, register_websocket_handlers, init_dlmm_services, init_liquidity_services
from routes.arb import arb_bp
from routes.services import services_bp
from routes.auth import auth_bp
from middleware.auth import init_auth
from middleware.rate_limit import init_rate_limiter, add_rate_limit_headers
from services.audit import audit_logger, AuditEventType
from services.network_monitor import network_monitor
from services.portfolio import PortfolioService
from arb_engine import ArbEngine
from services.bots import BotSchedulerService
from services.trading import execute_trade_logic
from copy_trader import CopyTraderEngine
from services.notifications import send_discord_notification, notify_system_status
from services.sniper import sniper_engine
from services.news import news_service
from services.wolfpack import wolf_pack
from services.meteora_dlmm import init_dlmm_sniper, get_dlmm_sniper
from services.blockhash_cache import get_blockhash_cache
from services.skr_staking import SKRStakingService
from services.shyft_stream import ShyftStreamManager
from service_registry import registry, ServiceDescriptor as SD

# Create Flask application
app = create_app()

# Clear any stale is_processing flags from previous runs
db.clear_stale_processing_flags()

# SECURITY: Initialize authentication middleware (defense in depth)
init_auth(app, BASE_DIR)

# SECURITY: Initialize rate limiter
init_rate_limiter(app)

# SECURITY: Add rate limit headers to all responses
@app.after_request
def after_request_rate_limit(response):
    return add_rate_limit_headers(response)

# Register blueprints
app.register_blueprint(auth_bp)  # Auth routes first
app.register_blueprint(api_bp)
app.register_blueprint(copytrade_bp)
app.register_blueprint(arb_bp)
app.register_blueprint(services_bp)
app.register_blueprint(wallet_bp)
app.register_blueprint(yield_bp)
app.register_blueprint(dlmm_bp)
app.register_blueprint(liquidity_bp)
app.register_blueprint(skr_bp)

# Initialize DLMM services with socketio
init_dlmm_services(socketio)

# Initialize unified Liquidity services with socketio
init_liquidity_services(socketio)

# Register WebSocket handlers
register_websocket_handlers()

# SPA Fallback
@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({"error": "Not Found"}), 404
    return render_template('index.html')

# ─── Service Registration ─────────────────────────────────────────────
import config as _config

registry.register(
    SD("copy_trader", "Copy Trader", "Whale wallet tracking via Helius WebSocket",
       "Users", "cyan", needs_stream="set_stream_manager"),
    CopyTraderEngine(helius, db, socketio, execute_trade_logic))

registry.register(
    SD("arb_engine", "Arb Scanner", "Cross-DEX spread detection",
       "TrendingUp", "green"),
    ArbEngine(helius, db, socketio))

registry.register(
    SD("wolf_pack", "Wolf Pack", "Whale consensus trading",
       "Crosshair", "purple"),
    wolf_pack)

registry.register(
    SD("news", "Intel Feed", "News & social aggregation",
       "Newspaper", "pink"),
    news_service)

registry.register(
    SD("dlmm_sniper", "DLMM Sniper", "Meteora pool detection",
       "Layers", "purple"),
    init_dlmm_sniper(db, socketio, HELIUS_API_KEY))

registry.register(
    SD("network_monitor", "Network Monitor", "Security surveillance & alerts",
       "Shield", "cyan"),
    network_monitor)

registry.register(
    SD("skr_staking", "SKR Staking Monitor", "SKR staking event tracking",
       "Lock", "cyan", needs_stream="set_stream_manager"),
    SKRStakingService(helius, db, socketio))

registry.register(
    SD("shyft_stream", "Shyft gRPC Stream", "Yellowstone gRPC + RabbitStream real-time feeds",
       "Radio", "green"),
    ShyftStreamManager(_config))

registry.register(
    SD("portfolio", "Portfolio Tracker", "Balance polling & broadcast",
       "Wallet", "cyan", toggleable=False, auto_start=True,
       needs_stream="set_stream_manager"),
    PortfolioService(app))

registry.register(
    SD("bot_scheduler", "Bot Scheduler", "DCA/TWAP/Grid bot execution",
       "Bot", "purple", toggleable=False, auto_start=True),
    BotSchedulerService(app))


def handle_shutdown(signum, frame):
    """Graceful shutdown handler for Discord notification."""
    logger.info(f"Received signal {signum}. Shutting down...")
    try:
        registry.stop_all()
    except:
        pass
    try:
        notify_system_status("OFFLINE", "TacTix.sol System Core is shutting down.")
    except:
        pass
    sys.exit(0)

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

if __name__ == '__main__':
    # Start blockhash cache for low-latency arb execution
    blockhash_cache = get_blockhash_cache()
    blockhash_cache.set_stream_manager(registry.get('shyft_stream'))
    logger.info("BlockhashCache initialized for low-latency transactions")

    # Wire gRPC stream into all services that declared needs_stream
    registry.set_stream_manager(registry.get('shyft_stream'))

    # Start Shyft gRPC streams (after all subscriptions are registered)
    registry.get('shyft_stream').start()

    # Auto-start core services (portfolio, bot_scheduler)
    registry.start_all(auto_only=True)

    # High-RPS modules - DO NOT auto-start
    # These are now controlled via /api/services endpoints and ControlPanel UI:
    # - copy_trader (Helius WebSocket)
    # - arb_engine (Jupiter quote polling)
    # - wolf_pack (signal scanning)
    # - news_service (RSS/API polling)
    #
    # Users can enable them via the ControlPanel widget when needed.

    # Defer notification until after eventlet hub starts (avoid blocking before socketio.run)
    eventlet.spawn_after(2, notify_system_status, "ONLINE", "TacTix.sol System Core has initialized. Services await manual activation.")

    # SECURITY: Log system startup
    audit_logger.log_system_start()

    socketio.run(
        app,
        host=SERVER_HOST,
        port=SERVER_PORT,
        debug=False,
        allow_unsafe_werkzeug=True
    )
