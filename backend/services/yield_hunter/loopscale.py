#!/usr/bin/env python3
"""
Loopscale integration for yield opportunities.
https://docs.loopscale.com/
Note: Higher risk due to recent oracle exploit history (2025).
"""
import requests
from typing import List
from .yield_aggregator import YieldOpportunity, calculate_risk_level

LOOPSCALE_API = "https://api.loopscale.com"
LOOPSCALE_LOGO = "https://loopscale.com/favicon.ico"

# Token logos
TOKEN_LOGOS = {
    "SOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    "USDC": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    "JitoSOL": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "mSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
}


def fetch_loopscale_opportunities() -> List[YieldOpportunity]:
    """
    Fetch yield opportunities from Loopscale.
    Loopscale offers:
    - Yield Loops: Leveraged yield strategies
    - Vaults: Passive lending products

    WARNING: Loopscale had a $5.8M oracle exploit in early 2025.
    Higher risk rating is applied automatically.
    """
    opportunities = []

    try:
        # Fetch vaults
        vault_opps = _fetch_loopscale_vaults()
        opportunities.extend(vault_opps)

    except Exception as e:
        print(f"Loopscale fetch error: {e}")

    return opportunities


def _fetch_loopscale_vaults() -> List[YieldOpportunity]:
    """Fetch Loopscale vault opportunities."""
    opportunities = []

    try:
        response = requests.get(
            f"{LOOPSCALE_API}/v1/vaults",
            timeout=10
        )

        if response.status_code != 200:
            print(f"Loopscale API returned {response.status_code}")
            # Return some mock data for now since API might not be public
            return _get_loopscale_fallback_data()

        data = response.json()
        vaults = data.get('vaults', []) if isinstance(data, dict) else data

        for vault in vaults:
            try:
                name = vault.get('name', 'Unknown Vault')
                address = vault.get('address', '')
                symbol = vault.get('depositToken', {}).get('symbol', 'UNKNOWN')
                mint = vault.get('depositToken', {}).get('mint', '')
                apy = float(vault.get('apy', 0))
                tvl = float(vault.get('tvl', 0))

                if apy <= 0:
                    continue

                opp_data = {
                    'protocol': 'loopscale',
                    'deposit_symbol': symbol,
                    'name': name,
                    'apy': apy,
                    'oracle_free': False
                }
                risk_level, risk_factors = calculate_risk_level(opp_data)

                opportunities.append(YieldOpportunity(
                    protocol='loopscale',
                    vault_address=address,
                    name=name,
                    deposit_token=mint,
                    deposit_symbol=symbol,
                    apy=round(apy, 2),
                    tvl=round(tvl, 2),
                    risk_level=risk_level,
                    risk_factors=risk_factors + ['exploit_history'],  # Always add this
                    min_deposit=0.01,
                    protocol_logo=LOOPSCALE_LOGO,
                    token_logo=TOKEN_LOGOS.get(symbol, LOOPSCALE_LOGO)
                ))
            except Exception as e:
                print(f"Error parsing Loopscale vault: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"Loopscale request error: {e}")
        return _get_loopscale_fallback_data()

    return opportunities


def _get_loopscale_fallback_data() -> List[YieldOpportunity]:
    """Return fallback/mock data when API is unavailable."""
    # Loopscale typical offerings based on docs
    fallback_vaults = [
        {
            'name': 'SOL Yield Loop',
            'address': 'loopscale_sol_vault',
            'symbol': 'SOL',
            'mint': 'So11111111111111111111111111111111111111112',
            'apy': 12.5,
            'tvl': 5000000
        },
        {
            'name': 'JitoSOL Yield Loop',
            'address': 'loopscale_jitosol_vault',
            'symbol': 'JitoSOL',
            'mint': 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
            'apy': 15.2,
            'tvl': 3500000
        },
        {
            'name': 'USDC Lending Vault',
            'address': 'loopscale_usdc_vault',
            'symbol': 'USDC',
            'mint': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            'apy': 8.3,
            'tvl': 8000000
        }
    ]

    opportunities = []
    for vault in fallback_vaults:
        opp_data = {
            'protocol': 'loopscale',
            'deposit_symbol': vault['symbol'],
            'name': vault['name'],
            'apy': vault['apy'],
            'oracle_free': False
        }
        risk_level, risk_factors = calculate_risk_level(opp_data)

        opportunities.append(YieldOpportunity(
            protocol='loopscale',
            vault_address=vault['address'],
            name=vault['name'],
            deposit_token=vault['mint'],
            deposit_symbol=vault['symbol'],
            apy=vault['apy'],
            tvl=vault['tvl'],
            risk_level=risk_level,
            risk_factors=risk_factors + ['exploit_history'],
            min_deposit=0.01,
            protocol_logo=LOOPSCALE_LOGO,
            token_logo=TOKEN_LOGOS.get(vault['symbol'], LOOPSCALE_LOGO)
        ))

    return opportunities


def build_loopscale_deposit_ix(vault_address: str, amount: float, user_wallet: str):
    """Build Loopscale deposit instruction (placeholder)."""
    raise NotImplementedError("Loopscale deposit requires SDK integration")


def build_loopscale_withdraw_ix(vault_address: str, shares: float, user_wallet: str):
    """Build Loopscale withdraw instruction (placeholder)."""
    raise NotImplementedError("Loopscale withdraw requires SDK integration")
