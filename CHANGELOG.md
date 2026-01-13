# Tactix-Gem Project Changelog

## [2026-01-13] - Architecture Restoration, UI Flair & Log Density

### Github Repository Initialized
- **URL:** [https://github.com/CryptoKix/TacTix](https://github.com/CryptoKix/TacTix)
- **Status:** Successfully pushed the restored "Cyberpunk Obsidian" architecture.
- **Security:** Verified that `.env`, `keypair.json`, and `.db` files are strictly ignored and remain local.

### Feature: Arbitrage Monitor (Phase 1)
- **Arb Monitor Engine:** Implemented a real-time arbitrage detection engine that compares Jupiter quotes across specific venues (Raydium, Orca, Meteora, Phoenix).
- **Arb Visualization:** Created the `ArbConfigWidget` featuring a 3-column layout: Configuration, Real-time Analysis (Heatmap placeholder), and Opportunity Log.
- **Cross-DEX Spreads:** Added logic to detect and broadcast price discrepancies > 0.01% via Socket.IO.

### Feature: Strategy Terminal UI v2
- **Command Deck Layout:** Restored the 3x2 grid layout for strategy selection alongside a dynamic **Strategy Console** analytics panel.
- **Button Flair Upgrades:**
    - **Rounded Aesthetic:** Transitioned from industrial bevels to a sleek `rounded-2xl` organic design for better integration with the UI.
    - **Neon Hover Glows:** Unified all strategy buttons to use the vibrant **TWAP Purple** neon bloom effect on hover and selection.
    - **Brand Color Sync:** Default icons and text now utilize primary `accent-cyan`, switching to white on selection for high-contrast emphasis.
- **Dynamic Metrics:** The terminal now displays real-time **Unrealized PnL** (active bots) and **Total Realized PnL** (completed bots) specific to each strategy engine.

### Feature: High-Density Execution Logs
- **Single-Row Architecture:** Hardened all execution rows across Dashboard and Strategies to a strict single-line format (`Timestamp | Pair | Swap Details | Price | Status`).
- **Swap Details:** Implemented a concise `[Amount] Asset → [Amount] Asset` logic with color-coded token highlights.
- **Absolute Timestamps:** Switched from relative "time ago" to absolute `MM/DD HH:MM:SS` formatting for forensic accuracy.
- **Status-Aware Coloring:** Success rows (`OK`) now automatically highlight the timestamp in `accent-green`, improving scannability.
- **Logical Flow:** Reordered columns so the Asset Pair strictly follows the `[Input] / [Output]` direction of the trade.

### Feature: Master Engine Controller (ActiveBotsModal)
- **Portal Rendering:** Fully refactored the modal to use **React Portals**, ensuring it renders at the document body level to fix "Black Screen" and clipping issues.
- **Financial Labels:** Replaced generic "Tactical Yield" with status-specific PnL descriptors: **Realized PnL** (Completed) and **Unrealized PnL** (Active).
- **Smart Interface:** Automatically hides action buttons (Pause/Decommission) for completed bots to prevent accidental interactions.

### Bot Engine & Logic Fixes
- **Grid Interval Logic:** Refactored the Grid Bot engine to a strict interval-trigger model. The bot now sells exactly at the level price shown in the UI, resolving issues where positions were held too long.
- **Smart Initialization:** Updated bot deployment to correctly fund "Sell Levels" based on real-time market price during setup.

### Stability & Resilience
- **Crash Protection:** Resolved multiple "Black Screen" runtime errors by hardening null-checks in `reduce/filter` functions and fixing syntax errors in the modal component.
- **Data Synchronization:** Implemented an automated REST fetch on application startup to ensure bot data is populated immediately while WebSockets establish.
- **Type Safety:** Added explicit `Number()` casting to all financial calculations to prevent malformed data from stalling the UI.


## [2026-01-12] - Grid Trailing, TWAP Engine & Copy Trader UI

### Feature: Grid Bot v2 (Trailing & Automation)
- **Trailing Up Logic:** Implemented advanced range scaling. The bot now automatically shifts its entire grid upwards by one step when the price exceeds the upper bound, allowing it to track trend upside.
- **Auto-Termination:** Added smart range-exit logic. Bots now automatically set status to `completed` and alert the user once the upper bound is reached and all positions are sold.
- **Logic Correction:**
    - Fixed "Amount per Level" calculation to use $N-1$ intervals for perfect investment distribution.
    - Standardized the upper bound as a final sell target instead of waiting for a step-overshoot.
- **Visualization:** Integrated live grid level expansion into the `ActiveBotsModal`.

### Feature: TWAP (Time-Weighted Average Price) Strategy
- **Functional Engine:** Completed backend scheduler and execution logic for TWAP, DCA, and VWAP bots.
- **Config Workspace:** Created `TWAPConfigWidget` with a 3-column quant-style layout:
    - **Column 1:** Parameters (Duration, Interval, Total Amount).
    - **Column 2:** Execution Plan Preview (estimated end time, trades count).
    - **Column 3:** Detailed Execution Log with 24h timestamps and BUY/SELL badges.
- **Fee Optimization:** Hardcoded `priority_fee=0` for all scheduled executions to maximize efficiency.
- **Performance Tracking:** Implemented cost-basis tracking and real-time unrealized PnL calculation for TWAP strategies.

### Feature: Copy Trader Workspace
- **Management UI:** Created `CopyTradeConfigWidget` featuring:
    - **Target List:** Add/Remove wallets with custom aliases.
    - **Wallet Intel:** Displays win rate, total profit, and trade count (Solana Tracker API).
    - **Mirror Settings:** Configurable Scale Factor (x) and Max Per Trade (SOL) caps.
- **Transaction Decoder v2:**
    - **DEX Expansion:** Added support for **Pump.fun**, **Phoenix**, and **Lifinity**.
    - **Versioned Support:** Now correctly parses both Legacy and Versioned (v0) transactions.
    - **Smart Account Lookup:** Dynamically finds the tracked wallet's index to calculate balance changes regardless of fee-payer status.
- **High-Density Logs:** Refactored the Signals log into a single-row "ticker" style for maximum visibility.

### UI/UX & Global Systems
- **System Alerts Widget:** Created a new centralized dashboard component to stream real-time engine activity. 
    - **Multi-Source Integration:** Displays bot completions, grid trailing shifts, copy trader detections, and system errors in a single unified feed.
    - **Visual Fidelity:** High-density design with color-coded status icons, line-clamping for readability, and 24h timestamps.
- **Alert Persistence:** Implemented `notificationsSlice` in Redux to manage alert state across the session, including "Clear All" functionality.
- **Real-time Signal Sync:** Integrated Copy Trader detections directly into the global alert system for instant whale-tracking notifications.
- **Notification Engine:** Implemented a global toast system at the bottom-right with auto-hide progress bars and glowing cyberpunk design.
- **Strategy Terminal Overhaul:**
    - **Split Layout:** Refactored into a left-side 3x2 grid and a right-side "Strategy Intel" panel.
    - **Visual Presence:** Buttons are now permanently "lit" with cyan hover glow by default for better visibility.
    - **Quick Actions:** Added a shiny "View Bots" button to the info panel for instant modal access.
- **Standardization:**
    - **Color Language:** Unified Blue (`accent-cyan`) for **BUY** and Pink (`accent-pink`) for **SELL** across the entire platform.
    - **Pop-up Fixes:** Enabled backdrop clicking to close all modals.
    - **Table Polish:** Re-aligned and fitted columns in the `ActiveBotsWidget` for a professional financial look.

### Infrastructure & Bug Fixes
- **Backend Stability:** 
    - Resolved a critical KeyError in the DCA scheduler.
    - Fixed a race condition by implementing thread-safe bot state updates.
    - Optimized engine initialization to prevent redundant thread spawning.
- **Frontend Resilience:** Fixed multiple "Black Screen" runtime errors caused by missing imports and Redux selectors.

## [2026-01-12] - Grid Bot Engine & Pro Dashboard Overhaul

### Feature: Pro Dashboard Layout
- **Fluid Architecture:** Refactored entire layout to use `h-screen` flexbox architecture, eliminating page-level scrollbars and "floating" sidebars for a true native-app feel.
- **Widget Standardization:**
    - **Header Uniformity:** Standardized all widget headers to **55px height** with reduced margins for maximum data density.
    - **Typography:** Unified fonts across all data tables (Portfolio, History, Bots) using `text-[11px]` monospace for data and `text-[9px]` bold uppercase for headers.
    - **Table Design:** Converted all list views to responsive CSS Grid layouts with consistent alignment and spacing.
- **Split Layout:**
    - **Top Row:** Portfolio Snapshot (7 cols) + Strategy Terminal (5 cols).
    - **Bottom Row:** Trade History (7 cols) + Active Bots (5 cols).

### Feature: Active Bots Management
- **New Widget:** Created dedicated `ActiveBotsWidget` for real-time monitoring on the dashboard.
- **Detailed Tracking:** Displays live PnL, Trade Count, Current Range, and Status for every running bot.
- **Interactive Controls:** Added **Pause/Resume** and **Terminate** actions directly within the widget row.
- **Expandable Rows:** Grid bots can be clicked to reveal a detailed scrollable list of all active levels (Buy/Sell/Holding status).

### Core Engine Fixes (Grid Bot)
- **Logic Correction:** Fixed critical "ping-pong" bug where bots would buy and sell at the same price. Added logic to enforce selling only at the *next* grid level (`current_price >= level_price + step_size`).
- **Initial Rebalance:** Fixed issue where failed initial trades (slippage/errors) were not logged, causing bots to start in a corrupted state. Now properly logs failures and reverts state.
- **Fees:** Removed Priority Fees (0 SOL) for all automated Grid trades to maximize profitability.
- **Price Precision:** Updated all logging and UI displays to strictly respect 2 decimal places for prices, fixing the "$1.00" display bug for stablecoin pairs.

### Data & History Improvements
- **Trade History Upgrade:**
    - Converted to a detailed 7-column table (Time, Source, Action, Price, Value, Fee, Status).
    - Added smart column alignment (Left-aligned text/numbers) with header compensation for scrollbar width (`mr-[6px]`).
    - Fixed implied price calculation to correctly derive asset price even when selling into stablecoins.
    - Added regex cleaning to the "Source" column to truncate long decimal strings.
- **Portfolio Snapshot:**
    - Converted to CSS Grid layout.
    - Removed filler rows to only show owned assets.
    - Adaptive scrollbar only appears when content overflows.

### Infrastructure
- **Process Management:** Hardened `restart_services.sh` with aggressive `pkill -9` to prevent zombie python processes from stalling price feeds.
- **Price Feed:** Verified and stabilized 500ms polling from Pyth Oracle.

## [2026-01-12] - Trading Interface & PnL Systems

### Feature: Advanced Trading Page
- **TradingView Integration:** Replaced custom charts with the full **TradingView Advanced Real-Time Chart** (500px height) featuring all standard tools, axes, and indicators.
- **Trade Execution Widget:** 
    - **Dynamic Selection:** Implemented dropdown asset selectors that pull real-time token lists and balances from the wallet.
    - **Metadata Sync:** Icons are automatically fetched and updated for any token in the portfolio using Helius DAS API.
    - **Advanced Parameters:** Added persistent UI for **Slippage (%)** and **Priority Fee (SOL)** with quick-select presets (N, L, M).
    - **Custom Controls:** Replaced default browser number spinners with custom +/- buttons styled for the "Cyberpunk Obsidian" theme.
    - **UX Enhancements:** Added click-outside-to-close for dropdowns and standardized field heights (56px) for perfect alignment.
- **Stacked Layout:** Reorganized the Trade page to show the Chart and Execution feed in a clean, full-width vertical stack.

### Feature: Profit & Loss (PnL) Tracking
- **Portfolio Snapshots:** Activated automated hourly snapshots of total value and individual holdings in the backend database.
- **24h Change Tracking:** 
    - Added global portfolio 24h PnL (USD and %) to the main dashboard.
    - Added a **"24H CHG"** column to the asset table for individual token performance tracking.
- **Trade Valuation:** Updated the execution engine to record the USD value of every trade at the moment of execution.
- **Execution Log Stats:** Displayed USD value for every successful trade in the `TradeHistoryWidget`.
- **Full History Modal:** Implemented `HistoryModal.tsx` allowing users to view their complete trade execution history in a detailed table view, triggered by the "View Full Activity" button.

### Backend & Infrastructure
- **Stability Fixes:** Resolved background task initialization issues by fixing conflicts between `eventlet` and Python's standard threading.
- **Token Discovery v2:** Upgraded discovery logic to fetch high-quality icons from Helius and Jupiter CDN, with robust fallbacks.
- **Database Repaired:** Fixed missing `logo_uri` and `usd_value` columns via manual schema migrations.
- **Tooling:** Installed `sqlite3` CLI for easier database debugging and maintenance.

### UI/UX Refinements
- **Header Cleanup:** Removed redundant SOL ticker and Net Worth from the top navbar to focus on wallet status.
- **Precision Tuning:** Standardized price displays to 2 decimal places and asset amounts to 6 decimal places across all widgets.
- **Visual Consistency:** Applied uniform icons, font weights (medium), and color coding (Cyan/Pink) across the entire application.

- **Branding:** Added 'v1.0.1 Alpha' versioning tag to the main TACTIX logo in the navigation sidebar.
- **Header Optimization:** Removed truncated wallet address from the user profile badge to prioritize alias visibility and minimize clutter.
- **Strategy Management:** Implemented full CRUD lifecycle for whale targets. Users can now add new wallets via an inline form and delete existing targets with hover-actions.
- **Layout Alignment:** Perfectly synchronized the strategy selection grid with the Tactical Console using dynamic height stretching (`items-stretch`) and row-spanning logic.
- **Border Consistency:** Removed asymmetrical decorative accents and bars from active buttons to ensure a solid, uniform border around all selected elements.
- **Tactical Console:** Upgraded border brightness to `white/15` for better contrast and visibility.
## [2026-01-11] - Dashboard Refinement & Wallet Integration

### Bug Fixes & Stability
- **Frontend Build Fixes:** Resolved TypeScript errors in `PortfolioWidget`, `Sidebar`, and `TradeHistoryWidget` related to unused imports and type definitions.
- **Service Management:** Created and verified `restart_services.sh` to reliably restart backend processes (`app.py`, `price_server.py`).
- **Data Integrity:** Fixed date parsing issues in `TradeHistoryWidget` that caused "White Screen of Death" by handling SQL-formatted date strings safely.
- **Precision:** Updated `TradeHistoryWidget` to display up to 6 decimal places, fixing the "0 USDC" display issue for small trades.

### Backend Enhancements
- **Database Schema:** Added `wallet_address` column to the `trades` table to support multi-wallet filtering.
- **Data Backfill:** Executed a one-time migration to assign the current wallet address to all 103 previous historical trades.
- **API Updates:**
    - Updated `execute_transfer` to handle SOL transfers via `SystemProgram.transfer`.
    - Added `/api/transfer` endpoint.
    - Updated `get_history` API and WebSocket events to filter trades by the active user's wallet address.
- **Performance:** Optimized `PortfolioWidget` by disabling Pie Chart animation and throttling updates to 2s intervals, significantly reducing CPU usage during high-frequency price updates.

### UI/UX Improvements
- **Strategy Terminal (Active Strategies):**
    - Replaced placeholder with a 6-button horizontal launchpad (VWAP, TWAP, GRID, DCA, ARB, COPY).
    - Integrated real-time monitoring: buttons dynamically light up and display pulsing heartbeats when strategies are active in the backend.
    - Optimized for zero layout shift: removed hover-scaling and expanding text to maintain fixed button dimensions.
- **Pixel-Perfect Layout Locking:**
    - Locked Dashboard height to viewport (`h-[calc(100vh-110px)]`) and disabled page-level scrolling.
    - Synchronized all widget headers to a fixed `80px` height with aligned separator lines.
    - Proportioned columns so the `TradeHistoryWidget` aligns perfectly with the bottom of the `StrategiesWidget`.
- **Trade History Refinement:**
    - Implemented a smooth bottom fade-out effect and a "View Full Activity" footer.
    - Improved custom scrollbar visibility and styling.
- **Portfolio Snapshot Updates:**
    - Reorganized header to a horizontal layout with left-aligned "Portfolio Value" stack.
    - Themed the entire value section with `accent-cyan`.

### Backend & State Management
- **Bot Monitoring:** Implemented `botsSlice` in Redux and wired it to the `/bots` WebSocket namespace for real-time strategy status updates.
- **Modal Logic:** Integrated `HistoryModal.tsx` for detailed browsing of full execution logs.

## [2026-01-11] - Dashboard Refinement & Wallet Integration

## [Initial Setup] - 2026-01-10

### Infrastructure & Backend
- **New Directory Structure:** Created separate `/backend` and `/frontend` directories in `/data/kixAI/tactix-gem/`.
- **Port Migration:** Migrated backend services to port **5001** (was 5000) to avoid conflicts.
- **Service Cleanup:** Implemented global process cleanup to prevent orphan processes.
- **Backend Stack:** Validated stable run of:
    - Flask API (Port 5001) with `eventlet` async mode.
    - Price Server (Port 8765) with Pyth & Helius integration.
    - SQLite Database (`tactix_data.db`).

### Frontend Architecture (Phase 1 & 2)
- **Tech Stack:** Initialized React 18 + TypeScript + Vite project.
- **Dependencies:** Installed Redux Toolkit, Socket.IO Client, Tailwind CSS v4, shadcn/ui (radix), Recharts, Lucide Icons.
- **Theme:** Configured "Cyberpunk/Neon" theme using Tailwind v4 CSS-first variables in `src/index.css`.
- **State Management:**
    - Created centralized Redux Store (`src/app/store.ts`).
    - Implemented `portfolioSlice` and `pricesSlice`.
    - Created typed hooks (`useAppDispatch`, `useAppSelector`).
- **Real-time Data:** Implemented `socket.ts` service to auto-connect to backend namespaces (`/portfolio`, `/prices`) and dispatch Redux actions.

### UI Implementation (Phase 3)
- **Layout System:**
    - `Sidebar.tsx`: Collapsible navigation with neon active states.
    - `Header.tsx`: Displays live SOL ticker, Net Worth, and Wallet badge.
    - `MainLayout.tsx`: Wraps pages with scanline effect and layout structure.
- **Widgets:**
    - `PortfolioWidget.tsx`: Real-time pie chart and asset list using live price feeds.
- **Pages:**
    - `Dashboard.tsx`: Grid layout integrating the PortfolioWidget.
- **Routing:** Configured basic routing in `App.tsx` (Dashboard as default).

### Current Status
- **Backend:** Running on 5001 (API) & 8765 (Price Feed).
- **Frontend:** Running on 5173 (Dev Mode).
- **Data Flow:** Backend -> WebSocket -> Redux Store -> UI Components is fully functional.
