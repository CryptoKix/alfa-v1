# TacTix Development Roadmap

## [Upcoming] Phase 3: Automation & Polish

### 1. Copy Trader Phase 2 (Execution)
- Implement backend logic to auto-execute mirror trades based on detected whale signals.
- Add toggle for "Auto-Mirror" in the CopyTrade UI.
- Implement safety slippage and priority fee overrides for mirrored trades.

### 2. Sniper Module
- Build the "Sniper" interface for monitoring new token launches.
- Implement lightning-fast "Buy" logic for newly detected liquidity pools.
- Add "Rug-Check" safety integration.

### 3. Portfolio Deep Dive
- Enhance the PortfolioWidget with real-time allocation pie charts (Recharts).
- Add "PnL over time" line charts for the entire wallet.
- Implement token-specific performance metrics (Cost Basis vs Current).

### 4. Global UI/UX Polish
- Apply the "Detached HUD" widget styling to all sub-panels across the Dashboard and Strategies pages.
- Standardize all "Top Borders" to the new slim 2px design.
- Implement responsive breakpoints for tablet and mobile views.

### 5. Arbitrage Monitor (Phase 2)
- **Dynamic Pair Manager:** Implement an interface to add custom mint addresses for cross-DEX spread monitoring in real-time.
- **Spread Alerts:** Create a threshold system (e.g., 0.5%) with visual and auditory "Tactical Alerts" for profitable gaps.
- **Atomic Swap Dry-Run:** Build a simulator to calculate net profit (post-fee) for specific cross-venue routes.

---

## Phase 4: Advanced Execution Engines (Next)

### 1. Jupiter Limit Order Grid Bot
- **On-Chain Persistence:** Implement a secondary GRID engine that utilizes Jupiter Limit Orders instead of real-time market swaps.
- **Hybrid Management:** Build a UI toggle to switch between "HFA Grid" (Backend Triggered) and "Limit Grid" (On-Chain Triggered).
- **Automated Re-queueing:** Logic to automatically place the next Buy/Sell limit order once an existing one is filled on-chain.
- **Fee Efficiency:** Focus on minimizing priority fees by leveraging passive on-chain fulfillment.

---

## [Current] Phase 2: Core Infrastructure (Jan 2026)
- ✅ SQLite Migration
- ✅ Modular Widget Architecture
- ✅ Real-time Price Feeds (Shyft/Pyth)
- ✅ Basic Copy Trader Engine (Detection)
- ✅ Strategy Terminal (Grid, TWAP, DCA)
- ✅ Send/Transfer Module (Native & SPL)
