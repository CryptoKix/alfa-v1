# Grid Bot Logic: Deep Dive Analysis & Stabilization Plan

## 1. Current Logic Analysis

### A. Initialization (`/api/dca/add`)
*   **The Problem**: The boundary calculation for `is_sell_level` was `(price_level > current_price)`.
*   **The Failure**: If the current price is exactly at or very close to a level, floating-point precision or slight price shifts during the loop can cause a level to be marked as "Buy" (empty) when it should have been part of the initial SOL funding.
*   **Result**: Ghost buys. The bot starts, sees an "empty" level at the current price, and immediately triggers a Buy trade even though it hasn't actually sold anything yet.

### B. Execution (`process_grid_logic`)
*   **The Problem**: Memory-based locking (`bot_locks`) is used to prevent concurrent trades. 
*   **The Failure**: If the backend restarts (which happens frequently during development), the memory locks are cleared. If a bot was in the middle of a trade or if the scheduler triggers immediately after restart, multiple threads can pick up the same bot state before the first one has finished and saved the updated state to the DB.
*   **Result**: Duplicate trades. Level 141.09 was bought twice because two processes both saw `has_position: false` before either could save `true`.

### C. State Persistence (`update_bot_performance`)
*   **The Problem**: This function runs every time a price update is received (high frequency). It reads the bot from the DB, calculates PnL, and writes it back.
*   **The Failure**: If `process_grid_logic` is currently executing a trade and hasn't saved yet, `update_bot_performance` might read the *old* state, calculate PnL, and save it back, effectively **overwriting** the state changes (like a completed trade) that `process_grid_logic` was about to save.
*   **Result**: State "reverting" to old values. Positions disappearing or reappearing.

### D. Reconciliation
*   **The Problem**: The current reconciliation logic only checks if `wallet_bal < token_amount`. 
*   **The Failure**: It doesn't handle the reverse (extra tokens in wallet) and it doesn't verify if the trade was actually successful on-chain vs. just a RPC failure.
*   **Result**: Bot gets out of sync with actual on-chain holdings.

---

## 2. Solid Stabilization Plan (Tomorrow's Goals)

### Phase 1: Robust State Management (Highest Priority)
1.  **DB-Level Processing Lock**: Add a `is_processing` BOOLEAN column to the `bots` table. 
    *   Set to `1` before any trade starts. 
    *   Set to `0` only after `db.save_bot` is confirmed.
    *   `update_bot_performance` must strictly SKIP any bot where `is_processing == 1`.
2.  **Atomic State Updates**: Instead of `get_bot` -> `modify` -> `save_bot` (which is prone to race conditions), implement a way to update only specific fields (like PnL) or ensure the save uses a version/timestamp check.

### Phase 2: Grid Logic Hardening
1.  **Hysteresis Normalization**: Instead of calculating hysteresis as a percentage of `current_price` every tick, use a fixed buffer defined at bot creation to ensure consistency.
2.  **Trailing "Dead Zone"**: Implement a small delay or a wider price requirement before shifting the grid to prevent "jitter" at the boundaries.
3.  **Strict Level Ownership**: A level should only be allowed to BUY if the level above it has been SOLD (standard grid sequence). This prevents multiple buys if the price is ranging sideways.

### Phase 3: Enhanced Reconciliation & Logging
1.  **Balance Snapshotting**: Record the exact wallet balance before and after a trade. If the balance doesn't change as expected, the bot should PAUSE and alert the user rather than guessing.
2.  **Separate Grid Logs**: Create a dedicated `logs/grid_bots.log` where every single trigger decision, price check, and trade result is logged with high verbosity.

### Phase 4: UI/Backend Decoupling
1.  **Dedicated Grid Endpoint**: Move Grid logic out of `api_dca_add` into a specialized `api_grid_add` to prevent "bloat" and making the logic easier to test in isolation.

---

## 3. Immediate Action Summary
*   [ ] Refactor `database.py` to support atomic status updates.
*   [ ] Implement `is_processing` guard in `process_grid_logic`.
*   [ ] Modularize `process_grid_logic` into smaller, testable helper functions.
*   [ ] Add "Sync with Wallet" button to UI to allow manual position recovery.
