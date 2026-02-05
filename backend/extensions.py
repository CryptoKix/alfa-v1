#!/usr/bin/env python3
"""Shared extensions and instances for TacTix.sol.

Framework-agnostic: provides Solana clients, database, and price cache.
Socket.IO is handled by python-socketio in main.py via sio_bridge.
"""
import os
import threading
import time

from solana.rpc.api import Client

from config import SOLANA_RPC, WALLET_ADDRESS
from helius_infrastructure import HeliusClient
from database import TactixDB

# Solana clients
solana_client = Client(SOLANA_RPC)
helius = HeliusClient()

# Database
db = TactixDB()

# Price cache (shared state)
price_cache = {}
price_cache_lock = threading.Lock()
last_price_update = 0
