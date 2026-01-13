"""Routes package for SolanaAutoTrade."""
from routes.api import api_bp
from routes.copytrade import copytrade_bp
from routes.websocket import register_websocket_handlers

__all__ = ['api_bp', 'copytrade_bp', 'register_websocket_handlers']
