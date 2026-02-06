#!/usr/bin/env python3
"""Configuration module for SolanaAutoTrade."""
import sys
sys.set_int_max_str_digits(0)

import os
import json
from dotenv import load_dotenv
from solders.keypair import Keypair

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEYPAIR_PATH = os.path.join(BASE_DIR, 'keypair.json')
KEYSTORE_PATH = os.path.join(BASE_DIR, '.keystore.enc')

# API Keys
# HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")  # DISABLED — all traffic via Shyft
HELIUS_API_KEY = ""  # Kept as empty string so imports don't break
JUPITER_API_KEY = os.getenv("JUPITER_API_KEY", "")
SOLANA_TRACKER_API_KEY = os.getenv("SOLANA_TRACKER_API_KEY", "")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")
DISCORD_GIT_WEBHOOK_URL = os.getenv("DISCORD_GIT_WEBHOOK_URL", "")
DISCORD_SYSTEM_WEBHOOK_URL = os.getenv("DISCORD_SYSTEM_WEBHOOK_URL", "")
BIRDEYE_API_KEY = os.getenv("BIRDEYE_API_KEY", "")

# Shyft API Key (primary RPC provider)
SHYFT_API_KEY = os.getenv("SHYFT_API_KEY", "")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RPC PROVIDER CONFIGURATION — Multi-Location Failover
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PRIMARY: Shyft AMS (Amsterdam)
# SECONDARY: Shyft FRA (Frankfurt)
# Failover managed by EndpointManager singleton (backend/endpoint_manager.py)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Multi-location Shyft RPC endpoints
SHYFT_RPC_PRIMARY = f"https://rpc.ams.shyft.to?api_key={SHYFT_API_KEY}" if SHYFT_API_KEY else ""
SHYFT_RPC_SECONDARY = f"https://rpc.fra.shyft.to?api_key={SHYFT_API_KEY}" if SHYFT_API_KEY else ""

# Multi-location Shyft WebSocket endpoints
SHYFT_WS_PRIMARY = f"wss://rpc.ams.shyft.to?api_key={SHYFT_API_KEY}" if SHYFT_API_KEY else ""
SHYFT_WS_SECONDARY = f"wss://rpc.fra.shyft.to?api_key={SHYFT_API_KEY}" if SHYFT_API_KEY else ""

# Legacy aliases — point to primary for backward compat (static default)
SHYFT_RPC = SHYFT_RPC_PRIMARY
SOLANA_RPC = SHYFT_RPC_PRIMARY
HELIUS_STAKED_RPC = SHYFT_RPC_PRIMARY

# Helius — DISABLED, DAS API now served by Shyft
# HELIUS_DAS_URL = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}" if HELIUS_API_KEY else ""
HELIUS_DAS_URL = ""

# Jupiter API
JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote"
JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap"
JUPITER_LIMIT_ORDER_API = "https://api.jup.ag/limit/v2"
BIRDEYE_OHLCV_API = "https://public-api.birdeye.so/defi/ohlcv"

# Helius gRPC / LaserStream — DISABLED, using Shyft gRPC
# HELIUS_GRPC_ENDPOINT = "laserstream-mainnet-ewr.helius-rpc.com:443"
# HELIUS_GRPC_TOKEN = HELIUS_API_KEY
HELIUS_GRPC_ENDPOINT = ""
HELIUS_GRPC_TOKEN = ""

# Shyft Yellowstone gRPC — multi-location
SHYFT_GRPC_PRIMARY = os.getenv("SHYFT_GRPC_PRIMARY", "grpc.eu.shyft.to:443")
SHYFT_GRPC_SECONDARY = os.getenv("SHYFT_GRPC_SECONDARY", "grpc.ams.shyft.to:443")
SHYFT_GRPC_TOKEN = os.getenv("SHYFT_GRPC_TOKEN", "")
# Legacy alias
SHYFT_GRPC_ENDPOINT = SHYFT_GRPC_PRIMARY

# Shyft RabbitStream — multi-location
SHYFT_RABBIT_PRIMARY = os.getenv("SHYFT_RABBIT_PRIMARY", "rabbitstream.ams.shyft.to:443")
SHYFT_RABBIT_SECONDARY = os.getenv("SHYFT_RABBIT_SECONDARY", "rabbitstream.fra.shyft.to:443")
SHYFT_RABBIT_TOKEN = os.getenv("SHYFT_RABBIT_TOKEN", SHYFT_GRPC_TOKEN)
# Legacy alias
SHYFT_RABBIT_ENDPOINT = SHYFT_RABBIT_PRIMARY

# Keypair Loading - SECURITY: Supports encrypted keystore
# Priority: 1) Encrypted keystore (.keystore.enc), 2) Plaintext keypair.json (deprecated)
KEYPAIR = None
WALLET_ADDRESS = "Unknown"

def _load_keypair():
    """Load keypair from encrypted keystore or fallback to plaintext."""
    global KEYPAIR, WALLET_ADDRESS

    # Try encrypted keystore first
    if os.path.exists(KEYSTORE_PATH):
        try:
            # Inline keystore loading to avoid circular imports
            import base64
            from cryptography.fernet import Fernet
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

            password = os.getenv('TACTIX_KEYSTORE_PASSWORD', '')
            if not password:
                print("WARNING: Keystore exists but TACTIX_KEYSTORE_PASSWORD not set")
                print("  Set the password in .env or environment to load the wallet")
                return

            # Read keystore
            with open(KEYSTORE_PATH, 'r') as f:
                keystore_data = json.load(f)

            # Derive key from password
            salt = base64.b64decode(keystore_data['salt'])
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=600_000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
            fernet = Fernet(key)

            # Decrypt secret key
            encrypted_secret = base64.b64decode(keystore_data['encrypted_secret'])
            secret_bytes = fernet.decrypt(encrypted_secret)

            # Reconstruct keypair
            KEYPAIR = Keypair.from_seed(secret_bytes)
            WALLET_ADDRESS = str(KEYPAIR.pubkey())

            # Verify
            if WALLET_ADDRESS != keystore_data['pubkey']:
                print(f"Keystore Error: pubkey mismatch")
                KEYPAIR = None
                WALLET_ADDRESS = "Unknown"
                return

            print(f"Loaded Wallet (encrypted): {WALLET_ADDRESS}")
            return
        except Exception as e:
            print(f"Keystore Error: {e}")
            return

    # Fallback to plaintext keypair.json (deprecated - show warning)
    if os.path.exists(KEYPAIR_PATH):
        try:
            with open(KEYPAIR_PATH, 'r') as f:
                kp_data = json.load(f)
            KEYPAIR = Keypair.from_bytes(kp_data)
            WALLET_ADDRESS = str(KEYPAIR.pubkey())
            print(f"Loaded Wallet (PLAINTEXT - INSECURE): {WALLET_ADDRESS}")
            print("WARNING: Using plaintext keypair.json is insecure!")
            print("  Run: python -m services.keystore migrate")
            print("  to encrypt your keypair with password protection.")
        except Exception as e:
            print(f"Wallet Error: {e}")
    else:
        print("No wallet found. Create keypair.json or .keystore.enc")

_load_keypair()

# Default tokens
DEFAULT_TOKENS = {
    "So11111111111111111111111111111111111111112": {
        "symbol": "SOL", 
        "decimals": 9,
        "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
    },
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
        "symbol": "USDC", 
        "decimals": 6,
        "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
    },
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {
        "symbol": "USDT", 
        "decimals": 6,
        "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg"
    },
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": {
        "symbol": "JUP", 
        "decimals": 6,
        "logo_uri": "https://static.jup.ag/jup/icon.png"
    },
}

# PostgreSQL
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://tactix:tactix_dev_2025@localhost:5432/tactix"
)

# Server config - SECURITY: Bind to localhost only to prevent network exposure
# If you need external access, use a reverse proxy with proper authentication
SERVER_HOST = os.getenv('TACTIX_HOST', '127.0.0.1')
SERVER_PORT = int(os.getenv('TACTIX_PORT', '5001'))
