#!/usr/bin/env python3
"""
Kamino Finance integration for yield opportunities.
Uses DefiLlama API for reliable yield data.
"""
import requests
from typing import List
from .yield_aggregator import YieldOpportunity, calculate_risk_level

DEFILLAMA_YIELDS_API = "https://yields.llama.fi/pools"
KAMINO_LOGO = "https://app.kamino.finance/favicon.ico"

# Token logos (common ones)
TOKEN_LOGOS = {
    "SOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    "USDC": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    "USDT": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    "JitoSOL": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "JITOSOL": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "mSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
    "bSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
    "JUPSOL": "https://static.jup.ag/jup/icon.png",
}


def fetch_kamino_opportunities() -> List[YieldOpportunity]:
    """
    Fetch yield opportunities from Kamino Finance via DefiLlama.
    DefiLlama aggregates reliable yield data from Kamino.
    """
    opportunities = []

    try:
        response = requests.get(DEFILLAMA_YIELDS_API, timeout=15)

        if response.status_code != 200:
            print(f"DefiLlama API returned {response.status_code}")
            return opportunities

        data = response.json()
        pools = data.get('data', []) if isinstance(data, dict) else data

        # Filter for Kamino pools on Solana
        kamino_pools = [
            p for p in pools
            if p.get('project', '').startswith('kamino') and p.get('chain') == 'Solana'
        ]

        for pool in kamino_pools:
            try:
                symbol = pool.get('symbol', 'UNKNOWN')
                pool_id = pool.get('pool', '')

                # APY from DefiLlama (already in percentage form)
                apy = float(pool.get('apy', 0) or 0)
                apy_base = float(pool.get('apyBase', 0) or 0)
                apy_reward = float(pool.get('apyReward', 0) or 0)

                # Use total APY, fall back to base + reward
                if apy == 0:
                    apy = apy_base + apy_reward

                tvl = float(pool.get('tvlUsd', 0) or 0)

                # Skip pools with no APY or tiny TVL
                if apy <= 0.01 or tvl < 10000:
                    continue

                # Determine if it's lending or liquidity
                project = pool.get('project', '')
                is_lending = 'lend' in project.lower()
                exposure = pool.get('exposure', 'single')

                if is_lending:
                    name = f"{symbol} Lending"
                elif exposure == 'multi' or '-' in symbol:
                    name = f"{symbol} LP"
                else:
                    name = f"{symbol} Vault"

                opp_data = {
                    'protocol': 'kamino',
                    'deposit_symbol': symbol.split('-')[0] if '-' in symbol else symbol,
                    'name': name,
                    'apy': apy,
                    'oracle_free': False
                }
                risk_level, risk_factors = calculate_risk_level(opp_data)

                # Add IL risk if present
                if pool.get('ilRisk') == 'yes' and 'impermanent_loss' not in risk_factors:
                    risk_factors.append('impermanent_loss')

                opportunities.append(YieldOpportunity(
                    protocol='kamino',
                    vault_address=pool_id,
                    name=name,
                    deposit_token=pool.get('underlyingTokens', [''])[0] if pool.get('underlyingTokens') else '',
                    deposit_symbol=symbol,
                    apy=round(apy, 2),
                    tvl=round(tvl, 2),
                    risk_level=risk_level,
                    risk_factors=risk_factors,
                    min_deposit=0.01,
                    protocol_logo=KAMINO_LOGO,
                    token_logo=TOKEN_LOGOS.get(symbol.upper(), KAMINO_LOGO)
                ))
            except Exception as e:
                print(f"Error parsing Kamino pool: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"DefiLlama request error: {e}")

    return opportunities


# Sidecar URL
KAMINO_SIDECAR_URL = "http://127.0.0.1:5004"


def check_kamino_sidecar() -> bool:
    """Check if Kamino sidecar is running."""
    try:
        response = requests.get(f"{KAMINO_SIDECAR_URL}/health", timeout=2)
        return response.status_code == 200
    except:
        return False


def get_kamino_markets() -> List[dict]:
    """
    Get all Kamino lending markets from sidecar.

    Returns:
        List of reserve dictionaries with APY, TVL, etc.
    """
    try:
        response = requests.get(f"{KAMINO_SIDECAR_URL}/markets", timeout=15)
        if response.status_code == 200:
            data = response.json()
            return data.get('reserves', [])
    except requests.exceptions.RequestException as e:
        print(f"[Kamino] Markets request error: {e}")
    return []


def get_kamino_user_positions(wallet: str) -> List[dict]:
    """
    Get user's Kamino lending positions.

    Args:
        wallet: User's wallet address

    Returns:
        List of position dictionaries
    """
    try:
        response = requests.get(
            f"{KAMINO_SIDECAR_URL}/positions/{wallet}",
            timeout=15
        )
        if response.status_code == 200:
            data = response.json()
            return data.get('positions', [])
    except requests.exceptions.RequestException as e:
        print(f"[Kamino] Positions request error: {e}")
    return []


def build_kamino_deposit_ix(vault_address: str, amount: float, user_wallet: str) -> dict:
    """
    Build Kamino deposit transaction via sidecar.

    Args:
        vault_address: Reserve address or token mint
        amount: Amount to deposit in token units
        user_wallet: User's wallet address

    Returns:
        Dict with transaction and metadata
    """
    if not check_kamino_sidecar():
        return {
            'success': False,
            'error': 'Kamino sidecar not available. Start it with: cd backend/kamino_sidecar && npm start'
        }

    try:
        response = requests.post(
            f"{KAMINO_SIDECAR_URL}/build/deposit",
            json={
                'reserveAddress': vault_address,
                'amount': amount,
                'userWallet': user_wallet
            },
            timeout=15
        )

        if response.status_code == 200:
            return response.json()
        else:
            return {
                'success': False,
                'error': f'Sidecar error: {response.status_code}'
            }

    except requests.exceptions.RequestException as e:
        return {
            'success': False,
            'error': f'Request failed: {e}'
        }


def build_kamino_withdraw_ix(vault_address: str, shares: float, user_wallet: str) -> dict:
    """
    Build Kamino withdraw transaction via sidecar.

    Args:
        vault_address: Reserve address
        shares: Amount of cTokens/shares to withdraw
        user_wallet: User's wallet address

    Returns:
        Dict with transaction and metadata
    """
    if not check_kamino_sidecar():
        return {
            'success': False,
            'error': 'Kamino sidecar not available. Start it with: cd backend/kamino_sidecar && npm start'
        }

    try:
        response = requests.post(
            f"{KAMINO_SIDECAR_URL}/build/withdraw",
            json={
                'reserveAddress': vault_address,
                'shares': shares,
                'userWallet': user_wallet
            },
            timeout=15
        )

        if response.status_code == 200:
            return response.json()
        else:
            return {
                'success': False,
                'error': f'Sidecar error: {response.status_code}'
            }

    except requests.exceptions.RequestException as e:
        return {
            'success': False,
            'error': f'Request failed: {e}'
        }


def get_kamino_deposit_quote(reserve_address: str, amount: float) -> dict:
    """
    Get quote for Kamino deposit.

    Args:
        reserve_address: Reserve address or token mint
        amount: Amount to deposit

    Returns:
        Quote with estimated shares and current APY
    """
    try:
        response = requests.post(
            f"{KAMINO_SIDECAR_URL}/quote/deposit",
            json={
                'reserveAddress': reserve_address,
                'amount': amount
            },
            timeout=10
        )

        if response.status_code == 200:
            return response.json()

    except requests.exceptions.RequestException as e:
        print(f"[Kamino] Quote error: {e}")

    return {}
