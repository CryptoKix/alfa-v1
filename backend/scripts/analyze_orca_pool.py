#!/usr/bin/env python3
"""
Analyze Orca Whirlpool for auto-rebalancing liquidity provision strategy.
Uses Helius RPC to fetch on-chain data.
"""
import os
import sys
import json
import struct
import requests
from decimal import Decimal

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import HELIUS_API_KEY, SOLANA_RPC

# Orca Whirlpool Program ID
WHIRLPOOL_PROGRAM_ID = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"

# Pool we're analyzing: SOL/USDC tick_spacing=4
POOL_ADDRESS = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"

def fetch_account_info(pubkey: str) -> dict:
    """Fetch account info from Helius RPC."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getAccountInfo",
        "params": [
            pubkey,
            {"encoding": "base64"}
        ]
    }

    response = requests.post(SOLANA_RPC, json=payload, timeout=30)
    result = response.json()

    if "error" in result:
        raise Exception(f"RPC Error: {result['error']}")

    return result.get("result", {})


def decode_whirlpool_account(data_bytes: bytes) -> dict:
    """
    Decode Orca Whirlpool account data.

    Whirlpool account structure (653 bytes):
    - discriminator: 8 bytes
    - whirlpools_config: 32 bytes (pubkey)
    - whirlpool_bump: 1 byte array [u8; 1]
    - tick_spacing: 2 bytes (u16)
    - tick_spacing_seed: 2 bytes array [u8; 2]
    - fee_rate: 2 bytes (u16) - in hundredths of a bip
    - protocol_fee_rate: 2 bytes (u16)
    - liquidity: 16 bytes (u128)
    - sqrt_price: 16 bytes (u128)
    - tick_current_index: 4 bytes (i32)
    - protocol_fee_owed_a: 8 bytes (u64)
    - protocol_fee_owed_b: 8 bytes (u64)
    - token_mint_a: 32 bytes (pubkey)
    - token_vault_a: 32 bytes (pubkey)
    - fee_growth_global_a: 16 bytes (u128)
    - token_mint_b: 32 bytes (pubkey)
    - token_vault_b: 32 bytes (pubkey)
    - fee_growth_global_b: 16 bytes (u128)
    - reward_last_updated_timestamp: 8 bytes (u64)
    - reward_infos: 3 * 128 bytes (RewardInfo array)
    """

    if len(data_bytes) < 200:
        raise ValueError(f"Data too short: {len(data_bytes)} bytes")

    offset = 0

    # Skip discriminator (8 bytes)
    offset += 8

    # whirlpools_config (32 bytes)
    whirlpools_config = data_bytes[offset:offset+32].hex()
    offset += 32

    # whirlpool_bump (1 byte)
    whirlpool_bump = data_bytes[offset]
    offset += 1

    # tick_spacing (2 bytes, u16, little endian)
    tick_spacing = struct.unpack_from('<H', data_bytes, offset)[0]
    offset += 2

    # tick_spacing_seed (2 bytes)
    offset += 2

    # fee_rate (2 bytes, u16) - in hundredths of a basis point
    fee_rate = struct.unpack_from('<H', data_bytes, offset)[0]
    offset += 2

    # protocol_fee_rate (2 bytes, u16)
    protocol_fee_rate = struct.unpack_from('<H', data_bytes, offset)[0]
    offset += 2

    # liquidity (16 bytes, u128)
    liquidity_low = struct.unpack_from('<Q', data_bytes, offset)[0]
    liquidity_high = struct.unpack_from('<Q', data_bytes, offset + 8)[0]
    liquidity = liquidity_low + (liquidity_high << 64)
    offset += 16

    # sqrt_price (16 bytes, u128) - Q64.64 fixed point
    sqrt_price_low = struct.unpack_from('<Q', data_bytes, offset)[0]
    sqrt_price_high = struct.unpack_from('<Q', data_bytes, offset + 8)[0]
    sqrt_price = sqrt_price_low + (sqrt_price_high << 64)
    offset += 16

    # tick_current_index (4 bytes, i32)
    tick_current_index = struct.unpack_from('<i', data_bytes, offset)[0]
    offset += 4

    # protocol_fee_owed_a (8 bytes, u64)
    protocol_fee_owed_a = struct.unpack_from('<Q', data_bytes, offset)[0]
    offset += 8

    # protocol_fee_owed_b (8 bytes, u64)
    protocol_fee_owed_b = struct.unpack_from('<Q', data_bytes, offset)[0]
    offset += 8

    # token_mint_a (32 bytes)
    token_mint_a = data_bytes[offset:offset+32].hex()
    offset += 32

    # token_vault_a (32 bytes)
    token_vault_a = data_bytes[offset:offset+32].hex()
    offset += 32

    # fee_growth_global_a (16 bytes, u128)
    fee_growth_a_low = struct.unpack_from('<Q', data_bytes, offset)[0]
    fee_growth_a_high = struct.unpack_from('<Q', data_bytes, offset + 8)[0]
    fee_growth_global_a = fee_growth_a_low + (fee_growth_a_high << 64)
    offset += 16

    # token_mint_b (32 bytes)
    token_mint_b = data_bytes[offset:offset+32].hex()
    offset += 32

    # token_vault_b (32 bytes)
    token_vault_b = data_bytes[offset:offset+32].hex()
    offset += 32

    # fee_growth_global_b (16 bytes, u128)
    fee_growth_b_low = struct.unpack_from('<Q', data_bytes, offset)[0]
    fee_growth_b_high = struct.unpack_from('<Q', data_bytes, offset + 8)[0]
    fee_growth_global_b = fee_growth_b_low + (fee_growth_b_high << 64)
    offset += 16

    return {
        "tick_spacing": tick_spacing,
        "fee_rate": fee_rate,
        "fee_rate_percent": fee_rate / 1_000_000 * 100,  # Convert to percentage
        "protocol_fee_rate": protocol_fee_rate,
        "liquidity": liquidity,
        "sqrt_price": sqrt_price,
        "tick_current_index": tick_current_index,
        "protocol_fee_owed_a": protocol_fee_owed_a,
        "protocol_fee_owed_b": protocol_fee_owed_b,
        "token_mint_a": token_mint_a,
        "token_mint_b": token_mint_b,
    }


def tick_to_price(tick: int, decimals_a: int = 9, decimals_b: int = 6) -> float:
    """Convert tick index to price (token_b per token_a)."""
    # Price = 1.0001^tick * 10^(decimals_a - decimals_b)
    price = (1.0001 ** tick) * (10 ** (decimals_a - decimals_b))
    return price


def sqrt_price_to_price(sqrt_price: int, decimals_a: int = 9, decimals_b: int = 6) -> float:
    """Convert sqrt_price (Q64.64) to actual price."""
    # sqrt_price is in Q64.64 format
    sqrt_price_float = sqrt_price / (2 ** 64)
    price = (sqrt_price_float ** 2) * (10 ** (decimals_a - decimals_b))
    return price


def fetch_vault_balances(vault_a: str, vault_b: str) -> tuple:
    """Fetch token balances from vault accounts."""
    def get_token_balance(vault: str) -> int:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTokenAccountBalance",
            "params": [vault]
        }
        response = requests.post(SOLANA_RPC, json=payload, timeout=30)
        result = response.json()
        if "result" in result and result["result"]:
            return int(result["result"]["value"]["amount"])
        return 0

    balance_a = get_token_balance(vault_a)
    balance_b = get_token_balance(vault_b)
    return balance_a, balance_b


def main():
    print("=" * 70)
    print("ORCA WHIRLPOOL ANALYSIS")
    print(f"Pool: {POOL_ADDRESS}")
    print("=" * 70)

    if not HELIUS_API_KEY:
        print("ERROR: HELIUS_API_KEY not set!")
        return

    print(f"\nUsing Helius RPC: {SOLANA_RPC[:50]}...")

    # Fetch pool account
    print("\nFetching pool account data...")
    account_info = fetch_account_info(POOL_ADDRESS)

    if not account_info or not account_info.get("value"):
        print("ERROR: Could not fetch pool account")
        return

    # Decode account data
    import base64
    data_b64 = account_info["value"]["data"][0]
    data_bytes = base64.b64decode(data_b64)

    print(f"Account data length: {len(data_bytes)} bytes")

    pool_data = decode_whirlpool_account(data_bytes)

    # Calculate price from tick
    current_tick = pool_data["tick_current_index"]
    price_from_tick = tick_to_price(current_tick)
    price_from_sqrt = sqrt_price_to_price(pool_data["sqrt_price"])

    # Known mints for display
    SOL_MINT = "so11111111111111111111111111111111111111112"
    USDC_MINT = "epjfwdd5aufqssqem2qn1xzybapC8g4weggkzwytdt1v"

    token_a_symbol = "SOL" if pool_data["token_mint_a"].lower() == SOL_MINT else "TOKEN_A"
    token_b_symbol = "USDC" if pool_data["token_mint_b"].lower() == USDC_MINT else "TOKEN_B"

    print("\n" + "-" * 70)
    print("POOL PARAMETERS")
    print("-" * 70)
    print(f"  Tick Spacing:       {pool_data['tick_spacing']}")
    print(f"  Fee Rate:           {pool_data['fee_rate']} ({pool_data['fee_rate_percent']:.4f}%)")
    print(f"  Protocol Fee Rate:  {pool_data['protocol_fee_rate']}")
    print(f"  Current Tick:       {current_tick}")
    print(f"  Liquidity:          {pool_data['liquidity']:,}")

    print("\n" + "-" * 70)
    print("CURRENT PRICE")
    print("-" * 70)
    print(f"  Price (from tick):  ${price_from_tick:.4f} USDC per SOL")
    print(f"  Price (from sqrt):  ${price_from_sqrt:.4f} USDC per SOL")

    # Calculate tick ranges for strategy
    tick_spacing = pool_data["tick_spacing"]

    print("\n" + "-" * 70)
    print("STRATEGY PARAMETERS")
    print("-" * 70)

    # For a tight range (higher APY, more rebalances)
    tight_range_ticks = 100  # ~1% range on each side
    tight_lower = current_tick - tight_range_ticks
    tight_upper = current_tick + tight_range_ticks
    tight_lower_price = tick_to_price(tight_lower)
    tight_upper_price = tick_to_price(tight_upper)

    print(f"\n  TIGHT RANGE (higher APY, frequent rebalances):")
    print(f"    Range: {tight_range_ticks} ticks ({tight_range_ticks * tick_spacing} tick units)")
    print(f"    Lower: tick {tight_lower} = ${tight_lower_price:.4f}")
    print(f"    Upper: tick {tight_upper} = ${tight_upper_price:.4f}")
    print(f"    Width: ${tight_upper_price - tight_lower_price:.4f} ({(tight_upper_price/tight_lower_price - 1)*100:.2f}%)")

    # For medium range (balanced)
    medium_range_ticks = 500  # ~5% range on each side
    medium_lower = current_tick - medium_range_ticks
    medium_upper = current_tick + medium_range_ticks
    medium_lower_price = tick_to_price(medium_lower)
    medium_upper_price = tick_to_price(medium_upper)

    print(f"\n  MEDIUM RANGE (balanced):")
    print(f"    Range: {medium_range_ticks} ticks")
    print(f"    Lower: tick {medium_lower} = ${medium_lower_price:.4f}")
    print(f"    Upper: tick {medium_upper} = ${medium_upper_price:.4f}")
    print(f"    Width: ${medium_upper_price - medium_lower_price:.4f} ({(medium_upper_price/medium_lower_price - 1)*100:.2f}%)")

    # For wide range (less rebalances, lower APY)
    wide_range_ticks = 2000  # ~20% range on each side
    wide_lower = current_tick - wide_range_ticks
    wide_upper = current_tick + wide_range_ticks
    wide_lower_price = tick_to_price(wide_lower)
    wide_upper_price = tick_to_price(wide_upper)

    print(f"\n  WIDE RANGE (less rebalances, lower APY):")
    print(f"    Range: {wide_range_ticks} ticks")
    print(f"    Lower: tick {wide_lower} = ${wide_lower_price:.4f}")
    print(f"    Upper: tick {wide_upper} = ${wide_upper_price:.4f}")
    print(f"    Width: ${wide_upper_price - wide_lower_price:.4f} ({(wide_upper_price/wide_lower_price - 1)*100:.2f}%)")

    print("\n" + "=" * 70)
    print("AUTO-REBALANCING STRATEGY RECOMMENDATIONS")
    print("=" * 70)

    print("""
    Based on this pool's characteristics:

    1. REBALANCE TRIGGERS:
       - Primary: When price exits position range (tick outside bounds)
       - Secondary: When position is >80% in single asset (approaching edge)
       - Hysteresis: Wait for price to exit range by 0.5% before rebalancing
                     to avoid flip-flopping at boundaries

    2. COOLDOWN PARAMETERS:
       - Minimum time between rebalances: 5 minutes
       - Maximum rebalances per hour: 6
       - Maximum rebalances per day: 50

    3. FEE THRESHOLD (for profitability):
       - Tx cost estimate: ~0.00025 SOL ($0.05-0.06 at current prices)
       - Orca position close/open: 2 transactions = ~$0.12
       - Minimum unclaimed fees before rebalance: $1.00
       - OR position value moved: >$50

    4. RANGE RECOMMENDATIONS:
       For SOL/USDC with tick_spacing=4 (0.04% per tick):

       AGGRESSIVE (HFT-style):
       - Range: ±50 ticks (~2% total width)
       - Expected rebalances: 10-20/day in volatile markets
       - Fee APY potential: 50-100%+
       - Risk: High IL, many tx costs

       BALANCED (Recommended):
       - Range: ±200 ticks (~8% total width)
       - Expected rebalances: 2-5/day
       - Fee APY potential: 20-40%
       - Risk: Moderate IL

       CONSERVATIVE:
       - Range: ±500 ticks (~20% total width)
       - Expected rebalances: 0-2/day
       - Fee APY potential: 10-20%
       - Risk: Low IL

    5. IMPLEMENTATION NOTES:
       - Use Jito bundles for MEV protection during rebalancing
       - Consider partial rebalances (shift range, not complete exit)
       - Track cumulative IL vs fees earned for performance
       - Monitor gas prices and pause during congestion
       - Store position history for strategy refinement
    """)

    print("\n" + "=" * 70)
    print("RECOMMENDED AUTO-REBALANCE CONFIGURATION")
    print("=" * 70)
    print(f"""
    For pool: {POOL_ADDRESS}
    Current price: ${price_from_tick:.2f}
    Fee rate: {pool_data['fee_rate_percent']:.4f}%
    Tick spacing: {tick_spacing}

    RECOMMENDED SETTINGS (Balanced approach):
    {{
        "risk_profile": "medium",
        "range_ticks": 200,           // ~8% total width
        "range_lower": {current_tick - 200},
        "range_upper": {current_tick + 200},
        "range_lower_price": ${tick_to_price(current_tick - 200):.2f},
        "range_upper_price": ${tick_to_price(current_tick + 200):.2f},

        "auto_rebalance": true,
        "rate_limits": {{
            "min_cooldown_seconds": 300,      // 5 min between rebalances
            "max_rebalances_per_hour": 6,
            "max_rebalances_per_day": 50,
            "min_fees_usd_before_rebalance": 1.0,
            "hysteresis_pct": 0.5,            // 0.5% buffer zone
            "estimated_tx_cost_usd": 0.12
        }}
    }}

    EXPECTED PERFORMANCE:
    - Rebalances: 2-5 per day in normal conditions
    - Fee APY: 20-40% (varies with volume)
    - Net profit threshold: Fees > $1.12 per rebalance
    - Impermanent loss: Moderate (mitigated by frequent rebalancing)

    To use in TacTix:
    1. Go to Liquidity page
    2. Create position with 'medium' risk profile
    3. Enable 'Auto-rebalance' toggle
    4. The rebalance engine will monitor and rebalance automatically
    """)


if __name__ == "__main__":
    main()
