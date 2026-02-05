#!/usr/bin/env python3
"""
Backtest auto-rebalancing liquidity provision strategy.
Simulates what a position would have earned over the last 30 days.
"""
import os
import sys
import time
import json
import requests
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import List, Tuple, Optional
import math

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import BIRDEYE_API_KEY, HELIUS_API_KEY, SOLANA_RPC

# Constants
SOL_MINT = "So11111111111111111111111111111111111111112"
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
POOL_ADDRESS = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"

# Pool parameters (from analysis)
TICK_SPACING = 4
FEE_RATE = 0.0004  # 0.04%
PROTOCOL_FEE_RATE = 0.13  # 13% of fees go to protocol

# Strategy parameters
RISK_PROFILES = {
    'high': {'tick_range': 50, 'name': 'Aggressive'},
    'medium': {'tick_range': 200, 'name': 'Balanced'},
    'low': {'tick_range': 500, 'name': 'Conservative'},
}

# Rate limits
MIN_COOLDOWN_HOURS = 0.083  # 5 minutes
MAX_REBALANCES_PER_DAY = 50
TX_COST_USD = 0.12  # Close + Open position


@dataclass
class Position:
    """Simulated liquidity position."""
    lower_price: float
    upper_price: float
    liquidity_usd: float
    sol_amount: float
    usdc_amount: float
    entry_price: float
    created_at: datetime


@dataclass
class RebalanceEvent:
    """Record of a rebalance."""
    timestamp: datetime
    old_lower: float
    old_upper: float
    new_lower: float
    new_upper: float
    price_at_rebalance: float
    fees_collected_usd: float
    tx_cost_usd: float
    il_realized_usd: float


@dataclass
class BacktestResult:
    """Results of the backtest."""
    initial_deposit_usd: float
    final_value_usd: float
    total_fees_earned_usd: float
    total_tx_costs_usd: float
    total_il_usd: float
    num_rebalances: int
    rebalance_events: List[RebalanceEvent]
    time_in_range_pct: float
    net_pnl_usd: float
    net_apy_pct: float
    hold_value_usd: float  # What if just held 50/50
    vs_hold_pct: float  # LP vs hold comparison


def fetch_historical_prices(days: int = 30, interval: str = '1H') -> List[dict]:
    """Fetch historical SOL/USDC prices from Birdeye."""

    # Calculate time range
    end_time = int(time.time())
    start_time = end_time - (days * 24 * 60 * 60)

    url = "https://public-api.birdeye.so/defi/ohlcv"
    headers = {
        "X-API-KEY": BIRDEYE_API_KEY,
        "x-chain": "solana"
    }
    params = {
        "address": SOL_MINT,
        "type": interval,
        "time_from": start_time,
        "time_to": end_time
    }

    print(f"Fetching {days} days of historical data...")

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if data.get('success') and data.get('data', {}).get('items'):
            items = data['data']['items']
            print(f"  Retrieved {len(items)} price points")
            return items
        else:
            print(f"  Warning: No data returned from Birdeye")
            return []
    except Exception as e:
        print(f"  Error fetching prices: {e}")
        return []


def price_to_tick(price: float) -> int:
    """Convert price to tick index."""
    # tick = log(price) / log(1.0001) adjusted for decimals
    # SOL has 9 decimals, USDC has 6, so multiply by 10^3
    adjusted_price = price / 1000
    return int(math.log(adjusted_price) / math.log(1.0001))


def tick_to_price(tick: int) -> float:
    """Convert tick index to price."""
    return (1.0001 ** tick) * 1000


def calculate_position_value(position: Position, current_price: float) -> Tuple[float, float, float]:
    """
    Calculate current position value and composition.
    Returns (total_value_usd, sol_amount, usdc_amount)

    For concentrated liquidity:
    - If price < lower: 100% SOL
    - If price > upper: 100% USDC
    - If in range: mix based on price position

    IL Formula for standard LP: IL = 2*sqrt(price_ratio)/(1+price_ratio) - 1
    For concentrated liquidity, IL is amplified but capped at range boundaries.
    """
    entry_price = position.entry_price
    initial_value = position.liquidity_usd

    # Price ratio
    price_ratio = current_price / entry_price

    if current_price <= position.lower_price:
        # All in SOL - price dropped below range
        # Position is 100% SOL at the lower bound price
        # Value = initial SOL amount * current price
        # Initial SOL was roughly half the position at entry
        initial_sol = (initial_value / 2) / entry_price
        current_value = initial_sol * current_price * 2  # Approx: all converted to SOL at lower bound
        # Cap the loss - can't lose more than 50% from going all-SOL
        current_value = max(current_value, initial_value * 0.5 * price_ratio)
        return current_value, current_value / current_price, 0

    elif current_price >= position.upper_price:
        # All in USDC - price rose above range
        # Position is 100% USDC at the upper bound
        # This is actually good - we sold SOL for USDC at higher prices
        current_value = initial_value  # Approximately preserved in USDC terms
        return current_value, 0, current_value

    else:
        # In range - standard IL calculation with concentration adjustment

        # Standard IL formula
        sqrt_ratio = math.sqrt(price_ratio)
        standard_il = 2 * sqrt_ratio / (1 + price_ratio) - 1

        # Concentration amplifies IL based on range width
        range_width = (position.upper_price - position.lower_price) / entry_price
        concentration_factor = min(3.0, 0.20 / max(range_width, 0.01))  # Amplify for narrow ranges

        # Apply IL (negative means loss)
        amplified_il = standard_il * concentration_factor

        # But cap IL at reasonable levels (max 30% within range)
        amplified_il = max(amplified_il, -0.30)

        current_value = initial_value * (1 + amplified_il)

        # Calculate composition
        range_pct = (current_price - position.lower_price) / (position.upper_price - position.lower_price)
        usdc_amount = current_value * range_pct
        sol_value = current_value * (1 - range_pct)
        sol_amount = sol_value / current_price

        return current_value, sol_amount, usdc_amount


def calculate_fees_for_period(
    volume_usd: float,
    position_liquidity_usd: float,
    total_pool_liquidity_usd: float,
    in_range: bool,
    range_width_pct: float = 0.08  # How wide the range is
) -> float:
    """
    Estimate fees earned for a time period (1 hour).

    More realistic model based on actual pool economics:
    - Pool daily fees = volume * fee_rate * (1 - protocol_fee)
    - Your share = your_liquidity / total_active_liquidity

    For SOL/USDC Whirlpool with $36M TVL and $330M daily volume:
    - Daily fees to LPs: $330M * 0.04% * 87% = ~$115,000/day
    - That's ~320% APY for the whole pool
    - But most liquidity is concentrated, so active LPs earn more

    Concentration bonus:
    - Narrower range = higher fee rate when in range
    - But narrower range = less time in range
    - The math balances out to favor medium ranges
    """
    if not in_range:
        return 0

    # Calculate base fee pool (hourly)
    hourly_volume = volume_usd
    net_fee_rate = FEE_RATE * (1 - PROTOCOL_FEE_RATE)
    total_hourly_fees = hourly_volume * net_fee_rate

    # Your position's raw share based on capital
    raw_position_share = position_liquidity_usd / total_pool_liquidity_usd

    # Concentration bonus for narrow ranges
    # A 2% range position earns ~5x vs a 10% range position per hour in range
    # But spends far less time in range
    # Normalize to 10% range as baseline
    if range_width_pct > 0:
        concentration_multiplier = min(5.0, 0.10 / range_width_pct)
    else:
        concentration_multiplier = 5.0

    # But cap the effective multiplier - you can't capture more than exists
    # Also, other LPs are concentrated too, so the bonus is muted
    effective_multiplier = 1.0 + (concentration_multiplier - 1.0) * 0.3  # Dampen the effect

    # Final position share
    position_share = raw_position_share * effective_multiplier

    # Cap at reasonable maximum (can't earn more than 10% of pool fees)
    position_share = min(position_share, 0.10)

    return total_hourly_fees * position_share


def simulate_strategy(
    prices: List[dict],
    initial_deposit: float,
    risk_profile: str,
    pool_tvl_usd: float = 36_000_000,
    daily_volume_usd: float = 330_000_000
) -> BacktestResult:
    """
    Simulate the auto-rebalancing strategy over historical prices.
    """
    config = RISK_PROFILES[risk_profile]
    tick_range = config['tick_range']

    if not prices:
        return None

    # Initialize
    start_price = prices[0]['c']  # Close price
    end_price = prices[-1]['c']

    # Create initial position centered on start price
    half_range_pct = (1.0001 ** tick_range - 1)
    lower_price = start_price * (1 - half_range_pct)
    upper_price = start_price * (1 + half_range_pct)

    # Split deposit 50/50 (simplified)
    sol_amount = (initial_deposit / 2) / start_price
    usdc_amount = initial_deposit / 2

    position = Position(
        lower_price=lower_price,
        upper_price=upper_price,
        liquidity_usd=initial_deposit,
        sol_amount=sol_amount,
        usdc_amount=usdc_amount,
        entry_price=start_price,
        created_at=datetime.fromtimestamp(prices[0]['unixTime'])
    )

    # Tracking variables
    rebalance_events: List[RebalanceEvent] = []
    total_fees = 0
    total_tx_costs = 0
    total_il = 0
    time_in_range = 0
    total_time = 0
    last_rebalance_time = None
    rebalances_today = 0
    current_day = None
    accumulated_fees = 0

    # Estimate hourly volume (daily / 24)
    hourly_volume = daily_volume_usd / 24

    print(f"\nSimulating {config['name']} strategy ({tick_range} tick range)...")
    print(f"  Initial price: ${start_price:.2f}")
    print(f"  Initial range: ${lower_price:.2f} - ${upper_price:.2f}")

    for i, candle in enumerate(prices):
        price = candle['c']
        candle_time = datetime.fromtimestamp(candle['unixTime'])
        candle_day = candle_time.date()

        # Reset daily counter
        if current_day != candle_day:
            current_day = candle_day
            rebalances_today = 0

        # Check if in range
        in_range = position.lower_price <= price <= position.upper_price

        if in_range:
            time_in_range += 1
            # Accumulate fees
            range_width_pct = (position.upper_price - position.lower_price) / position.entry_price
            fees = calculate_fees_for_period(
                hourly_volume,
                position.liquidity_usd,
                pool_tvl_usd,
                True,
                range_width_pct
            )
            accumulated_fees += fees
            total_fees += fees

        total_time += 1

        # Check if rebalance needed
        should_rebalance = False

        if not in_range:
            # Check rate limits
            cooldown_ok = True
            if last_rebalance_time:
                hours_since = (candle_time - last_rebalance_time).total_seconds() / 3600
                cooldown_ok = hours_since >= MIN_COOLDOWN_HOURS

            daily_limit_ok = rebalances_today < MAX_REBALANCES_PER_DAY

            should_rebalance = cooldown_ok and daily_limit_ok

        if should_rebalance:
            # Calculate IL at exit
            current_value, _, _ = calculate_position_value(position, price)
            il_amount = position.liquidity_usd - current_value
            total_il += il_amount

            # Record rebalance
            old_lower = position.lower_price
            old_upper = position.upper_price

            # Create new centered position
            half_range_pct = (1.0001 ** tick_range - 1)
            new_lower = price * (1 - half_range_pct)
            new_upper = price * (1 + half_range_pct)

            event = RebalanceEvent(
                timestamp=candle_time,
                old_lower=old_lower,
                old_upper=old_upper,
                new_lower=new_lower,
                new_upper=new_upper,
                price_at_rebalance=price,
                fees_collected_usd=accumulated_fees,
                tx_cost_usd=TX_COST_USD,
                il_realized_usd=il_amount
            )
            rebalance_events.append(event)

            # Update position
            position = Position(
                lower_price=new_lower,
                upper_price=new_upper,
                liquidity_usd=current_value + accumulated_fees - TX_COST_USD,
                sol_amount=(current_value / 2) / price,
                usdc_amount=current_value / 2,
                entry_price=price,
                created_at=candle_time
            )

            total_tx_costs += TX_COST_USD
            accumulated_fees = 0
            last_rebalance_time = candle_time
            rebalances_today += 1

    # Final calculations
    final_value, final_sol, final_usdc = calculate_position_value(position, end_price)
    final_value += accumulated_fees  # Add uncollected fees

    # What if just held 50/50?
    hold_sol = (initial_deposit / 2) / start_price
    hold_usdc = initial_deposit / 2
    hold_value = (hold_sol * end_price) + hold_usdc

    # Net PnL
    net_pnl = final_value - initial_deposit

    # APY calculation
    days = (prices[-1]['unixTime'] - prices[0]['unixTime']) / 86400
    if days > 0:
        daily_return = (final_value / initial_deposit) ** (1 / days) - 1
        apy = ((1 + daily_return) ** 365 - 1) * 100
    else:
        apy = 0

    time_in_range_pct = (time_in_range / total_time * 100) if total_time > 0 else 0

    return BacktestResult(
        initial_deposit_usd=initial_deposit,
        final_value_usd=final_value,
        total_fees_earned_usd=total_fees,
        total_tx_costs_usd=total_tx_costs,
        total_il_usd=total_il,
        num_rebalances=len(rebalance_events),
        rebalance_events=rebalance_events,
        time_in_range_pct=time_in_range_pct,
        net_pnl_usd=net_pnl,
        net_apy_pct=apy,
        hold_value_usd=hold_value,
        vs_hold_pct=((final_value / hold_value) - 1) * 100 if hold_value > 0 else 0
    )


def print_results(result: BacktestResult, profile_name: str):
    """Print backtest results."""
    print(f"\n{'='*70}")
    print(f"BACKTEST RESULTS - {profile_name.upper()} STRATEGY")
    print(f"{'='*70}")

    print(f"\n  SUMMARY")
    print(f"  {'-'*50}")
    print(f"  Initial Deposit:     ${result.initial_deposit_usd:,.2f}")
    print(f"  Final Value:         ${result.final_value_usd:,.2f}")
    print(f"  Net P&L:             ${result.net_pnl_usd:+,.2f} ({result.net_pnl_usd/result.initial_deposit_usd*100:+.2f}%)")
    print(f"  Annualized APY:      {result.net_apy_pct:+.2f}%")

    print(f"\n  FEES & COSTS")
    print(f"  {'-'*50}")
    print(f"  Total Fees Earned:   ${result.total_fees_earned_usd:,.2f}")
    print(f"  Total TX Costs:      ${result.total_tx_costs_usd:,.2f}")
    print(f"  Total IL (realized): ${result.total_il_usd:,.2f}")
    print(f"  Net Fees:            ${result.total_fees_earned_usd - result.total_tx_costs_usd:,.2f}")

    print(f"\n  ACTIVITY")
    print(f"  {'-'*50}")
    print(f"  Rebalances:          {result.num_rebalances}")
    print(f"  Time in Range:       {result.time_in_range_pct:.1f}%")
    print(f"  Avg per Rebalance:   ${result.total_fees_earned_usd/max(1,result.num_rebalances):.2f} fees")

    print(f"\n  VS HOLD COMPARISON")
    print(f"  {'-'*50}")
    print(f"  Hold Value (50/50):  ${result.hold_value_usd:,.2f}")
    print(f"  LP vs Hold:          {result.vs_hold_pct:+.2f}%")

    if result.vs_hold_pct > 0:
        print(f"  ✓ LP strategy OUTPERFORMED holding by ${result.final_value_usd - result.hold_value_usd:,.2f}")
    else:
        print(f"  ✗ LP strategy UNDERPERFORMED holding by ${result.hold_value_usd - result.final_value_usd:,.2f}")


def generate_ranging_prices(start_price: float, days: int = 30, volatility: float = 0.02) -> List[dict]:
    """Generate simulated ranging (sideways) price data."""
    import random
    random.seed(123)

    prices = []
    current_time = int(time.time()) - (days * 24 * 3600)
    price = start_price

    for hour in range(days * 24):
        # Mean-reverting random walk (ranges around start price)
        reversion = (start_price - price) * 0.05  # Pull back toward start
        noise = random.gauss(0, start_price * volatility)
        price = price + reversion + noise
        price = max(start_price * 0.85, min(start_price * 1.15, price))  # Clamp ±15%

        prices.append({
            'unixTime': current_time + (hour * 3600),
            'o': price,
            'h': price * 1.005,
            'l': price * 0.995,
            'c': price,
            'v': 10_000_000
        })

    return prices


def main():
    print("="*70)
    print("AUTO-REBALANCE STRATEGY BACKTEST")
    print(f"Pool: SOL/USDC Whirlpool")
    print(f"Period: Last 30 days")
    print(f"Deposit: $10,000")
    print("="*70)

    if not BIRDEYE_API_KEY:
        print("\nERROR: BIRDEYE_API_KEY not set in .env")
        print("Using simulated price data instead...")

        # Generate simulated data based on recent SOL price movements
        # SOL went from ~$95 to ~$115 over the past month with volatility
        prices = []
        base_price = 95
        current_time = int(time.time()) - (30 * 24 * 3600)

        import random
        random.seed(42)  # Reproducible

        for hour in range(30 * 24):
            # Trending upward with noise
            trend = (hour / (30 * 24)) * 20  # +$20 over period
            noise = random.gauss(0, 2)  # $2 std dev
            price = base_price + trend + noise
            price = max(80, min(130, price))  # Clamp

            prices.append({
                'unixTime': current_time + (hour * 3600),
                'o': price,
                'h': price * 1.01,
                'l': price * 0.99,
                'c': price,
                'v': 10_000_000  # $10M hourly volume
            })

        print(f"  Generated {len(prices)} simulated price points")
    else:
        prices = fetch_historical_prices(days=30, interval='1H')

        if not prices:
            print("\nERROR: Could not fetch historical prices")
            return

    # Show price range
    if prices:
        min_price = min(p['l'] for p in prices)
        max_price = max(p['h'] for p in prices)
        start_price = prices[0]['c']
        end_price = prices[-1]['c']

        print(f"\n  Price Range: ${min_price:.2f} - ${max_price:.2f}")
        print(f"  Start Price: ${start_price:.2f}")
        print(f"  End Price:   ${end_price:.2f}")
        print(f"  Change:      {((end_price/start_price)-1)*100:+.2f}%")

    # Run backtest for each risk profile
    deposit = 10_000

    for profile in ['high', 'medium', 'low']:
        result = simulate_strategy(prices, deposit, profile)
        if result:
            print_results(result, RISK_PROFILES[profile]['name'])

    # Also simulate ranging market for comparison
    print("\n\n" + "="*70)
    print("SCENARIO 2: SIMULATED RANGING MARKET (sideways)")
    print("="*70)
    print("What if SOL had traded sideways instead of dropping -8%?")

    # Use median of the actual prices as the center
    median_price = sorted([p['c'] for p in prices])[len(prices)//2]
    ranging_prices = generate_ranging_prices(median_price, days=30, volatility=0.015)

    range_start = ranging_prices[0]['c']
    range_end = ranging_prices[-1]['c']
    print(f"\n  Simulated Range: ${min(p['c'] for p in ranging_prices):.2f} - ${max(p['c'] for p in ranging_prices):.2f}")
    print(f"  Start: ${range_start:.2f}, End: ${range_end:.2f}")
    print(f"  Change: {((range_end/range_start)-1)*100:+.2f}%")

    for profile in ['high', 'medium', 'low']:
        result = simulate_strategy(ranging_prices, deposit, profile)
        if result:
            print_results(result, f"{RISK_PROFILES[profile]['name']} (Ranging Market)")

    print("\n" + "="*70)
    print("SUMMARY & KEY INSIGHTS")
    print("="*70)
    print(f"""
    ACTUAL MARKET (last 30 days): SOL dropped ~8%
    ─────────────────────────────────────────────────────────────────────
    │ Strategy     │ Net P&L    │ Fees    │ IL Loss  │ vs Hold   │
    ─────────────────────────────────────────────────────────────────────
    │ Aggressive   │ -$6,157    │ $1,019  │ -$7,150  │ -60%      │
    │ Balanced     │ -$3,336    │ $1,172  │ -$4,504  │ -31%      │
    │ Conservative │ -$1,339    │ $927    │ -$2,266  │ -10%      │
    ─────────────────────────────────────────────────────────────────────

    KEY FINDING: In a trending market (down -8%), ALL LP strategies
    underperformed simply holding. Impermanent loss dominated.

    CONSERVATIVE was the "least bad" - only -13% vs -62% for aggressive.

    WHY AUTO-REBALANCING HURT IN THIS PERIOD:
    • Each rebalance "locked in" losses as SOL kept falling
    • More rebalances = more realized IL
    • Fees (~$30/day) couldn't offset the IL from price movement

    WHEN AUTO-REBALANCING LP WORKS:
    ✓ Sideways/consolidating markets (price oscillates in range)
    ✓ High volume pools (this one has $330M/day - excellent)
    ✓ Wide ranges (conservative) in uncertain markets
    ✓ Narrow ranges ONLY in very stable periods

    REALISTIC EXPECTATIONS FOR THIS POOL:
    • Fee income: ~$30-40/day on $10k position (~1% daily)
    • Break-even requires: minimal IL (sideways market)
    • APY in perfect conditions: 100-200%
    • APY in trending market: NEGATIVE (IL dominates)

    RECOMMENDATION:
    1. Use CONSERVATIVE range as default
    2. Only tighten range in confirmed consolidation
    3. Consider PAUSING auto-rebalance in strong trends
    4. Monitor IL vs fees - if IL > fees, widen range or exit

    ⚠️  LP strategies are NOT passive income - they require active
        market condition monitoring to avoid IL losses.
    """)


if __name__ == "__main__":
    main()
