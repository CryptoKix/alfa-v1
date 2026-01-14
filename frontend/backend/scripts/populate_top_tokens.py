import requests
import sqlite3
import json
import os
import sys

# Configuration
HELIUS_API_KEY = "31f74c32-35e5-4782-aa1a-e575725af951"

# Resolve DB Path correctly regardless of execution dir
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # .../backend
DB_PATH = os.path.join(BASE_DIR, 'tactix_data.db')

# Verified Mints List (Top ~40)
TOP_MINTS = [
    # Majors
    "So11111111111111111111111111111111111111112", # SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", # USDT
    
    # LSTs
    "mSoLzYCxHdYgS6M7zgSiffU99yr91Way88uQvyDb78z", # mSOL
    "J1toso1u3P1z3hSSCc9Gu9Gatf4ojcyZvxbtntU15JC", # jitoSOL
    "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", # JupSOL
    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1", # bSOL
    
    # DeFi / Gov
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", # JUP
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", # RAY

    # Infra
    "HZ1JovNiVvGr21B199H2wsSTeaMBeLfSg9UP9yzmS2Sp", # PYTH
    "rndrizKT3MK1iimxbg3CcxyYebbsW1TRNGAcQ6Zwnp7", # RENDER
    "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux", # HNT
    "mb1uy7pMTM6S7rrS6W6ZLRv79ZatnyFY96Zf4rwS9NC", # MOBILE
    
    # Memes
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", # BONK
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", # WIF
]

def fetch_metadata_helius(mints):
    print(f"Fetching metadata for {len(mints)} tokens via Helius...")
    url = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"
    
    # Chunking
    chunks = [mints[i:i + 50] for i in range(0, len(mints), 50)]
    all_assets = []

    for chunk in chunks:
        payload = {
            "jsonrpc": "2.0",
            "id": "batch-tokens",
            "method": "getAssetBatch",
            "params": {"ids": chunk}
        }
        try:
            resp = requests.post(url, json=payload, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                if 'result' in data:
                    result = data['result']
                    print(f"  - Received {len(result)} items from chunk")
                    all_assets.extend(result)
                else:
                    print(f"  - No 'result' in response: {data}")
            else:
                print(f"  - Error: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"  - Request failed: {e}")
            
    return all_assets

def update_database(assets):
    print(f"Updating database at {DB_PATH}...")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tokens (
                mint TEXT PRIMARY KEY,
                symbol TEXT,
                decimals INTEGER,
                logo_uri TEXT,
                is_active BOOLEAN DEFAULT 1
            )
        ''')
        
        count = 0
        for asset in assets:
            if not asset: continue
            
            mint = asset.get('id')
            token_info = asset.get('token_info', {})
            content = asset.get('content', {})
            metadata = content.get('metadata', {})
            
            symbol = token_info.get('symbol') or metadata.get('symbol') or "Unknown"
            decimals = token_info.get('decimals') or 9
            
            # Smart Logo Extraction
            logo_uri = None
            files = content.get('files', [])
            if files and len(files) > 0:
                logo_uri = files[0].get('uri')
            
            if not logo_uri:
                links = content.get('links', {})
                logo_uri = links.get('image')
            
            if not logo_uri:
                logo_uri = f"https://static.jup.ag/tokens/gen/{mint}.png"

            # Clean symbol
            symbol = symbol.replace('\u0000', '')

            # Insert
            cursor.execute('''
                INSERT OR REPLACE INTO tokens (mint, symbol, decimals, logo_uri, is_active)
                VALUES (?, ?, ?, ?, 1)
            ''', (mint, symbol, decimals, logo_uri))
            count += 1
            
        conn.commit()
        conn.close()
        print(f"✅ Successfully updated {count} tokens in the database.")
        
    except Exception as e:
        print(f"❌ Database error: {e}")

if __name__ == "__main__":
    assets = fetch_metadata_helius(TOP_MINTS)
    update_database(assets)