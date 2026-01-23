#!/usr/bin/env python3
"""
Kamino Finance integration for yield opportunities.
https://docs.kamino.finance/
"""
import requests
from typing import List
from .yield_aggregator import YieldOpportunity, calculate_risk_level

KAMINO_API_BASE = "https://api.kamino.finance"
KAMINO_LOGO = "https://app.kamino.finance/favicon.ico"

# Token logos (common ones)
TOKEN_LOGOS = {
    "SOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    "USDC": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    "USDT": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    "JitoSOL": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "mSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
    "bSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
}


def fetch_kamino_opportunities() -> List[YieldOpportunity]:
    """
    Fetch yield opportunities from Kamino Finance.
    Kamino offers:
    - Lending vaults (supply assets to earn yield)
    - Liquidity vaults (automated LP management)
    """
    opportunities = []

    try:
        # Fetch lending markets
        lending_opps = _fetch_kamino_lending()
        opportunities.extend(lending_opps)

        # Fetch liquidity vaults (strategies)
        vault_opps = _fetch_kamino_vaults()
        opportunities.extend(vault_opps)

    except Exception as e:
        print(f"Kamino fetch error: {e}")

    return opportunities


def _fetch_kamino_lending() -> List[YieldOpportunity]:
    """Fetch Kamino lending market opportunities."""
    opportunities = []

    try:
        # Kamino Lend API - Get all markets
        response = requests.get(
            f"{KAMINO_API_BASE}/v1/lending/markets",
            timeout=10
        )

        if response.status_code != 200:
            print(f"Kamino lending API returned {response.status_code}")
            return opportunities

        data = response.json()
        markets = data.get('markets', []) if isinstance(data, dict) else data

        for market in markets:
            try:
                symbol = market.get('symbol', 'UNKNOWN')
                mint = market.get('mint', '')
                supply_apy = float(market.get('supplyApy', 0)) * 100  # Convert to percentage
                tvl = float(market.get('totalSupplyUsd', 0))

                if supply_apy <= 0 or tvl < 10000:  # Skip tiny/inactive markets
                    continue

                opp_data = {
                    'protocol': 'kamino',
                    'deposit_symbol': symbol,
                    'name': f"{symbol} Lending",
                    'apy': supply_apy,
                    'oracle_free': False
                }
                risk_level, risk_factors = calculate_risk_level(opp_data)

                opportunities.append(YieldOpportunity(
                    protocol='kamino',
                    vault_address=market.get('reserve', mint),
                    name=f"{symbol} Lending",
                    deposit_token=mint,
                    deposit_symbol=symbol,
                    apy=round(supply_apy, 2),
                    tvl=round(tvl, 2),
                    risk_level=risk_level,
                    risk_factors=risk_factors,
                    min_deposit=0.01,
                    protocol_logo=KAMINO_LOGO,
                    token_logo=TOKEN_LOGOS.get(symbol, KAMINO_LOGO)
                ))
            except Exception as e:
                print(f"Error parsing Kamino market: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"Kamino lending request error: {e}")

    return opportunities


def _fetch_kamino_vaults() -> List[YieldOpportunity]:
    """Fetch Kamino liquidity vault (strategy) opportunities."""
    opportunities = []

    try:
        # Kamino Strategies API
        response = requests.get(
            f"{KAMINO_API_BASE}/v1/strategies",
            timeout=10
        )

        if response.status_code != 200:
            print(f"Kamino strategies API returned {response.status_code}")
            return opportunities

        data = response.json()
        strategies = data.get('strategies', []) if isinstance(data, dict) else data

        for strategy in strategies:
            try:
                name = strategy.get('name', 'Unknown Vault')
                address = strategy.get('address', '')
                token_a = strategy.get('tokenASymbol', '')
                token_b = strategy.get('tokenBSymbol', '')
                apy = float(strategy.get('totalApy', 0)) * 100
                tvl = float(strategy.get('tvlUsd', 0))

                if apy <= 0 or tvl < 10000:
                    continue

                # For LP vaults, use the primary token
                deposit_symbol = token_a if token_a else 'LP'
                display_name = f"{token_a}-{token_b} Vault" if token_b else name

                opp_data = {
                    'protocol': 'kamino',
                    'deposit_symbol': deposit_symbol,
                    'name': display_name,
                    'apy': apy,
                    'oracle_free': False
                }
                risk_level, risk_factors = calculate_risk_level(opp_data)

                opportunities.append(YieldOpportunity(
                    protocol='kamino',
                    vault_address=address,
                    name=display_name,
                    deposit_token=strategy.get('tokenAMint', ''),
                    deposit_symbol=deposit_symbol,
                    apy=round(apy, 2),
                    tvl=round(tvl, 2),
                    risk_level=risk_level,
                    risk_factors=risk_factors,
                    min_deposit=0.01,
                    protocol_logo=KAMINO_LOGO,
                    token_logo=TOKEN_LOGOS.get(deposit_symbol, KAMINO_LOGO)
                ))
            except Exception as e:
                print(f"Error parsing Kamino strategy: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"Kamino strategies request error: {e}")

    return opportunities


# Deposit/Withdraw transaction building will be added when needed
def build_kamino_deposit_ix(vault_address: str, amount: float, user_wallet: str):
    """Build Kamino deposit instruction (placeholder for SDK integration)."""
    raise NotImplementedError("Kamino deposit requires SDK integration")


def build_kamino_withdraw_ix(vault_address: str, shares: float, user_wallet: str):
    """Build Kamino withdraw instruction (placeholder for SDK integration)."""
    raise NotImplementedError("Kamino withdraw requires SDK integration")
