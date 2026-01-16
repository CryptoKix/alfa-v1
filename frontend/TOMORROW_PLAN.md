# Plan for Tomorrow: Grid Bot Stabilization

## Priority 1: Backend Robustness
- [ ] **State Locking**: Add `is_processing` BOOLEAN to the `bots` table in SQLite to prevent race conditions across backend restarts and high-frequency price updates.
- [ ] **Atomic Updates**: Refactor `update_bot_performance` to never overwrite a bot that is currently in a trade.
- [ ] **Hardened Initialization**: Move Grid bot creation to its own endpoint and strictly define Buy/Sell boundaries to eliminate "Ghost Buys" on start.
- [ ] **Trailing Down**: Verify and stress-test the new "Trailing Down" logic under high volatility.

## Priority 2: Execution Logic
- [ ] **Reconciliation**: Implement "strict sequence" logic (a level can only BUY if the level above was SOLD).
- [ ] **Fixed Hysteresis**: Move hysteresis calculation to a fixed value determined at bot creation.
- [ ] **Pre-Trade Snapshot**: Save current balance before every trade to verify success after the RPC call.

## Priority 3: UI Enhancements
- [ ] **Force Sync**: Add a "Sync Wallet" button to the Grid monitor to manually fix out-of-sync levels.
- [ ] **Detailed Logs**: Expose the backend `grid_bots.log` to the frontend via a "Tactical Log" component.

*Refer to `GRID_BOT_ANALYSIS.md` for the full technical deep dive.*
