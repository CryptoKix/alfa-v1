#!/usr/bin/env python3
"""
Jupiter Lend integration for yield opportunities.
https://dev.jup.ag/docs/lend/sdk
"""
import requests
from typing import List
from .yield_aggregator import YieldOpportunity, calculate_risk_level

JUPITER_LEND_API = "https://lend-api.jup.ag"
JUPITER_LOGO = "https://static.jup.ag/jup/icon.png"

# Token logos
TOKEN_LOGOS = {
    "SOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    "USDC": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    "USDT": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    "JUP": "https://static.jup.ag/jup/icon.png",
    "JitoSOL": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "mSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
}


def fetch_jupiter_lend_opportunities() -> List[YieldOpportunity]:
    """
    Fetch yield opportunities from Jupiter Lend.
    Jupiter Lend provides simple lending/borrowing markets.
    """
    opportunities = []

    try:
        # Get all lending tokens with details
        response = requests.get(
            f"{JUPITER_LEND_API}/v1/lending/tokens",
            timeout=10
        )

        if response.status_code != 200:
            print(f"Jupiter Lend API returned {response.status_code}")
            return opportunities

        data = response.json()
        tokens = data if isinstance(data, list) else data.get('tokens', [])

        for token in tokens:
            try:
                symbol = token.get('symbol', 'UNKNOWN')
                mint = token.get('mint', token.get('address', ''))

                # APY can be in different formats
                supply_rate = token.get('supplyRate', token.get('supplyApy', 0))
                if isinstance(supply_rate, str):
                    supply_rate = float(supply_rate)

                # Convert to percentage if needed (API might return as decimal)
                apy = supply_rate * 100 if supply_rate < 1 else supply_rate

                tvl = float(token.get('totalSupply', token.get('tvl', 0)))
                tvl_usd = float(token.get('totalSupplyUsd', tvl))

                if apy <= 0:
                    continue

                opp_data = {
                    'protocol': 'jupiter_lend',
                    'deposit_symbol': symbol,
                    'name': f"{symbol} Lending",
                    'apy': apy,
                    'oracle_free': False
                }
                risk_level, risk_factors = calculate_risk_level(opp_data)

                opportunities.append(YieldOpportunity(
                    protocol='jupiter_lend',
                    vault_address=mint,
                    name=f"{symbol} Lending",
                    deposit_token=mint,
                    deposit_symbol=symbol,
                    apy=round(apy, 2),
                    tvl=round(tvl_usd, 2),
                    risk_level=risk_level,
                    risk_factors=risk_factors,
                    min_deposit=0.001,
                    protocol_logo=JUPITER_LOGO,
                    token_logo=TOKEN_LOGOS.get(symbol, JUPITER_LOGO)
                ))
            except Exception as e:
                print(f"Error parsing Jupiter Lend token: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"Jupiter Lend request error: {e}")

    return opportunities


def get_jupiter_lend_quote(mint: str, amount: float, action: str = 'deposit') -> dict:
    """
    Get a quote for deposit or withdraw.

    Args:
        mint: Token mint address
        amount: Amount to deposit/withdraw
        action: 'deposit' or 'withdraw'

    Returns:
        Quote with expected shares/assets and fees
    """
    try:
        endpoint = f"{JUPITER_LEND_API}/v1/lending/{action}/quote"
        response = requests.get(
            endpoint,
            params={'mint': mint, 'amount': str(int(amount))},
            timeout=10
        )

        if response.status_code == 200:
            return response.json()

    except Exception as e:
        print(f"Jupiter Lend quote error: {e}")

    return {}


def build_jupiter_lend_deposit_ix(mint: str, amount: int, user_wallet: str) -> dict:
    """
    Build Jupiter Lend deposit instruction.

    Args:
        mint: Token mint address
        amount: Amount in smallest units (lamports/base units)
        user_wallet: User's wallet address

    Returns:
        Instruction data for deposit
    """
    try:
        response = requests.post(
            f"{JUPITER_LEND_API}/v1/lending/deposit",
            json={
                'asset': mint,
                'amount': str(amount),
                'signer': user_wallet
            },
            timeout=10
        )

        if response.status_code == 200:
            return response.json()

    except Exception as e:
        print(f"Jupiter Lend deposit build error: {e}")

    return {}


def build_jupiter_lend_withdraw_ix(mint: str, amount: int, user_wallet: str) -> dict:
    """
    Build Jupiter Lend withdraw instruction.

    Args:
        mint: Token mint address
        amount: Amount of shares to withdraw
        user_wallet: User's wallet address

    Returns:
        Instruction data for withdraw
    """
    try:
        response = requests.post(
            f"{JUPITER_LEND_API}/v1/lending/withdraw",
            json={
                'asset': mint,
                'amount': str(amount),
                'signer': user_wallet
            },
            timeout=10
        )

        if response.status_code == 200:
            return response.json()

    except Exception as e:
        print(f"Jupiter Lend withdraw build error: {e}")

    return {}
