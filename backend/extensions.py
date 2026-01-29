#!/usr/bin/env python3
"""Shared Flask extensions and instances for SolanaAutoTrade."""
import os
import threading
import time

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from solana.rpc.api import Client
from solders.pubkey import Pubkey

from config import SOLANA_RPC, WALLET_ADDRESS
from helius_infrastructure import HeliusClient
from database import TactixDB

# SECURITY: CORS configuration
# Only allow requests from the local frontend dev server
ALLOWED_ORIGINS = os.getenv('TACTIX_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')

# Flask extensions
socketio = SocketIO(cors_allowed_origins=ALLOWED_ORIGINS, async_mode='eventlet')

# Solana clients
solana_client = Client(SOLANA_RPC)
helius = HeliusClient()

# Database
db = TactixDB()

# Price cache (shared state)
price_cache = {}
price_cache_lock = threading.Lock()
last_price_update = 0


def create_app():
    """Application factory."""
    app = Flask(
        __name__,
        template_folder='../frontend/dist',
        static_folder='../frontend/dist',
        static_url_path=''
    )

    # SECURITY: Restrict CORS to allowed origins only
    CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

    # SECURITY: Add security headers
    @app.after_request
    def add_security_headers(response):
        # Prevent clickjacking
        response.headers['X-Frame-Options'] = 'DENY'
        # Prevent MIME-type sniffing
        response.headers['X-Content-Type-Options'] = 'nosniff'
        # Enable XSS filter
        response.headers['X-XSS-Protection'] = '1; mode=block'
        # Referrer policy
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        # Content Security Policy (adjust as needed)
        if not app.debug:
            response.headers['Content-Security-Policy'] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "connect-src 'self' wss: ws: https://api.jup.ag https://mainnet.helius-rpc.com; "
                "font-src 'self' data:;"
            )
        return response

    socketio.init_app(app)

    # Ensure local wallet is in user_wallets table
    if WALLET_ADDRESS != "Unknown":
        db.save_user_wallet(WALLET_ADDRESS, "Swap", is_default=1)

    return app
