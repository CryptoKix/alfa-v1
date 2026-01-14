#!/usr/bin/env python3
"""Configuration module for SolanaAutoTrade."""
import sys
sys.set_int_max_str_digits(0)

import os
import json
from dotenv import load_dotenv
from solders.keypair import Keypair

load_dotenv()

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEYPAIR_PATH = os.path.join(BASE_DIR, 'keypair.json')

# API Keys
HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
JUPITER_API_KEY = os.getenv("JUPITER_API_KEY", "")
SOLANA_TRACKER_API_KEY = os.getenv("SOLANA_TRACKER_API_KEY", "")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")

# RPC & API URLs
SOLANA_RPC = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"
JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote"
JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap"

# Keypair Loading
KEYPAIR = None
WALLET_ADDRESS = "Unknown"

try:
    with open(KEYPAIR_PATH, 'r') as f:
        kp_data = json.load(f)
        KEYPAIR = Keypair.from_bytes(kp_data)
        WALLET_ADDRESS = str(KEYPAIR.pubkey())
        print(f"Loaded Wallet: {WALLET_ADDRESS}")
except Exception as e:
    print(f"Wallet Error: {e}")

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

# Server config
SERVER_HOST = '0.0.0.0'
SERVER_PORT = 5001
