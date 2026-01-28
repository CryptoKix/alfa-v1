"""Routes package for SolanaAutoTrade."""
from routes.api import api_bp
from routes.copytrade import copytrade_bp
from routes.wallet import wallet_bp
from routes.websocket import register_websocket_handlers
from routes.yield_routes import yield_bp
from routes.dlmm_routes import dlmm_bp, init_dlmm_services

__all__ = ['api_bp', 'copytrade_bp', 'wallet_bp', 'yield_bp', 'dlmm_bp', 'register_websocket_handlers', 'init_dlmm_services']
