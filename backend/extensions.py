#!/usr/bin/env python3
"""Shared Flask extensions and instances for SolanaAutoTrade."""
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

# Flask extensions
socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet')

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
        template_folder='ProTerminal/dist',
        static_folder='ProTerminal/dist',
        static_url_path=''
    )
    CORS(app)
    socketio.init_app(app)

    # Ensure local wallet is in user_wallets table
    if WALLET_ADDRESS != "Unknown":
        db.save_user_wallet(WALLET_ADDRESS, "Swap", is_default=1)

    return app
