#!/usr/bin/env python3
"""Fetch top 100 tokens by market cap and store in database."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
from database import TactixDB
from config import BIRDEYE_API_KEY

JUPITER_TOKEN_LIST = "https://token.jup.ag/strict"
BIRDEYE_TOKEN_LIST = "https://public-api.birdeye.so/defi/tokenlist"

# Hardcoded top Solana tokens as fallback (updated Jan 2025)
HARDCODED_TOP_TOKENS = [
    {"mint": "So11111111111111111111111111111111111111112", "symbol": "SOL", "name": "Solana", "decimals": 9, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png", "market_cap": 100000000000},
    {"mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "symbol": "USDC", "name": "USD Coin", "decimals": 6, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png", "market_cap": 50000000000},
    {"mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "symbol": "USDT", "name": "Tether USD", "decimals": 6, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg", "market_cap": 40000000000},
    {"mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "symbol": "JUP", "name": "Jupiter", "decimals": 6, "logo_uri": "https://static.jup.ag/jup/icon.png", "market_cap": 2000000000},
    {"mint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "symbol": "WIF", "name": "dogwifhat", "decimals": 6, "logo_uri": "https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betiez6mxhpb67vprdm4e.ipfs.nftstorage.link/", "market_cap": 1800000000},
    {"mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "symbol": "BONK", "name": "Bonk", "decimals": 5, "logo_uri": "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I", "market_cap": 1500000000},
    {"mint": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", "symbol": "PYTH", "name": "Pyth Network", "decimals": 6, "logo_uri": "https://pyth.network/token.svg", "market_cap": 1200000000},
    {"mint": "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", "symbol": "JTO", "name": "Jito", "decimals": 9, "logo_uri": "https://metadata.jito.network/token/jto/image", "market_cap": 1100000000},
    {"mint": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", "symbol": "RAY", "name": "Raydium", "decimals": 6, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png", "market_cap": 800000000},
    {"mint": "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux", "symbol": "HNT", "name": "Helium", "decimals": 8, "logo_uri": "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/hnt.png", "market_cap": 700000000},
    {"mint": "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof", "symbol": "RNDR", "name": "Render Token", "decimals": 8, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/logo.png", "market_cap": 650000000},
    {"mint": "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ", "symbol": "W", "name": "Wormhole", "decimals": 6, "logo_uri": "https://wormhole.com/token.png", "market_cap": 600000000},
    {"mint": "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", "symbol": "MEW", "name": "cat in a dogs world", "decimals": 5, "logo_uri": "https://bafkreidlwyr565dxtao2ipsze6bmzpszqzybz7sqi2zaet5fs7k53henju.ipfs.nftstorage.link/", "market_cap": 550000000},
    {"mint": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", "symbol": "ORCA", "name": "Orca", "decimals": 6, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png", "market_cap": 500000000},
    {"mint": "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6", "symbol": "MOBILE", "name": "Helium Mobile", "decimals": 6, "logo_uri": "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/mobile.png", "market_cap": 450000000},
    {"mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "symbol": "POPCAT", "name": "Popcat", "decimals": 9, "logo_uri": "https://bafkreidvkvuzyslw5jh5z242lgzwzhbi2kxxnpkwznhfksbo5sm2hjqhmu.ipfs.nftstorage.link/", "market_cap": 400000000},
    {"mint": "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm", "symbol": "INF", "name": "Sanctum Infinity", "decimals": 9, "logo_uri": "https://arweave.net/LApvZp6pS9PQG_qRJgNhPLMKqsQGvzLXJpD3J3xIg6o", "market_cap": 350000000},
    {"mint": "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", "symbol": "mSOL", "name": "Marinade staked SOL", "decimals": 9, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png", "market_cap": 320000000},
    {"mint": "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1", "symbol": "bSOL", "name": "BlazeStake Staked SOL", "decimals": 9, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png", "market_cap": 300000000},
    {"mint": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", "symbol": "jitoSOL", "name": "Jito Staked SOL", "decimals": 9, "logo_uri": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png", "market_cap": 280000000},
    {"mint": "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", "symbol": "ETH", "name": "Ether (Portal)", "decimals": 8, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png", "market_cap": 250000000},
    {"mint": "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", "symbol": "WBTC", "name": "Wrapped BTC (Portal)", "decimals": 8, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh/logo.png", "market_cap": 240000000},
    {"mint": "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7", "symbol": "DRIFT", "name": "Drift Protocol", "decimals": 6, "logo_uri": "https://drift-public.s3.eu-west-1.amazonaws.com/drift-logo.png", "market_cap": 230000000},
    {"mint": "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6", "symbol": "TNSR", "name": "Tensor", "decimals": 9, "logo_uri": "https://arweave.net/hZ-6lF5yB9cP-NvqLYz_xB9g0X7v5gPXqL-iNp_zVVU", "market_cap": 220000000},
    {"mint": "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7", "symbol": "NOS", "name": "Nosana", "decimals": 6, "logo_uri": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7/logo.png", "market_cap": 210000000},
    {"mint": "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS", "symbol": "KMNO", "name": "Kamino", "decimals": 6, "logo_uri": "https://cdn.kamino.finance/kamino-logo.svg", "market_cap": 200000000},
    {"mint": "SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y", "symbol": "SHDW", "name": "Shadow Token", "decimals": 9, "logo_uri": "https://shdw-drive.genesysgo.net/FDcC9gn12fFkSU2KuQYH4TUjihrZxiTodFRWNF4ns9Kt/250x250_with_bg.png", "market_cap": 180000000},
    {"mint": "METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m", "symbol": "MPLX", "name": "Metaplex", "decimals": 6, "logo_uri": "https://arweave.net/VRKOcXIvCxqp35RZ9I0-bDGk9LkVFzg7ZgNG0fEjdpo", "market_cap": 170000000},
    {"mint": "BLZEEuZUBVqFhj8adcCFPJvPVCiCyVmh3hkJMrU8KuJA", "symbol": "BLZE", "name": "Blaze", "decimals": 9, "logo_uri": "https://solblaze.org/assets/blze.png", "market_cap": 160000000},
    {"mint": "A3eME5CetyZPBoWbRUwY3tSe25S6tb18ba9ZPbWk9eFJ", "symbol": "PENG", "name": "Peng", "decimals": 6, "logo_uri": "https://bafybeifcanfzogzocxp2l3fckjdrb4wnntc3pbw4ek5wzyzl2wsmdybphi.ipfs.nftstorage.link/", "market_cap": 150000000},
]


def fetch_jupiter_tokens():
    """Fetch tokens from Jupiter's strict token list."""
    try:
        resp = requests.get(JUPITER_TOKEN_LIST, timeout=30)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"Error fetching Jupiter tokens: {e}")
    return []


def fetch_birdeye_top_tokens(limit=100):
    """Fetch top tokens by market cap from Birdeye."""
    import time as t

    if not BIRDEYE_API_KEY:
        print("BIRDEYE_API_KEY not set, skipping market cap data")
        return []

    all_tokens = []
    try:
        headers = {"X-API-KEY": BIRDEYE_API_KEY}
        # Fetch in batches (Birdeye limit is 50 per request)
        batch_size = 50
        for offset in range(0, limit, batch_size):
            params = {
                "sort_by": "v24hUSD",  # Sort by volume to avoid spam tokens
                "sort_type": "desc",
                "offset": offset,
                "limit": min(batch_size, limit - offset)
            }

            # Retry with backoff on rate limit
            for attempt in range(3):
                resp = requests.get(BIRDEYE_TOKEN_LIST, headers=headers, params=params, timeout=30)
                if resp.status_code == 200:
                    data = resp.json()
                    tokens = data.get("data", {}).get("tokens", [])
                    all_tokens.extend(tokens)
                    print(f"  Fetched {len(tokens)} tokens (offset {offset})")
                    break
                elif resp.status_code == 429:
                    wait = (attempt + 1) * 2
                    print(f"  Rate limited, waiting {wait}s...")
                    t.sleep(wait)
                else:
                    print(f"  Birdeye API error: {resp.status_code}")
                    break

            # Small delay between requests to avoid rate limiting
            t.sleep(0.5)
    except Exception as e:
        print(f"Error fetching Birdeye tokens: {e}")
    return all_tokens


def main():
    db = TactixDB()

    # Clear existing tokens to remove stale/spam data
    print("Clearing old token data...")
    with db._get_connection() as conn:
        conn.execute("DELETE FROM tokens")
        conn.commit()

    print("Fetching Birdeye top tokens by volume...")
    birdeye_tokens = fetch_birdeye_top_tokens(300)
    print(f"Got {len(birdeye_tokens)} tokens from Birdeye")

    tokens_to_save = []
    seen_mints = set()

    # Filter out spam/test tokens and normalize data
    for token in birdeye_tokens:
        mint = token.get("address")
        if not mint or mint in seen_mints:
            continue

        symbol = token.get("symbol", "")
        name = token.get("name", "")
        mc = token.get("mc", 0) or 0
        liquidity = token.get("liquidity", 0) or 0
        volume = token.get("v24hUSD", 0) or 0

        # Skip tokens with suspicious characteristics
        if not symbol or len(symbol) > 10:
            continue
        if liquidity < 100_000:  # Min $100K liquidity
            continue
        if mc > 500_000_000_000:  # Max $500B
            continue
        # Skip tokens with special characters in symbol (spam)
        if any(c in symbol for c in ['✅', '🔥', '🚀', '💎', '𐤯', ' ']):
            continue
        # Skip tokens with very long names (often spam)
        if len(name) > 40:
            continue

        seen_mints.add(mint)
        tokens_to_save.append({
            "mint": mint,
            "symbol": symbol,
            "name": name,
            "decimals": token.get("decimals", 9),
            "logo_uri": token.get("logoURI"),
            "market_cap": mc,
            "volume_24h": volume
        })

    # Merge with hardcoded tokens to ensure important ones are included
    for ht in HARDCODED_TOP_TOKENS:
        if ht["mint"] not in seen_mints:
            tokens_to_save.append(ht)
            seen_mints.add(ht["mint"])

    # Fallback to hardcoded tokens if API calls failed
    if len(tokens_to_save) < 10:
        print("Insufficient tokens from API, using hardcoded token list...")
        tokens_to_save = HARDCODED_TOP_TOKENS.copy()

    # Sort by market cap and take top 100
    tokens_to_save.sort(key=lambda x: x.get("market_cap", 0) or 0, reverse=True)
    tokens_to_save = tokens_to_save[:100]

    print(f"\nSaving {len(tokens_to_save)} tokens to database...")
    db.bulk_save_tokens(tokens_to_save)

    # Print top 15
    print("\nTop 15 tokens by market cap:")
    for i, t in enumerate(tokens_to_save[:15], 1):
        mc = t.get("market_cap", 0)
        mc_str = f"${mc/1e9:.2f}B" if mc >= 1e9 else f"${mc/1e6:.2f}M" if mc >= 1e6 else f"${mc:.0f}"
        print(f"  {i:2}. {t['symbol']:8} - {mc_str}")

    print("\nDone!")


if __name__ == "__main__":
    main()
