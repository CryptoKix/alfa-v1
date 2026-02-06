#!/usr/bin/env python3
"""FastAPI + python-socketio entry point for TacTix.sol."""
import asyncio
import logging
import os
import signal
import sys
import threading

# Configure logging before any imports
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s.%(msecs)03d] [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("tactix")

import socketio as python_sio
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from config import SERVER_HOST, SERVER_PORT, WALLET_ADDRESS, BASE_DIR
from extensions import db, helius, solana_client
import sio_bridge

# ─── CORS Origins ────────────────────────────────────────────────────
ALLOWED_ORIGINS = os.getenv(
    'TACTIX_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173'
).split(',')

# ─── python-socketio AsyncServer ─────────────────────────────────────
sio = python_sio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
)

# ─── FastAPI Application ─────────────────────────────────────────────
app = FastAPI(title="TacTix.sol", docs_url=None, redoc_url=None)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Security Headers Middleware ─────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ─── Auth Middleware ─────────────────────────────────────────────────
from middleware.auth import (
    AUTH_ENABLED, _is_ip_whitelisted, _serializer, _auth_token_hash,
    PUBLIC_PATHS, PUBLIC_PATH_PREFIXES, PUBLIC_EXTENSIONS,
    SESSION_EXPIRY_HOURS, IP_WHITELIST_ENABLED, IP_WHITELIST,
    init_auth as _init_auth_flask, verify_auth_token, create_session_token,
    _get_or_create_auth_token
)
from itsdangerous import BadSignature, SignatureExpired
import secrets


class AuthMiddleware(BaseHTTPMiddleware):
    """Port of Flask before_request auth check to FastAPI middleware."""

    async def dispatch(self, request: Request, call_next):
        # Always set defaults
        request.state.authenticated = False
        request.state.auth_method = None
        request.state.session_data = None

        if not AUTH_ENABLED:
            request.state.authenticated = True
            return await call_next(request)

        # IP whitelist check (localhost bypass)
        client_ip = self._get_client_ip(request)
        if IP_WHITELIST_ENABLED and self._is_ip_local(client_ip):
            request.state.authenticated = True
            request.state.auth_method = 'ip_whitelist'
            return await call_next(request)

        path = request.url.path

        # Public paths
        if path in PUBLIC_PATHS:
            return await call_next(request)
        if any(path.startswith(prefix) for prefix in PUBLIC_PATH_PREFIXES):
            return await call_next(request)
        if any(path.endswith(ext) for ext in PUBLIC_EXTENSIONS):
            return await call_next(request)

        # Check session cookie
        session_token = request.cookies.get('tactix_session')
        if not session_token:
            if path.startswith('/api/'):
                return JSONResponse(
                    {'error': 'Authentication required', 'code': 'AUTH_REQUIRED'},
                    status_code=401
                )
            return await call_next(request)

        # Validate session
        if _serializer:
            try:
                data = _serializer.loads(session_token, max_age=SESSION_EXPIRY_HOURS * 3600)
                request.state.authenticated = True
                request.state.session_data = data
            except SignatureExpired:
                if path.startswith('/api/'):
                    return JSONResponse(
                        {'error': 'Session expired', 'code': 'SESSION_EXPIRED'},
                        status_code=401
                    )
            except BadSignature:
                if path.startswith('/api/'):
                    return JSONResponse(
                        {'error': 'Invalid session', 'code': 'INVALID_SESSION'},
                        status_code=401
                    )

        return await call_next(request)

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        forwarded = request.headers.get('X-Forwarded-For', '')
        if forwarded:
            return forwarded.split(',')[0].strip()
        real_ip = request.headers.get('X-Real-IP', '')
        if real_ip:
            return real_ip.strip()
        return request.client.host if request.client else ''

    @staticmethod
    def _is_ip_local(ip: str) -> bool:
        local = {'127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'}
        return ip in local


app.add_middleware(AuthMiddleware)


# ─── Rate Limiting Middleware ────────────────────────────────────────
from middleware.rate_limit import (
    RATE_LIMIT_ENABLED, DEFAULT_LIMITS, RateLimiter,
    get_endpoint_category, init_rate_limiter as _init_rate_limiter_flask
)

_limiter = RateLimiter(window_seconds=60) if RATE_LIMIT_ENABLED else None

# Start cleanup thread for rate limiter
if _limiter:
    def _cleanup_loop():
        import time
        while True:
            time.sleep(300)
            _limiter.cleanup()
    threading.Thread(target=_cleanup_loop, daemon=True).start()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not RATE_LIMIT_ENABLED or not _limiter:
            return await call_next(request)

        path = request.url.path
        if not path.startswith('/api/'):
            return await call_next(request)

        # Skip rate limiting for internal webhooks (price_server, sniper_outrider)
        if path.startswith('/api/webhook/'):
            return await call_next(request)

        category = get_endpoint_category(path)
        limit = DEFAULT_LIMITS.get(category, 60)

        ip = request.headers.get('X-Forwarded-For', '')
        if not ip:
            ip = request.client.host if request.client else 'unknown'
        else:
            ip = ip.split(',')[0].strip()
        key = f"{ip}:{category}:{path}"

        allowed, count, remaining = _limiter.is_allowed(key, limit)

        if not allowed:
            return JSONResponse(
                {
                    'error': 'Rate limit exceeded',
                    'code': 'RATE_LIMITED',
                    'retry_after': _limiter.get_reset_time(key)
                },
                status_code=429,
                headers={
                    'X-RateLimit-Limit': str(limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(_limiter.get_reset_time(key)),
                }
            )

        response = await call_next(request)
        response.headers['X-RateLimit-Limit'] = str(limit)
        response.headers['X-RateLimit-Remaining'] = str(remaining)
        response.headers['X-RateLimit-Reset'] = str(_limiter.get_reset_time(key))
        return response

app.add_middleware(RateLimitMiddleware)


# ─── Initialize Auth ─────────────────────────────────────────────────
# Re-use the Flask auth module's token management (framework-agnostic parts)
from middleware import auth as _auth_mod
if AUTH_ENABLED:
    if not _auth_mod.SESSION_SECRET:
        _auth_mod.SESSION_SECRET = secrets.token_urlsafe(32)
    from itsdangerous import URLSafeTimedSerializer
    _auth_mod._serializer = URLSafeTimedSerializer(_auth_mod.SESSION_SECRET)
    _auth_mod._get_or_create_auth_token(BASE_DIR)
    logger.info("Authentication middleware initialized (FastAPI)")


# Auth router handled by Flask auth_bp via WSGI mount


# ─── Flask Blueprint Mounting ────────────────────────────────────────
# Mount the existing Flask app (with all blueprints) under FastAPI via
# WSGIMiddleware. All existing routes already include /api/ in their
# decorators, so we mount at "/" to avoid double-prefixing.

from flask import Flask
from flask_cors import CORS

flask_app = Flask(__name__)
CORS(flask_app, origins=ALLOWED_ORIGINS, supports_credentials=True)

# Register all Flask blueprints
from routes import (
    api_bp, copytrade_bp, wallet_bp, yield_bp, dlmm_bp,
    liquidity_bp, skr_bp, init_dlmm_services, init_liquidity_services
)
from routes.arb import arb_bp
from routes.services import services_bp
from routes.auth import auth_bp

flask_app.register_blueprint(auth_bp)
flask_app.register_blueprint(api_bp)
flask_app.register_blueprint(copytrade_bp)
flask_app.register_blueprint(arb_bp)
flask_app.register_blueprint(services_bp)
flask_app.register_blueprint(wallet_bp)
flask_app.register_blueprint(yield_bp)
flask_app.register_blueprint(dlmm_bp)
flask_app.register_blueprint(liquidity_bp)
flask_app.register_blueprint(skr_bp)

# Initialize DLMM and Liquidity services
init_dlmm_services()
init_liquidity_services()

# Ensure local wallet is in user_wallets table
if WALLET_ADDRESS != "Unknown":
    db.save_user_wallet(WALLET_ADDRESS, "Swap", is_default=1)

# Clear stale processing flags
db.clear_stale_processing_flags()

# Mount Flask via WSGI — only /api/* requests go to Flask.
# Starlette Mount("/api") strips the prefix, but Flask routes have /api/
# baked in. We use a thin WSGI wrapper to restore the prefix.
from starlette.middleware.wsgi import WSGIMiddleware
from starlette.routing import Mount


class _PrefixRestoringWSGI:
    """WSGI wrapper that prepends a prefix back to PATH_INFO."""
    def __init__(self, wsgi_app, prefix: str):
        self.app = wsgi_app
        self.prefix = prefix

    def __call__(self, environ, start_response):
        environ['SCRIPT_NAME'] = ''
        environ['PATH_INFO'] = self.prefix + environ.get('PATH_INFO', '')
        return self.app(environ, start_response)


app.router.routes.insert(0, Mount(
    "/api",
    app=WSGIMiddleware(_PrefixRestoringWSGI(flask_app, "/api"))
))


# Health check is handled by Flask api_bp via WSGI mount


# ─── SPA Fallback ────────────────────────────────────────────────────
_dist_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.isdir(_dist_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        file_path = os.path.join(_dist_dir, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_path = os.path.join(_dist_dir, 'index.html')
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return JSONResponse({"error": "Not Found"}, status_code=404)


# ─── Socket.IO Event Handlers ───────────────────────────────────────
# Port all @socketio.on handlers from routes/websocket.py to @sio.on
from datetime import datetime
from services.bots import get_formatted_bots
from services.portfolio import broadcast_balance
from routes.copytrade import get_formatted_targets
from services.news import news_service
import json


@sio.on('connect')
async def handle_global_connect(sid, environ):
    logger.debug(f"Global client connected: {sid}")


@sio.on('connect', namespace='/portfolio')
async def handle_portfolio_connect(sid, environ):
    logger.debug(f"Portfolio namespace connected: {sid}")


@sio.on('connect', namespace='/prices')
async def handle_prices_connect(sid, environ):
    logger.debug(f"Prices namespace connected: {sid}")


@sio.on('connect', namespace='/arb')
async def handle_arb_connect(sid, environ):
    logger.debug(f"Arb namespace connected: {sid}")


@sio.on('connect', namespace='/bots')
async def handle_bots_connect(sid, environ):
    logger.debug(f"Bots namespace connected: {sid}")


@sio.on('connect', namespace='/history')
async def handle_history_connect(sid, environ):
    logger.debug(f"History namespace connected: {sid}")


@sio.on('connect', namespace='/copytrade')
async def handle_copytrade_connect(sid, environ):
    logger.debug(f"Copytrade namespace connected: {sid}")


@sio.on('connect', namespace='/sniper')
async def handle_sniper_connect(sid, environ):
    logger.debug(f"Sniper namespace connected: {sid}")
    from services.sniper import sniper_engine
    # Send current armed state (autoSnipe) + persisted settings
    settings = sniper_engine.settings
    await sio.emit('sniper_status', {
        'armed': bool(settings.get('autoSnipe')),
        'detecting': sniper_engine.is_running(),
    }, namespace='/sniper', room=sid)
    await sio.emit('sniper_settings_sync', settings, namespace='/sniper', room=sid)
    # Send HFT positions on connect
    await sio.emit('hft_positions_update', {
        'positions': sniper_engine.get_hft_positions()
    }, namespace='/sniper', room=sid)


@sio.on('connect', namespace='/intel')
async def handle_intel_connect(sid, environ):
    logger.debug(f"Intel namespace connected: {sid}")


@sio.on('connect', namespace='/yield')
async def handle_yield_connect(sid, environ):
    logger.debug(f"Yield namespace connected: {sid}")


@sio.on('connect', namespace='/dlmm')
async def handle_dlmm_connect(sid, environ):
    logger.debug(f"DLMM namespace connected: {sid}")


@sio.on('connect', namespace='/liquidity')
async def handle_liquidity_connect(sid, environ):
    logger.debug(f"Liquidity namespace connected: {sid}")


@sio.on('connect', namespace='/skr')
async def handle_skr_connect(sid, environ):
    logger.debug(f"SKR namespace connected: {sid}")


@sio.on('ping_arb', namespace='/arb')
async def handle_arb_ping(sid):
    logger.debug(f"Received Arb Ping from {sid}")


@sio.on('request_balance', namespace='/portfolio')
async def handle_bal_req(sid):
    logger.debug(f"Received request_balance from {sid}")
    broadcast_balance()


@sio.on('request_bots', namespace='/bots')
async def handle_bots_req(sid):
    logger.debug(f"Received request_bots from {sid}")
    await sio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots', room=sid)


@sio.on('request_history', namespace='/history')
async def handle_history_req(sid, data=None):
    wallet = data.get('wallet') if data else None
    logger.debug(f"Received request_history from {sid}")
    await sio.emit('history_update', {'history': db.get_history(50, wallet_address=wallet)}, namespace='/history', room=sid)


@sio.on('request_targets', namespace='/copytrade')
async def handle_targets_req(sid):
    logger.debug(f"Received request_targets from {sid}")
    await sio.emit('targets_update', {'targets': get_formatted_targets()}, namespace='/copytrade', room=sid)


@sio.on('request_signals', namespace='/copytrade')
async def handle_signals_req(sid):
    logger.debug(f"Received request_signals from {sid}")
    signals = db.get_signals(50)
    targets_map = {t['address']: t['alias'] for t in db.get_all_targets()}
    for s in signals:
        details = json.loads(s.pop("details_json", "{}"))
        s.update(details)
        if "wallet_address" in s:
            s["wallet"] = s.pop("wallet_address")
        if not s.get('alias'):
            s['alias'] = targets_map.get(s.get('wallet', ''), s.get('wallet', '')[:8])
        if isinstance(s.get("timestamp"), str):
            try:
                s["timestamp"] = datetime.strptime(s["timestamp"], "%Y-%m-%d %H:%M:%S").timestamp()
            except:
                pass
    await sio.emit('signals_update', {'signals': signals}, namespace='/copytrade', room=sid)


@sio.on('request_tracked', namespace='/sniper')
async def handle_sniper_req(sid):
    logger.debug(f"Received request_tracked from {sid}")
    tokens = db.get_tracked_tokens(50)
    # Serialize datetime objects for JSON transport
    for t in tokens:
        if hasattr(t.get('detected_at'), 'isoformat'):
            t['detected_at'] = t['detected_at'].isoformat()
    await sio.emit('tracked_update', {'tokens': tokens}, namespace='/sniper', room=sid)


@sio.on('arm_sniper', namespace='/sniper')
async def handle_arm_sniper(sid, data=None):
    """Toggle autoSnipe — arms/disarms auto-execution. Detection stays running."""
    from services.sniper import sniper_engine
    # Merge latest settings from frontend if provided
    if data and isinstance(data, dict) and 'settings' in data:
        incoming = data['settings']
        sniper_engine.settings.update(incoming)
    armed = not sniper_engine.settings.get('autoSnipe', False)
    sniper_engine.settings['autoSnipe'] = armed
    # Reset circuit breaker on re-arm
    if armed:
        sniper_engine._snipe_count = 0
        logger.info("🔌 Circuit breaker reset (re-armed)")
    db.save_setting('sniper_settings', sniper_engine.settings)
    logger.info(f"Sniper {'ARMED' if armed else 'DISARMED'} by user — settings: {list(sniper_engine.settings.keys())}")
    await sio.emit('sniper_status', {
        'armed': armed,
        'detecting': sniper_engine.is_running(),
    }, namespace='/sniper')


@sio.on('request_sniper_status', namespace='/sniper')
async def handle_sniper_status_req(sid):
    from services.sniper import sniper_engine
    settings = sniper_engine.settings
    await sio.emit('sniper_status', {
        'armed': bool(settings.get('autoSnipe')),
        'detecting': sniper_engine.is_running(),
    }, namespace='/sniper', room=sid)
    await sio.emit('sniper_settings_sync', settings, namespace='/sniper', room=sid)


@sio.on('request_snipe_positions', namespace='/sniper')
async def handle_snipe_positions_req(sid):
    positions = db.get_snipe_positions(50)
    for p in positions:
        if hasattr(p.get('timestamp'), 'isoformat'):
            p['timestamp'] = p['timestamp'].isoformat()
    await sio.emit('snipe_positions_update', {'positions': positions}, namespace='/sniper', room=sid)


@sio.on('request_hft_positions', namespace='/sniper')
async def handle_hft_positions_req(sid):
    from services.sniper import sniper_engine
    await sio.emit('hft_positions_update', {
        'positions': sniper_engine.get_hft_positions()
    }, namespace='/sniper', room=sid)


@sio.on('sell_snipe_position', namespace='/sniper')
async def handle_sell_snipe(sid, data):
    """Sell a sniped token position — swap full token balance back to SOL."""
    mint = data.get('mint')
    symbol = data.get('symbol', '???')
    slippage_bps = int(data.get('slippage_bps', 1500))  # default 15%

    if not mint:
        await sio.emit('sell_result', {'success': False, 'error': 'No mint provided'}, namespace='/sniper', room=sid)
        return

    logger.info(f"Sell requested: {symbol} ({mint[:8]}...) slippage={slippage_bps}bps")

    def _do_sell():
        try:
            from services.tokens import get_token_accounts
            from services.trading import execute_trade_with_jito
            from services.jito import tip_floor_cache

            # Get current token balance
            holdings = get_token_accounts()
            token_balance = 0
            for h in holdings:
                if h.get('mint') == mint:
                    token_balance = h.get('balance', 0)
                    break

            if token_balance <= 0:
                sio_bridge.emit('sell_result', {
                    'success': False,
                    'error': f'No {symbol} balance found in wallet',
                }, namespace='/sniper')
                return

            tip_lamports = tip_floor_cache.get_optimal_tip(percentile="75th")
            sol_mint = "So11111111111111111111111111111111111111112"

            logger.info(f"Selling {token_balance} {symbol} → SOL (tip: {tip_lamports} lamports)")

            result = execute_trade_with_jito(
                input_mint=mint,
                output_mint=sol_mint,
                amount=token_balance,
                source=f"Snipe Sell ({symbol})",
                slippage_bps=slippage_bps,
                tip_lamports=tip_lamports,
            )

            logger.info(f"✅ SELL SUCCESS: {symbol} → {result.get('amount_out', 0):.4f} SOL (sig: {result.get('signature', '')[:16]}...)")

            sio_bridge.emit('sell_result', {
                'success': True,
                'symbol': symbol,
                'mint': mint,
                'sol_received': result.get('amount_out', 0),
                'signature': result.get('signature'),
                'jito_success': result.get('jito_success', False),
            }, namespace='/sniper')

            # Refresh positions list for all clients
            positions = db.get_snipe_positions(50)
            for p in positions:
                if hasattr(p.get('timestamp'), 'isoformat'):
                    p['timestamp'] = p['timestamp'].isoformat()
            sio_bridge.emit('snipe_positions_update', {'positions': positions}, namespace='/sniper')

        except Exception as e:
            logger.error(f"❌ SELL FAILED: {symbol} — {e}", exc_info=True)
            sio_bridge.emit('sell_result', {
                'success': False,
                'error': str(e),
            }, namespace='/sniper')

    import sio_bridge as _sio_bridge
    _sio_bridge.start_background_task(_do_sell)
    await sio.emit('sell_result', {'success': True, 'status': 'pending', 'symbol': symbol}, namespace='/sniper', room=sid)


@sio.on('request_news', namespace='/intel')
async def handle_news_req(sid):
    logger.debug(f"Received request_news from {sid}")
    await sio.emit('news_update', {'news': news_service.news_cache}, namespace='/intel', room=sid)


# Yield namespace handlers
@sio.on('request_opportunities', namespace='/yield')
async def handle_yield_opps(sid):
    from services.yield_hunter import get_all_opportunities
    try:
        opps = get_all_opportunities()
        opps_data = [o.to_dict() if hasattr(o, 'to_dict') else o for o in opps]
        await sio.emit('opportunities_update', {'opportunities': opps_data, 'timestamp': __import__('time').time()}, namespace='/yield', room=sid)
    except Exception as e:
        logger.error(f"Error getting yield opportunities: {e}")


@sio.on('request_positions', namespace='/yield')
async def handle_yield_positions(sid, data=None):
    try:
        wallet = data.get('wallet') if data else None
        positions = db.get_yield_positions(wallet_address=wallet)
        await sio.emit('positions_update', {'positions': positions, 'timestamp': __import__('time').time()}, namespace='/yield', room=sid)
    except Exception as e:
        logger.error(f"Error getting yield positions: {e}")


# DLMM namespace handlers
@sio.on('request_pools', namespace='/dlmm')
async def handle_dlmm_pools(sid):
    from services.meteora_dlmm import DLMMClient
    try:
        client = DLMMClient()
        pools = client.get_all_pools()
        await sio.emit('pools_update', {'pools': pools, 'timestamp': __import__('time').time()}, namespace='/dlmm', room=sid)
    except Exception as e:
        logger.error(f"Error getting DLMM pools: {e}")


@sio.on('request_positions', namespace='/dlmm')
async def handle_dlmm_positions(sid, data=None):
    try:
        wallet = data.get('wallet', WALLET_ADDRESS) if data else WALLET_ADDRESS
        positions = db.get_dlmm_positions(wallet_address=wallet)
        await sio.emit('positions_update', {'positions': positions, 'timestamp': __import__('time').time()}, namespace='/dlmm', room=sid)
    except Exception as e:
        logger.error(f"Error getting DLMM positions: {e}")


@sio.on('request_detected_pools', namespace='/dlmm')
async def handle_dlmm_detected(sid):
    from services.meteora_dlmm import get_dlmm_sniper
    try:
        sniper = get_dlmm_sniper()
        pools = sniper.get_detected_pools() if sniper else []
        await sio.emit('detected_pools_update', {'pools': pools, 'timestamp': __import__('time').time()}, namespace='/dlmm', room=sid)
    except Exception as e:
        logger.error(f"Error getting detected pools: {e}")


# Liquidity namespace handlers
@sio.on('request_pools', namespace='/liquidity')
async def handle_liquidity_pools(sid, data=None):
    try:
        protocol = data.get('protocol') if data else None
        from routes.liquidity_routes import meteora_client
        from services.liquidity import OrcaClient
        orca_client = OrcaClient()
        pools = []
        if not protocol or protocol == 'meteora':
            pools.extend(meteora_client.get_all_pools() or [])
        if not protocol or protocol == 'orca':
            pools.extend(orca_client.get_all_pools() or [])
        await sio.emit('pools_update', {'pools': pools, 'protocol': protocol, 'timestamp': __import__('time').time()}, namespace='/liquidity', room=sid)
    except Exception as e:
        logger.error(f"Error getting liquidity pools: {e}")


@sio.on('request_positions', namespace='/liquidity')
async def handle_liquidity_positions(sid, data=None):
    try:
        wallet = data.get('wallet', WALLET_ADDRESS) if data else WALLET_ADDRESS
        protocol = data.get('protocol') if data else None
        positions = db.get_liquidity_positions(wallet_address=wallet, protocol=protocol)
        await sio.emit('positions_update', {'positions': positions, 'protocol': protocol, 'timestamp': __import__('time').time()}, namespace='/liquidity', room=sid)
    except Exception as e:
        logger.error(f"Error getting liquidity positions: {e}")


@sio.on('request_rebalance_suggestions', namespace='/liquidity')
async def handle_rebalance_suggestions(sid, data=None):
    try:
        wallet = data.get('wallet', WALLET_ADDRESS) if data else WALLET_ADDRESS
        from routes.liquidity_routes import rebalance_engine
        suggestions = rebalance_engine.get_suggestions(wallet) if rebalance_engine else []
        suggestions_data = [s.to_dict() if hasattr(s, 'to_dict') else s for s in suggestions]
        await sio.emit('rebalance_suggestions_update', {'suggestions': suggestions_data, 'timestamp': __import__('time').time()}, namespace='/liquidity', room=sid)
    except Exception as e:
        logger.error(f"Error getting rebalance suggestions: {e}")


# SKR namespace handlers
@sio.on('request_stats', namespace='/skr')
async def handle_skr_stats(sid):
    from service_registry import registry
    try:
        service = registry.get('skr_staking')
        stats = service.get_current_stats() if service else {}
        await sio.emit('stats_update', stats, namespace='/skr', room=sid)
    except Exception as e:
        logger.error(f"Error getting SKR stats: {e}")


@sio.on('request_events', namespace='/skr')
async def handle_skr_events(sid, data=None):
    try:
        limit = data.get('limit', 50) if data else 50
        event_type = data.get('type') if data else None
        events = db.get_skr_events(limit=limit, event_type=event_type)
        await sio.emit('events_update', {'events': events, 'timestamp': __import__('time').time()}, namespace='/skr', room=sid)
    except Exception as e:
        logger.error(f"Error getting SKR events: {e}")


@sio.on('request_snapshots', namespace='/skr')
async def handle_skr_snapshots(sid, data=None):
    try:
        period = data.get('period', '24h') if data else '24h'
        snapshots = db.get_skr_snapshots(period=period)
        await sio.emit('snapshots_update', {'snapshots': snapshots, 'period': period, 'timestamp': __import__('time').time()}, namespace='/skr', room=sid)
    except Exception as e:
        logger.error(f"Error getting SKR snapshots: {e}")


@sio.on('request_whales', namespace='/skr')
async def handle_skr_whales(sid, data=None):
    try:
        limit = data.get('limit', 20) if data else 20
        whales = db.get_skr_whales(limit=limit)
        await sio.emit('whales_update', {'whales': whales, 'timestamp': __import__('time').time()}, namespace='/skr', room=sid)
    except Exception as e:
        logger.error(f"Error getting SKR whales: {e}")


# ─── Endpoint Failover ────────────────────────────────────────────────
import config as _config
from endpoint_manager import get_endpoint_manager
endpoint_mgr = get_endpoint_manager(_config)

# ─── Service Registration ────────────────────────────────────────────
from service_registry import registry, ServiceDescriptor as SD
from services.portfolio import PortfolioService
from arb_engine import ArbEngine
from services.bots import BotSchedulerService
from services.trading import execute_trade_logic
from copy_trader import CopyTraderEngine
from services.notifications import notify_system_status
from services.sniper import sniper_engine
from services.wolfpack import wolf_pack
from services.meteora_dlmm import init_dlmm_sniper
from services.blockhash_cache import get_blockhash_cache
from services.skr_staking import SKRStakingService
from services.shyft_stream import ShyftStreamManager
from services.network_monitor import network_monitor
from services.audit import audit_logger
from services.raydium_amm import RaydiumPoolRegistry

registry.register(
    SD("copy_trader", "Copy Trader", "Whale wallet tracking via Helius WebSocket",
       "Users", "cyan", needs_stream="set_stream_manager"),
    CopyTraderEngine(helius, db, execute_trade_logic))

registry.register(
    SD("arb_engine", "Arb Scanner", "Cross-DEX spread detection",
       "TrendingUp", "green"),
    ArbEngine(helius, db))

registry.register(
    SD("raydium_registry", "Raydium Pool Registry",
       "Real-time Raydium V4 pool state via gRPC",
       "Layers", "purple", toggleable=False, auto_start=True,
       needs_stream="set_stream_manager"),
    RaydiumPoolRegistry())

registry.register(
    SD("sniper_engine", "Token Sniper", "New token detection & auto-snipe",
       "Crosshair", "pink"),
    sniper_engine)

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
    init_dlmm_sniper(db, helius))

registry.register(
    SD("network_monitor", "Network Monitor", "Security surveillance & alerts",
       "Shield", "cyan"),
    network_monitor)

registry.register(
    SD("skr_staking", "SKR Staking Monitor", "SKR staking event tracking",
       "Lock", "cyan", needs_stream="set_stream_manager"),
    SKRStakingService(helius, db))

registry.register(
    SD("endpoint_mgr", "Endpoint Manager", "Multi-location RPC/WS/gRPC failover",
       "Globe", "cyan", toggleable=False, auto_start=True),
    endpoint_mgr)

registry.register(
    SD("shyft_stream", "Shyft gRPC Stream", "Yellowstone gRPC + RabbitStream real-time feeds",
       "Radio", "green"),
    ShyftStreamManager(_config))

registry.register(
    SD("portfolio", "Portfolio Tracker", "Balance polling & broadcast",
       "Wallet", "cyan", toggleable=False, auto_start=True,
       needs_stream="set_stream_manager"),
    PortfolioService())

registry.register(
    SD("bot_scheduler", "Bot Scheduler", "DCA/TWAP/Grid bot execution",
       "Bot", "purple", toggleable=False, auto_start=True),
    BotSchedulerService())


# ─── Startup / Shutdown Events ───────────────────────────────────────
@app.on_event("startup")
async def startup():
    loop = asyncio.get_running_loop()
    sio_bridge.init(sio, event_loop=loop, is_async=True)
    logger.info("sio_bridge initialized in async mode")

    # Start blockhash cache
    blockhash_cache = get_blockhash_cache()
    blockhash_cache.set_stream_manager(registry.get('shyft_stream'))
    logger.info("BlockhashCache initialized for low-latency transactions")

    # Wire gRPC stream into all services
    registry.set_stream_manager(registry.get('shyft_stream'))

    # Start Shyft gRPC streams
    registry.get('shyft_stream').start()

    # Start Jito tip floor cache (10s background poll for dynamic tips)
    from services.jito import tip_floor_cache
    tip_floor_cache.start()

    # Auto-start core services
    registry.start_all(auto_only=True)

    # Wire Raydium registry → Arb Engine for direct DEX swap building
    arb = registry.get('arb_engine')
    raydium = registry.get('raydium_registry')
    if arb and raydium:
        arb.set_raydium_registry(raydium)
        # Discover Raydium V4 pools for monitored arb pairs
        try:
            pairs = [(p["input"], p["output"]) for p in arb.monitored_pairs]
            if pairs:
                threading.Thread(
                    target=raydium.discover_pools, args=(pairs,), daemon=True
                ).start()
        except Exception as e:
            logger.warning(f"Raydium pool discovery failed (non-fatal): {e}")

    # Defer notification
    threading.Timer(2, notify_system_status,
                    args=("ONLINE", "TacTix.sol System Core has initialized. Services await manual activation.")).start()

    # Log startup
    audit_logger.log_system_start()
    logger.info("TacTix FastAPI server started")


@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down...")
    try:
        registry.stop_all()
    except:
        pass
    try:
        notify_system_status("OFFLINE", "TacTix.sol System Core is shutting down.")
    except:
        pass


# ─── Signal Handlers ─────────────────────────────────────────────────
def handle_shutdown(signum, frame):
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


# ─── ASGI App (Socket.IO wraps FastAPI) ──────────────────────────────
sio_asgi = python_sio.ASGIApp(sio, other_asgi_app=app, socketio_path='/socket.io')


if __name__ == '__main__':
    logger.info(f"Starting TacTix FastAPI server on http://{SERVER_HOST}:{SERVER_PORT}")
    uvicorn.run(
        sio_asgi,
        host=SERVER_HOST,
        port=SERVER_PORT,
        log_level="info",
    )
