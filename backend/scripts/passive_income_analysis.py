#!/usr/bin/env python3
"""
Analyze TacTix passive income infrastructure and recommend low-risk strategies.
"""
import os
import sys
import time

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.yield_hunter import get_all_opportunities


def analyze_yield_opportunities():
    """Analyze current yield opportunities across all protocols."""
    print("\n" + "="*70)
    print("YIELD HUNTER - CURRENT OPPORTUNITIES")
    print("="*70)

    try:
        opportunities = get_all_opportunities()

        if not opportunities:
            print("  No opportunities fetched (APIs may be down)")
            return []

        # Separate by risk level
        low_risk = [o for o in opportunities if o.risk_level == 'low']
        medium_risk = [o for o in opportunities if o.risk_level == 'medium']
        high_risk = [o for o in opportunities if o.risk_level == 'high']

        print(f"\nTotal Opportunities: {len(opportunities)}")
        print(f"  Low Risk:    {len(low_risk)}")
        print(f"  Medium Risk: {len(medium_risk)}")
        print(f"  High Risk:   {len(high_risk)}")

        print("\n" + "-"*70)
        print("LOW RISK OPPORTUNITIES (Lending/Staking)")
        print("-"*70)

        if low_risk:
            # Sort by APY
            low_risk.sort(key=lambda x: x.apy, reverse=True)
            print(f"{'Protocol':<15} {'Name':<25} {'APY':>8} {'TVL':>15} {'Risk Factors'}")
            print("-"*70)
            for opp in low_risk[:10]:
                factors = ', '.join(opp.risk_factors[:2]) if opp.risk_factors else 'None'
                print(f"{opp.protocol:<15} {opp.name[:24]:<25} {opp.apy:>7.2f}% ${opp.tvl/1e6:>10.2f}M  {factors}")
        else:
            print("  No low-risk opportunities found")

        print("\n" + "-"*70)
        print("MEDIUM RISK OPPORTUNITIES (LP Vaults)")
        print("-"*70)

        if medium_risk:
            medium_risk.sort(key=lambda x: x.apy, reverse=True)
            print(f"{'Protocol':<15} {'Name':<25} {'APY':>8} {'TVL':>15} {'Risk Factors'}")
            print("-"*70)
            for opp in medium_risk[:10]:
                factors = ', '.join(opp.risk_factors[:2]) if opp.risk_factors else 'None'
                print(f"{opp.protocol:<15} {opp.name[:24]:<25} {opp.apy:>7.2f}% ${opp.tvl/1e6:>10.2f}M  {factors}")
        else:
            print("  No medium-risk opportunities found")

        return opportunities

    except Exception as e:
        print(f"Error fetching opportunities: {e}")
        return []


def analyze_infrastructure():
    """Analyze all passive income infrastructure in TacTix."""

    print("="*70)
    print("TACTIX PASSIVE INCOME INFRASTRUCTURE ANALYSIS")
    print("="*70)

    print("""
    ┌─────────────────────────────────────────────────────────────────────┐
    │                    PASSIVE INCOME STRATEGIES                        │
    ├─────────────────────────────────────────────────────────────────────┤
    │                                                                     │
    │  1. YIELD HUNTER (Lending/Staking)          Risk: LOW ✓            │
    │     ├── Kamino Lending                      APY: 3-15%             │
    │     ├── Jupiter Lend                        APY: 2-12%             │
    │     ├── Loopscale Vaults                    APY: 8-15% (higher risk)│
    │     └── HyLo Protocol                       APY: 5-10%             │
    │                                                                     │
    │  2. LIQUIDITY PROVISION (DLMM/Orca)         Risk: MEDIUM-HIGH      │
    │     ├── Conservative Range                  APY: 10-30%*           │
    │     ├── Medium Range                        APY: 20-50%*           │
    │     └── Aggressive Range                    APY: 50-100%*          │
    │     * APY varies with market conditions, IL risk in trends         │
    │                                                                     │
    │  3. GRID BOTS (Range Trading)               Risk: MEDIUM           │
    │     ├── SOL/USDC Grid                       APY: 15-40%*           │
    │     └── BTC/USDC Grid                       APY: 10-30%*           │
    │     * Works best in ranging markets                                │
    │                                                                     │
    │  4. COPY TRADING (Whale Following)          Risk: HIGH             │
    │     └── Follow successful wallets           APY: Variable          │
    │                                                                     │
    │  5. ARBITRAGE (Cross-DEX)                   Risk: LOW-MEDIUM       │
    │     └── Price spread detection              APY: 5-20%             │
    │                                                                     │
    └─────────────────────────────────────────────────────────────────────┘
    """)

    print("\n" + "="*70)
    print("RISK-ADJUSTED RECOMMENDATIONS")
    print("="*70)

    print("""
    For LOWEST RISK passive income, prioritize in this order:

    ┌─────────────────────────────────────────────────────────────────────┐
    │  #1 STABLECOIN LENDING (Kamino/Jupiter)                            │
    ├─────────────────────────────────────────────────────────────────────┤
    │  • Deposit: USDC or USDT                                           │
    │  • Expected APY: 5-12%                                             │
    │  • Risk: Very Low (stablecoin, no IL, audited protocols)           │
    │  • Infrastructure: ✓ COMPLETE (yield_hunter service)               │
    │  • Action: Deposit USDC to Kamino/Jupiter Lend                     │
    └─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────┐
    │  #2 LST LENDING (Liquid Staking Tokens)                            │
    ├─────────────────────────────────────────────────────────────────────┤
    │  • Deposit: JitoSOL, mSOL, bSOL                                    │
    │  • Expected APY: 8-15% (includes base staking + lending)           │
    │  • Risk: Low (SOL exposure, but staking rewards offset)            │
    │  • Infrastructure: ✓ COMPLETE                                      │
    │  • Action: Stake SOL → Get LST → Lend LST                          │
    └─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────┐
    │  #3 CONSERVATIVE LP (Wide Range)                                   │
    ├─────────────────────────────────────────────────────────────────────┤
    │  • Pool: SOL/USDC or stable pairs                                  │
    │  • Expected APY: 15-30%                                            │
    │  • Risk: Medium (IL in trending markets)                           │
    │  • Infrastructure: ✓ COMPLETE (liquidity service)                  │
    │  • Action: Use CONSERVATIVE risk profile, monitor trends           │
    └─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────┐
    │  #4 GRID BOTS (Range Markets Only)                                 │
    ├─────────────────────────────────────────────────────────────────────┤
    │  • Pairs: SOL/USDC with wide grid                                  │
    │  • Expected APY: 20-40%                                            │
    │  • Risk: Medium (loses in strong trends)                           │
    │  • Infrastructure: ✓ COMPLETE (bots service with trailing)         │
    │  • Action: Deploy grid in consolidation phases only                │
    └─────────────────────────────────────────────────────────────────────┘
    """)


def calculate_portfolio_allocation():
    """Suggest portfolio allocation for passive income."""

    print("\n" + "="*70)
    print("SUGGESTED PORTFOLIO ALLOCATION ($10,000 Example)")
    print("="*70)

    allocations = [
        ("USDC Lending (Kamino)", 3000, 8, "low", "Stable base yield"),
        ("JitoSOL Lending", 2500, 12, "low", "LST + lending compound"),
        ("SOL/USDC LP (Conservative)", 2000, 25, "medium", "Fee income, watch trends"),
        ("Grid Bot (SOL/USDC)", 1500, 30, "medium", "Only in range markets"),
        ("Cash Reserve", 1000, 0, "none", "Opportunity fund")
    ]

    print(f"\n{'Strategy':<30} {'Amount':>10} {'Est. APY':>10} {'Risk':>10} {'Notes'}")
    print("-"*80)

    total_weighted_apy = 0
    total_allocation = 0

    for name, amount, apy, risk, notes in allocations:
        print(f"{name:<30} ${amount:>9,} {apy:>9}% {risk:>10}  {notes}")
        total_weighted_apy += (amount * apy)
        total_allocation += amount

    blended_apy = total_weighted_apy / total_allocation if total_allocation > 0 else 0

    print("-"*80)
    print(f"{'TOTAL':<30} ${total_allocation:>9,} {blended_apy:>9.1f}% {'blended':>10}")

    monthly_income = (total_allocation * blended_apy / 100) / 12
    daily_income = (total_allocation * blended_apy / 100) / 365

    print(f"\n  Expected Monthly Income: ${monthly_income:,.2f}")
    print(f"  Expected Daily Income:   ${daily_income:,.2f}")

    print("""
    ⚠️  IMPORTANT NOTES:
    • APY estimates are based on current market conditions
    • Actual returns will vary, especially for LP and Grid strategies
    • Rebalance allocation monthly based on market conditions
    • In trending markets: Reduce LP/Grid, increase Lending
    • In ranging markets: Increase LP/Grid allocations
    """)


def main():
    print("="*70)
    print("TACTIX LOW-RISK PASSIVE INCOME ANALYSIS")
    print("="*70)

    # Analyze infrastructure
    analyze_infrastructure()

    # Fetch and display current opportunities
    opportunities = analyze_yield_opportunities()

    # Show allocation suggestions
    calculate_portfolio_allocation()

    print("\n" + "="*70)
    print("IMPLEMENTATION STATUS")
    print("="*70)
    print("""
    ✅ COMPLETE & READY:
       • Yield Hunter (Kamino, Jupiter Lend, Loopscale, HyLo)
       • Liquidity Provision (Meteora DLMM, Orca Whirlpools)
       • Auto-Rebalancing Engine (with rate limits, cooldowns)
       • Grid Bots (with bidirectional trailing)
       • Arbitrage Detection (cross-DEX)

    ⚠️  NEEDS ATTENTION:
       • Jupiter Lend deposit/withdraw TX building (API integration)
       • Kamino deposit/withdraw TX building (SDK required)
       • Auto-compound for yield positions

    📊 MONITORING:
       • All services have Socket.IO real-time updates
       • Positions tracked in database
       • PnL calculation available

    🚀 TO START EARNING:
       1. Run: python supervisor.py (starts all services)
       2. Open frontend, go to Yield page
       3. Connect wallet
       4. Deposit to LOW RISK opportunities first
       5. Monitor and adjust based on market conditions
    """)


if __name__ == "__main__":
    main()
