#!/usr/bin/env python3
"""Token discovery and management service."""
import requests
from flask import current_app

from config import SOLANA_RPC, WALLET_ADDRESS, DEFAULT_TOKENS
from extensions import db, helius


def get_known_tokens():
    """Fetch tokens from DB or return defaults."""
    tokens = db.get_known_tokens()
    if not tokens:
        for mint, info in DEFAULT_TOKENS.items():
            db.save_token(mint, info['symbol'], info['decimals'], info.get('logo_uri'))
        return DEFAULT_TOKENS
    return tokens


def get_token_accounts():
    """Get all token accounts for the wallet."""
    accounts = []
    programs = [
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",  # Standard
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"   # Token-2022
    ]
    known = get_known_tokens()

    for program_id in programs:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTokenAccountsByOwner",
            "params": [
                WALLET_ADDRESS,
                {"programId": program_id},
                {"encoding": "jsonParsed"}
            ]
        }
        try:
            res = requests.post(SOLANA_RPC, json=payload, timeout=10).json()
            if "result" not in res:
                continue

            for account in res["result"]["value"]:
                mint = account["account"]["data"]["parsed"]["info"]["mint"]
                balance = float(account["account"]["data"]["parsed"]["info"]["tokenAmount"]["uiAmount"])
                if balance <= 0:
                    continue

                # Discover unknown tokens or tokens missing logos
                if mint not in known or not known[mint].get('logo_uri'):
                    current_app.logger.info(f"Discovering metadata for: {mint}")
                    try:
                        # Get existing metadata if available
                        existing_meta = known.get(mint, {})
                        
                        asset = helius.das.get_asset(mint)
                        info = asset.get('token_info', {})
                        content = asset.get('content', {})
                        
                        symbol = info.get('symbol', existing_meta.get('symbol') or f"{mint[:4]}...")
                        decimals = info.get('decimals', existing_meta.get('decimals') or 9)
                        
                        # Extract logo from Helius
                        logo_uri = None
                        links = content.get('links', {})
                        if links.get('image'):
                            logo_uri = links['image']
                        else:
                            files = content.get('files', [])
                            for f in files:
                                if f.get('mime') in ['image/png', 'image/jpeg', 'image/svg+xml']:
                                    logo_uri = f.get('uri')
                                    break
                        
                        # Fallback to Jupiter CDN for reliability
                        if not logo_uri:
                            logo_uri = f"https://static.jup.ag/tokens/gen/{mint}.png"
                        
                        db.save_token(mint, symbol, decimals, logo_uri)
                        known[mint] = {"symbol": symbol, "decimals": decimals, "logo_uri": logo_uri}
                        current_app.logger.info(f"Updated metadata: {symbol} with logo: {logo_uri}")
                    except Exception as e:
                        current_app.logger.error(f"Discovery failed for {mint}: {e}")

                accounts.append({"mint": mint, "balance": balance})

        except Exception as e:
            current_app.logger.error(f"RPC Error in get_token_accounts: {e}")
            continue

    return accounts


def get_token_symbol(mint):
    """Get symbol for a token mint address."""
    known = get_known_tokens()
    if mint in known:
        return known[mint]["symbol"]
    
    # Try one-off discovery for unknown tokens
    try:
        asset = helius.das.get_asset(mint)
        info = asset.get('token_info', {})
        symbol = info.get('symbol')
        if symbol:
            decimals = info.get('decimals', 9)
            content = asset.get('content', {})
            logo_uri = content.get('links', {}).get('image') or f"https://static.jup.ag/tokens/gen/{mint}.png"
            db.save_token(mint, symbol, decimals, logo_uri)
            return symbol
    except Exception:
        pass

    return f"{mint[:4]}..."
