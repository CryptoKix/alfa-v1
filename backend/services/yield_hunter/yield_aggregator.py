#!/usr/bin/env python3
"""
Yield Aggregator - Multi-protocol yield opportunity aggregation and normalization.
"""
import time
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed

# In-memory cache
_opportunities_cache: Dict[str, tuple] = {}  # protocol -> (opportunities, timestamp)
CACHE_TTL_SECONDS = 60  # 1 minute cache


@dataclass
class YieldOpportunity:
    """Normalized yield opportunity across all protocols."""
    protocol: str           # 'kamino', 'jupiter_lend', 'loopscale', 'hylo'
    vault_address: str      # On-chain vault/pool address
    name: str               # Display name (e.g., "SOL Lending", "USDC Vault")
    deposit_token: str      # Token mint address to deposit
    deposit_symbol: str     # Token symbol (e.g., "USDC", "SOL")
    apy: float              # Current APY percentage
    tvl: float              # Total Value Locked in USD
    risk_level: str         # 'high', 'medium', 'low'
    risk_factors: List[str] # ['oracle', 'smart_contract', 'liquidation', 'impermanent_loss']
    min_deposit: float      # Minimum deposit amount (in token units)
    protocol_logo: str      # Protocol logo URL
    token_logo: str         # Deposit token logo URL

    def to_dict(self) -> dict:
        return asdict(self)


def calculate_risk_level(opportunity: dict) -> str:
    """
    Calculate risk level based on multiple factors.

    Risk Score:
    - 1-4: LOW (established protocols, stablecoins, no leverage)
    - 5-7: MEDIUM (LP positions, moderate oracle dependency)
    - 8+: HIGH (leveraged, new protocols, complex strategies)
    """
    risk_score = 0
    risk_factors = []

    protocol = opportunity.get('protocol', '').lower()
    deposit_symbol = opportunity.get('deposit_symbol', '').upper()
    name = opportunity.get('name', '').lower()

    # Protocol maturity (1-3 points)
    if protocol in ['kamino', 'jupiter_lend']:
        risk_score += 1  # Established, audited
    elif protocol == 'loopscale':
        risk_score += 3  # Recent exploit history
        risk_factors.append('exploit_history')
    elif protocol == 'hylo':
        risk_score += 2  # Newer protocol
        risk_factors.append('newer_protocol')

    # Asset type (1-3 points)
    if deposit_symbol in ['USDC', 'USDT', 'PYUSD']:
        risk_score += 1  # Stablecoins = lower risk
    elif deposit_symbol in ['SOL', 'JITOSOL', 'MSOL', 'BSOL']:
        risk_score += 2  # Native/LST assets
    else:
        risk_score += 3  # Other tokens
        risk_factors.append('volatile_asset')

    # Product type (0-3 points)
    if 'leverage' in name or 'loop' in name:
        risk_score += 3
        risk_factors.append('leveraged')
    if 'lp' in name or 'liquidity' in name:
        risk_score += 2
        risk_factors.append('impermanent_loss')

    # Oracle dependency
    if opportunity.get('oracle_free', False):
        risk_score += 0
    else:
        risk_score += 1
        risk_factors.append('oracle_dependency')

    # APY sanity check (very high APY = higher risk)
    apy = opportunity.get('apy', 0)
    if apy > 50:
        risk_score += 2
        risk_factors.append('high_apy')
    elif apy > 20:
        risk_score += 1

    # Classify
    if risk_score <= 4:
        return 'low', risk_factors
    elif risk_score <= 7:
        return 'medium', risk_factors
    else:
        return 'high', risk_factors


def get_opportunities_by_protocol(protocol: str) -> List[YieldOpportunity]:
    """Fetch opportunities from a specific protocol."""
    # Check cache
    if protocol in _opportunities_cache:
        opps, timestamp = _opportunities_cache[protocol]
        if time.time() - timestamp < CACHE_TTL_SECONDS:
            return opps

    opportunities = []

    try:
        if protocol == 'kamino':
            from .kamino import fetch_kamino_opportunities
            opportunities = fetch_kamino_opportunities()
        elif protocol == 'jupiter_lend':
            from .jupiter_lend import fetch_jupiter_lend_opportunities
            opportunities = fetch_jupiter_lend_opportunities()
        elif protocol == 'loopscale':
            from .loopscale import fetch_loopscale_opportunities
            opportunities = fetch_loopscale_opportunities()
        elif protocol == 'hylo':
            from .hylo import fetch_hylo_opportunities
            opportunities = fetch_hylo_opportunities()
    except Exception as e:
        print(f"Error fetching {protocol} opportunities: {e}")
        opportunities = []

    # Cache results
    _opportunities_cache[protocol] = (opportunities, time.time())
    return opportunities


def get_all_opportunities(
    risk_filter: Optional[str] = None,
    protocol_filter: Optional[str] = None
) -> List[YieldOpportunity]:
    """
    Aggregate opportunities from all protocols.

    Args:
        risk_filter: Filter by risk level ('low', 'medium', 'high')
        protocol_filter: Filter by protocol name

    Returns:
        List of YieldOpportunity objects sorted by APY descending
    """
    protocols = ['kamino', 'jupiter_lend', 'loopscale', 'hylo']

    if protocol_filter:
        protocols = [p for p in protocols if p == protocol_filter.lower()]

    all_opportunities = []

    # Fetch from all protocols in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(get_opportunities_by_protocol, p): p
            for p in protocols
        }

        for future in as_completed(futures):
            protocol = futures[future]
            try:
                opps = future.result()
                all_opportunities.extend(opps)
            except Exception as e:
                print(f"Error fetching {protocol}: {e}")

    # Apply risk filter
    if risk_filter:
        all_opportunities = [
            o for o in all_opportunities
            if o.risk_level == risk_filter.lower()
        ]

    # Sort by APY descending
    all_opportunities.sort(key=lambda x: x.apy, reverse=True)

    return all_opportunities


def clear_cache(protocol: Optional[str] = None):
    """Clear the opportunities cache."""
    global _opportunities_cache
    if protocol:
        _opportunities_cache.pop(protocol, None)
    else:
        _opportunities_cache = {}
