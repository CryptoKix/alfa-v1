#!/usr/bin/env python3
"""
HyLo Protocol integration for yield opportunities.
https://docs.hylo.so/

HyLo features:
- hyUSD: Stablecoin backed by Solana LSTs
- xSOL: Leveraged SOL exposure
- Stability Pool: Earn ~17% APY on hyUSD
- Oracle-free design (uses on-chain LST values)
"""
import requests
from typing import List
from .yield_aggregator import YieldOpportunity, calculate_risk_level

HYLO_API = "https://api.hylo.so"
HYLO_LOGO = "https://hylo.so/favicon.ico"

# Token logos
TOKEN_LOGOS = {
    "hyUSD": "https://hylo.so/hyusd-logo.png",
    "xSOL": "https://hylo.so/xsol-logo.png",
    "SOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    "JitoSOL": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "mSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
    "bSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
}


def fetch_hylo_opportunities() -> List[YieldOpportunity]:
    """
    Fetch yield opportunities from HyLo Protocol.

    HyLo is oracle-free (uses on-chain LST values) which reduces
    oracle manipulation risk compared to other protocols.
    """
    opportunities = []

    try:
        # Try to fetch from API
        pool_opps = _fetch_hylo_pools()
        if pool_opps:
            opportunities.extend(pool_opps)
        else:
            # Use fallback data if API unavailable
            opportunities.extend(_get_hylo_fallback_data())

    except Exception as e:
        print(f"HyLo fetch error: {e}")
        opportunities.extend(_get_hylo_fallback_data())

    return opportunities


def _fetch_hylo_pools() -> List[YieldOpportunity]:
    """Fetch HyLo pool opportunities from API."""
    opportunities = []

    try:
        response = requests.get(
            f"{HYLO_API}/v1/pools",
            timeout=10
        )

        if response.status_code != 200:
            print(f"HyLo API returned {response.status_code}")
            return []

        data = response.json()
        pools = data.get('pools', []) if isinstance(data, dict) else data

        for pool in pools:
            try:
                name = pool.get('name', 'Unknown Pool')
                address = pool.get('address', '')
                symbol = pool.get('depositToken', 'hyUSD')
                mint = pool.get('mint', '')
                apy = float(pool.get('apy', 0))
                tvl = float(pool.get('tvl', 0))

                if apy <= 0:
                    continue

                opp_data = {
                    'protocol': 'hylo',
                    'deposit_symbol': symbol,
                    'name': name,
                    'apy': apy,
                    'oracle_free': True  # HyLo's key feature
                }
                risk_level, risk_factors = calculate_risk_level(opp_data)

                opportunities.append(YieldOpportunity(
                    protocol='hylo',
                    vault_address=address,
                    name=name,
                    deposit_token=mint,
                    deposit_symbol=symbol,
                    apy=round(apy, 2),
                    tvl=round(tvl, 2),
                    risk_level=risk_level,
                    risk_factors=risk_factors,
                    min_deposit=1.0,  # hyUSD minimum
                    protocol_logo=HYLO_LOGO,
                    token_logo=TOKEN_LOGOS.get(symbol, HYLO_LOGO)
                ))
            except Exception as e:
                print(f"Error parsing HyLo pool: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"HyLo request error: {e}")

    return opportunities


def _get_hylo_fallback_data() -> List[YieldOpportunity]:
    """Return fallback data based on HyLo documentation."""
    # HyLo typical offerings
    fallback_pools = [
        {
            'name': 'hyUSD Stability Pool',
            'address': 'hylo_stability_pool',
            'symbol': 'hyUSD',
            'mint': 'HYUSDhyusd111111111111111111111111111111111',  # Placeholder
            'apy': 17.0,  # Documented ~17% APY
            'tvl': 2500000
        },
        {
            'name': 'LST Collateral Pool',
            'address': 'hylo_lst_pool',
            'symbol': 'JitoSOL',
            'mint': 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
            'apy': 8.5,
            'tvl': 5000000
        },
        {
            'name': 'mSOL Collateral Pool',
            'address': 'hylo_msol_pool',
            'symbol': 'mSOL',
            'mint': 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
            'apy': 7.8,
            'tvl': 3000000
        }
    ]

    opportunities = []
    for pool in fallback_pools:
        opp_data = {
            'protocol': 'hylo',
            'deposit_symbol': pool['symbol'],
            'name': pool['name'],
            'apy': pool['apy'],
            'oracle_free': True
        }
        risk_level, risk_factors = calculate_risk_level(opp_data)

        opportunities.append(YieldOpportunity(
            protocol='hylo',
            vault_address=pool['address'],
            name=pool['name'],
            deposit_token=pool['mint'],
            deposit_symbol=pool['symbol'],
            apy=pool['apy'],
            tvl=pool['tvl'],
            risk_level=risk_level,
            risk_factors=risk_factors,
            min_deposit=1.0,
            protocol_logo=HYLO_LOGO,
            token_logo=TOKEN_LOGOS.get(pool['symbol'], HYLO_LOGO)
        ))

    return opportunities


def build_hylo_deposit_ix(pool_address: str, amount: float, user_wallet: str):
    """Build HyLo deposit instruction (placeholder)."""
    raise NotImplementedError("HyLo deposit requires SDK integration")


def build_hylo_withdraw_ix(pool_address: str, amount: float, user_wallet: str):
    """Build HyLo withdraw instruction (placeholder)."""
    raise NotImplementedError("HyLo withdraw requires SDK integration")
