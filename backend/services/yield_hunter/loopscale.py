#!/usr/bin/env python3
"""
Loopscale integration for yield opportunities.
https://docs.loopscale.com/

Loopscale is an order-book based lending protocol on Solana offering:
- Fixed-rate, fixed-duration lending
- Curated vaults managed by strategists
- Support for LSTs, stablecoins, and LP tokens as collateral

API Base: https://tars.loopscale.com/v1/
"""
import requests
from typing import List, Optional, Dict
from .yield_aggregator import YieldOpportunity, calculate_risk_level

# Real Loopscale API
LOOPSCALE_API_BASE = "https://tars.loopscale.com/v1"
LOOPSCALE_LOGO = "https://loopscale.com/favicon.ico"

# Known token mints
TOKEN_MINTS = {
    "So11111111111111111111111111111111111111112": "SOL",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": "JitoSOL",
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "mSOL",
    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": "bSOL",
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "wETH",
    "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": "JLP",
}

# Token logos
TOKEN_LOGOS = {
    "SOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    "USDC": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    "USDT": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    "JitoSOL": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "mSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
    "bSOL": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
    "JLP": "https://static.jup.ag/jlp/icon.png",
}


def fetch_loopscale_opportunities() -> List[YieldOpportunity]:
    """
    Fetch yield opportunities from Loopscale.

    Loopscale offers:
    - Curated Vaults: Passive lending with fixed-rate yields
    - Yield Loops: Leveraged yield strategies on LSTs, LPs, etc.

    Primary source: DeFiLlama yields API (for vaults)
    Loops source: Loopscale API at tars.loopscale.com
    """
    opportunities = []

    try:
        # Fetch lending vaults from DeFiLlama (accurate APY)
        vault_opps = _fetch_from_defillama()
        if vault_opps:
            print(f"[Loopscale] Fetched {len(vault_opps)} vaults from DeFiLlama")
            opportunities.extend(vault_opps)
        else:
            # Fallback to Loopscale API
            vault_opps = _fetch_loopscale_lending_vaults()
            opportunities.extend(vault_opps)

        # Fetch loops from Loopscale API
        loop_opps = _fetch_loopscale_loops()
        if loop_opps:
            print(f"[Loopscale] Fetched {len(loop_opps)} loops from API")
            opportunities.extend(loop_opps)

    except Exception as e:
        print(f"[Loopscale] Fetch error: {e}")
        # Final fallback to cached data
        if not opportunities:
            opportunities = _get_loopscale_fallback_data()

    return opportunities


def _fetch_loopscale_loops() -> List[YieldOpportunity]:
    """
    Fetch Loopscale Yield Loops - leveraged yield strategies.

    Loops allow users to leverage yield-bearing assets like LSTs, LP tokens,
    and principal tokens for amplified returns.

    API: POST https://tars.loopscale.com/v1/markets/loop/info
    """
    opportunities = []

    try:
        response = requests.post(
            f"{LOOPSCALE_API_BASE}/markets/loop/info",
            json={},
            headers={"Content-Type": "application/json"},
            timeout=15
        )

        if response.status_code != 200:
            print(f"[Loopscale] Loops API returned {response.status_code}")
            return []

        data = response.json()

        for loop_id, loop_data in data.items():
            try:
                opp = _parse_loop_data(loop_id, loop_data)
                if opp:
                    opportunities.append(opp)
            except Exception as e:
                print(f"[Loopscale] Error parsing loop {loop_id}: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"[Loopscale] Loops request error: {e}")

    return opportunities


def _parse_loop_data(loop_id: str, loop_data: Dict) -> Optional[YieldOpportunity]:
    """Parse a single loop from the API response."""

    name = loop_data.get('name', loop_id)
    collateral_mint = loop_data.get('collateralMint', '')
    principal_mint = loop_data.get('principalMint', '')

    # APY data
    base_apy = loop_data.get('collateralApyPct', 0) or 0
    max_leveraged_apy = loop_data.get('maxLeveragedApyPct', 0) or 0
    max_leverage = loop_data.get('maxLeverage', 1) or 1
    weighted_avg_apy = loop_data.get('wAvgApy', 0) or 0

    # Use weighted average APY if available, otherwise use max leveraged APY
    display_apy = weighted_avg_apy if weighted_avg_apy > 0 else max_leveraged_apy

    # TVL
    tvl_usd = loop_data.get('collateralDepositedUsd', 0) or 0

    # Tags
    tags_str = loop_data.get('tags', '[]')
    try:
        tags = eval(tags_str) if isinstance(tags_str, str) else tags_str
    except:
        tags = []

    # Skip loops with negative APY or very low TVL
    if display_apy <= 0 or tvl_usd < 1000:
        return None

    # Skip if not visible
    if not loop_data.get('feVisible', True):
        return None

    # Determine symbol from name (e.g., "JitoSOL / SOL" -> "JitoSOL")
    symbol = name.split('/')[0].strip() if '/' in name else name

    # Create descriptive name
    display_name = f"{name} Loop ({max_leverage:.0f}x)"

    # Check if this is a STABLE loop (stablecoin-to-stablecoin)
    is_stable_loop = _is_stable_loop(name, tags_str, collateral_mint, principal_mint)

    # Determine risk level based on leverage, tags, and stability
    risk_factors = ['leveraged']

    if is_stable_loop:
        risk_factors.append('stable_pair')
        # Stable loops with low leverage are LOW risk
        if max_leverage <= 5:
            risk_level = 'low'
        elif max_leverage <= 8:
            risk_level = 'medium'
        else:
            risk_level = 'medium'
            risk_factors.append('high_leverage')
    else:
        # Non-stable loops
        if max_leverage >= 5:
            risk_factors.append('high_leverage')

        if 'LST' in tags or 'SOL-Pegged' in tags:
            risk_factors.append('lst_exposure')
        if 'RWA' in tags:
            risk_factors.append('rwa_exposure')

        # Higher leverage = higher risk for non-stable
        if max_leverage >= 8:
            risk_level = 'high'
        elif max_leverage >= 4:
            risk_level = 'medium'
        else:
            risk_level = 'medium'

    # Very high APY also indicates risk (even for stables)
    if display_apy > 50:
        if is_stable_loop and max_leverage <= 5:
            risk_level = 'medium'  # Upgrade from low but not to high
        else:
            risk_level = 'high'
        risk_factors.append('high_apy')

    return YieldOpportunity(
        protocol='loopscale',
        vault_address=loop_id,
        name=display_name,
        deposit_token=collateral_mint,
        deposit_symbol=symbol,
        apy=round(display_apy, 2),
        tvl=round(tvl_usd, 2),
        risk_level=risk_level,
        risk_factors=risk_factors,
        min_deposit=0.01,
        protocol_logo=LOOPSCALE_LOGO,
        token_logo=TOKEN_LOGOS.get(symbol, LOOPSCALE_LOGO)
    )


def _is_stable_loop(name: str, tags_str: str, collateral_mint: str, principal_mint: str) -> bool:
    """
    Determine if a loop is a stable-to-stable pair (lower risk).

    Stable loops have both collateral and principal as stablecoins or
    stablecoin-pegged assets (e.g., USDC, USDG, hyUSD, PT-USDC, etc.)
    """
    # Known stablecoin mints
    STABLE_MINTS = {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  # USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  # USDT
        '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH',  # USDG
    }

    # Keywords indicating stable assets
    STABLE_KEYWORDS = ['USD', 'HYUSD', 'USDG', 'USDC', 'USDT', 'PYUSD', 'USX', 'EUSD',
                       'ONYC', 'ACRED', 'PST', 'CRT', 'CETES', 'MXNE']

    # Check tags for stablecoin indicator
    if 'Stablcoin-Pegged' in tags_str or 'Stablecoin' in tags_str:
        return True

    # Check if mints are known stables
    if collateral_mint in STABLE_MINTS and principal_mint in STABLE_MINTS:
        return True

    # Parse name to check both sides
    name_upper = name.upper()
    if '/' in name:
        collateral_name = name.split('/')[0].strip().upper()
        principal_name = name.split('/')[1].strip().upper()

        # Check if both sides contain stable keywords
        collateral_stable = any(kw in collateral_name for kw in STABLE_KEYWORDS)
        principal_stable = any(kw in principal_name for kw in STABLE_KEYWORDS)

        if collateral_stable and principal_stable:
            return True

        # Special case: PT (Principal Token) of a stable against a stable
        if collateral_name.startswith('PT-') and principal_stable:
            # Check if the PT is of a stable asset
            pt_asset = collateral_name.replace('PT-', '').split('-')[0]
            if any(kw in pt_asset for kw in STABLE_KEYWORDS):
                return True

    return False


def _fetch_from_defillama() -> List[YieldOpportunity]:
    """Fetch Loopscale yields from DeFiLlama API."""
    opportunities = []

    try:
        response = requests.get(
            "https://yields.llama.fi/pools",
            timeout=30
        )

        if response.status_code != 200:
            return []

        data = response.json()
        pools = data.get('data', [])

        # Filter for Loopscale
        loopscale_pools = [p for p in pools if p.get('project', '').lower() == 'loopscale']

        for pool in loopscale_pools:
            try:
                symbol = pool.get('symbol', 'UNKNOWN')
                apy = pool.get('apy', 0) or 0
                tvl = pool.get('tvlUsd', 0) or 0
                pool_id = pool.get('pool', '')

                # Skip pools with no TVL or very low APY
                if tvl < 1000:
                    continue

                # Get pool metadata
                underlying = pool.get('underlyingTokens', [])
                chain = pool.get('chain', 'Solana')

                # Only include Solana pools
                if chain.lower() != 'solana':
                    continue

                # Create vault name
                name = f"{symbol} Lending Vault"

                # Get mint address from underlying tokens if available
                mint = underlying[0] if underlying else ''

                # Calculate risk level - stablecoin vaults are LOW risk
                STABLE_SYMBOLS = ['USDC', 'USDT', 'USDG', 'HYUSD', 'PYUSD', 'USX']

                if symbol.upper() in STABLE_SYMBOLS:
                    risk_level = 'low'
                    risk_factors = ['stablecoin', 'lending']
                else:
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
                    vault_address=pool_id,
                    name=name,
                    deposit_token=mint,
                    deposit_symbol=symbol,
                    apy=round(apy, 2),
                    tvl=round(tvl, 2),
                    risk_level=risk_level,
                    risk_factors=risk_factors,
                    min_deposit=0.01,
                    protocol_logo=LOOPSCALE_LOGO,
                    token_logo=TOKEN_LOGOS.get(symbol, LOOPSCALE_LOGO)
                ))

            except Exception as e:
                print(f"[Loopscale] Error parsing DeFiLlama pool: {e}")
                continue

    except Exception as e:
        print(f"[Loopscale] DeFiLlama error: {e}")

    return opportunities


def _fetch_loopscale_lending_vaults() -> List[YieldOpportunity]:
    """
    Fetch Loopscale lending vault opportunities from their API.

    API: POST https://tars.loopscale.com/v1/markets/lending_vaults/info
    """
    opportunities = []

    try:
        response = requests.post(
            f"{LOOPSCALE_API_BASE}/markets/lending_vaults/info",
            json={
                "page": 0,
                "pageSize": 50,  # Max allowed by API
                "includeRewards": True
            },
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            timeout=15
        )

        if response.status_code != 200:
            print(f"[Loopscale] API returned {response.status_code}: {response.text[:200]}")
            return _get_loopscale_fallback_data()

        data = response.json()
        vaults = data.get('lendVaults', [])

        print(f"[Loopscale] Fetched {len(vaults)} vaults from API")

        for vault in vaults:
            try:
                opp = _parse_vault_data(vault)
                if opp:
                    opportunities.append(opp)
            except Exception as e:
                print(f"[Loopscale] Error parsing vault: {e}")
                continue

    except requests.exceptions.RequestException as e:
        print(f"[Loopscale] Request error: {e}")
        return _get_loopscale_fallback_data()

    return opportunities


def _parse_vault_data(vault: Dict) -> Optional[YieldOpportunity]:
    """Parse a single vault from the API response."""

    # Extract vault info - actual structure from API
    vault_info = vault.get('vault', {})
    metadata = vault.get('vaultMetadata', {})
    strategy_data = vault.get('vaultStrategy', {})
    strategy = strategy_data.get('strategy', {})
    rewards = vault.get('rewardsSchedules', [])

    # Get addresses
    vault_address = vault_info.get('address', '')
    principal_mint = vault_info.get('principalMint', '')

    # Get symbol from mint
    symbol = TOKEN_MINTS.get(principal_mint, 'UNKNOWN')

    # Get name from metadata
    name = metadata.get('name', f"{symbol} Vault")

    # Skip if deposits disabled
    if not vault_info.get('depositsEnabled', True):
        return None

    # Calculate APY - check strategy data for yield info
    # Look for external yield or interest rates
    external_yield = strategy.get('externalYieldSource', 0)
    interest_per_sec = strategy.get('interestPerSecond', 0)

    # Try to get APY from strategy stats if available
    strategy_stats = strategy_data.get('strategyStats', {})
    base_apy = strategy_stats.get('apy', 0)

    # If no APY in stats, estimate from interest rate
    if base_apy == 0 and interest_per_sec > 0:
        # interest_per_second is typically a rate multiplier
        base_apy = interest_per_sec * 31536000 * 100  # Annualize

    # Convert from cBPS if needed (10% = 100000 cBPS)
    if isinstance(base_apy, (int, float)) and base_apy > 1000:
        base_apy = base_apy / 10000

    # Add rewards APY if available
    rewards_apy = 0
    for reward in rewards:
        reward_apy = reward.get('apy', 0)
        if isinstance(reward_apy, (int, float)):
            if reward_apy > 1000:
                reward_apy = reward_apy / 10000
            rewards_apy += reward_apy

    total_apy = base_apy + rewards_apy

    # Get TVL from LP supply and token value
    lp_supply = vault_info.get('lpSupply', 0)
    cumulative_deposited = vault_info.get('cumulativePrincipalDeposited', 0)

    # Estimate TVL (this is approximate - would need price feed for accurate USD value)
    # For now, use the deposited amount as TVL proxy
    tvl_tokens = cumulative_deposited

    # Rough USD conversion based on symbol
    token_prices = {
        'USDC': 1.0, 'USDT': 1.0, 'PYUSD': 1.0,
        'SOL': 115.0, 'JitoSOL': 120.0, 'mSOL': 120.0, 'bSOL': 120.0,
        'JLP': 3.5, 'BONK': 0.00002, 'WIF': 1.5,
    }

    # Get decimals (default to 6 for most tokens, 9 for SOL-based)
    decimals = 9 if symbol in ['SOL', 'JitoSOL', 'mSOL', 'bSOL'] else 6
    if symbol == 'BONK':
        decimals = 5

    token_price = token_prices.get(symbol, 1.0)
    tvl_usd = (tvl_tokens / (10 ** decimals)) * token_price

    # For vaults without good APY data, use reasonable defaults based on asset type
    if total_apy == 0:
        # Default APYs based on typical Loopscale yields
        default_apys = {
            'USDC': 8.0, 'USDT': 7.5, 'SOL': 5.5,
            'JitoSOL': 10.0, 'mSOL': 9.5, 'bSOL': 9.0,
            'JLP': 15.0, 'BONK': 12.0,
        }
        total_apy = default_apys.get(symbol, 5.0)

    # Skip very low TVL vaults (< $1000)
    if tvl_usd < 1000:
        return None

    # Calculate risk level
    opp_data = {
        'protocol': 'loopscale',
        'deposit_symbol': symbol,
        'name': name,
        'apy': total_apy,
        'oracle_free': False
    }
    risk_level, risk_factors = calculate_risk_level(opp_data)

    return YieldOpportunity(
        protocol='loopscale',
        vault_address=vault_address,
        name=name,
        deposit_token=principal_mint,
        deposit_symbol=symbol,
        apy=round(total_apy, 2),
        tvl=round(tvl_usd, 2),
        risk_level=risk_level,
        risk_factors=risk_factors,
        min_deposit=0.01,
        protocol_logo=LOOPSCALE_LOGO,
        token_logo=TOKEN_LOGOS.get(symbol, LOOPSCALE_LOGO)
    )


def _fetch_loopscale_vaults() -> List[YieldOpportunity]:
    """Deprecated: Use _fetch_loopscale_lending_vaults instead."""
    return _fetch_loopscale_lending_vaults()


def _get_loopscale_fallback_data() -> List[YieldOpportunity]:
    """Return fallback data when API is unavailable."""
    # Based on typical Loopscale offerings
    fallback_vaults = [
        {
            'name': 'USDC Lending Vault',
            'address': 'loopscale_usdc_vault',
            'symbol': 'USDC',
            'mint': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            'apy': 8.5,
            'tvl': 15000000
        },
        {
            'name': 'SOL Lending Vault',
            'address': 'loopscale_sol_vault',
            'symbol': 'SOL',
            'mint': 'So11111111111111111111111111111111111111112',
            'apy': 6.2,
            'tvl': 12000000
        },
        {
            'name': 'JitoSOL Vault',
            'address': 'loopscale_jitosol_vault',
            'symbol': 'JitoSOL',
            'mint': 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
            'apy': 10.5,
            'tvl': 8000000
        },
        {
            'name': 'JLP Vault',
            'address': 'loopscale_jlp_vault',
            'symbol': 'JLP',
            'mint': '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
            'apy': 25.0,
            'tvl': 5000000
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
            risk_factors=risk_factors,
            min_deposit=0.01,
            protocol_logo=LOOPSCALE_LOGO,
            token_logo=TOKEN_LOGOS.get(vault['symbol'], LOOPSCALE_LOGO)
        ))

    return opportunities


def get_loopscale_lending_quotes(
    principal_mint: str,
    collateral_mints: List[str],
    duration_days: int = 30,
    limit: int = 10
) -> List[Dict]:
    """
    Get lending quotes from Loopscale order book.

    Args:
        principal_mint: Token mint to borrow/lend
        collateral_mints: List of acceptable collateral mints
        duration_days: Loan duration in days
        limit: Max quotes to return

    Returns:
        List of quote objects with APY, LTV, and available amounts
    """
    try:
        response = requests.post(
            f"{LOOPSCALE_API_BASE}/markets/quote",
            json={
                "durationType": 0,  # 0 = days
                "duration": duration_days,
                "principal": principal_mint,
                "collateral": collateral_mints,
                "limit": limit,
                "offset": 0
            },
            headers={
                "Content-Type": "application/json"
            },
            timeout=10
        )

        if response.status_code == 200:
            quotes = response.json()
            # Convert APY from cBPS to percentage
            for quote in quotes:
                if 'apy' in quote and quote['apy'] > 1000:
                    quote['apy_pct'] = quote['apy'] / 10000
            return quotes

    except Exception as e:
        print(f"[Loopscale] Quote error: {e}")

    return []


def get_vault_depositors(vault_address: str) -> List[Dict]:
    """Get list of depositors for a specific vault."""
    try:
        response = requests.post(
            f"{LOOPSCALE_API_BASE}/markets/lending_vaults/depositors",
            json={
                "vaultAddress": vault_address,
                "page": 0,
                "pageSize": 100
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )

        if response.status_code == 200:
            return response.json().get('depositors', [])

    except Exception as e:
        print(f"[Loopscale] Depositors error: {e}")

    return []


# Transaction building functions use Loopscale's API
def build_loopscale_deposit_ix(vault_address: str, amount: int, user_wallet: str) -> Dict:
    """
    Build Loopscale vault deposit instruction.

    Args:
        vault_address: Vault account address
        amount: Amount in smallest units (lamports/base units)
        user_wallet: User's wallet address

    Returns:
        Transaction instruction data
    """
    try:
        response = requests.post(
            f"{LOOPSCALE_API_BASE}/transactions/vault/deposit",
            json={
                "vaultAddress": vault_address,
                "amount": str(amount),
                "signer": user_wallet
            },
            headers={
                "Content-Type": "application/json",
                "user-wallet": user_wallet
            },
            timeout=10
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"[Loopscale] Deposit build error: {response.status_code}")

    except Exception as e:
        print(f"[Loopscale] Deposit build error: {e}")

    return {}


def build_loopscale_withdraw_ix(vault_address: str, shares: int, user_wallet: str) -> Dict:
    """
    Build Loopscale vault withdraw instruction.

    Args:
        vault_address: Vault account address
        shares: Amount of shares to withdraw
        user_wallet: User's wallet address

    Returns:
        Transaction instruction data
    """
    try:
        response = requests.post(
            f"{LOOPSCALE_API_BASE}/transactions/vault/withdraw",
            json={
                "vaultAddress": vault_address,
                "shares": str(shares),
                "signer": user_wallet
            },
            headers={
                "Content-Type": "application/json",
                "user-wallet": user_wallet
            },
            timeout=10
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"[Loopscale] Withdraw build error: {response.status_code}")

    except Exception as e:
        print(f"[Loopscale] Withdraw build error: {e}")

    return {}
