# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TacTix.sol is a Solana trading terminal with real-time whale tracking, automated strategy execution (Grid/DCA/TWAP bots), cross-DEX arbitrage detection, and a sniper module for token launches. Uses a "Cyberpunk Obsidian" dark theme with cyan/pink/purple accents.

## Build & Run Commands

### Full System (Recommended)
```bash
python supervisor.py          # Runs all 4 services with auto-restart
```

### Individual Services
```bash
# Backend (Flask + Socket.IO on port 5001)
cd backend && python app.py

# Price Server (dedicated price feed)
python backend/price_server.py

# Sniper Outrider (token discovery)
python backend/sniper_outrider.py

# Frontend (Vite dev server on port 5173)
cd frontend && npm run dev
```

### Frontend Build
```bash
cd frontend
npm install
npm run build    # TypeScript compile + Vite build
npm run lint     # ESLint
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
# Create .env with: HELIUS_API_KEY, JUPITER_API_KEY, DISCORD_WEBHOOK_URL
```

## Architecture

### Frontend (React + TypeScript)
- **State Management:** Redux Toolkit with 10 slices: `portfolio`, `prices`, `bots`, `copytrade`, `arb`, `sniper`, `notifications`, `intel`, `wallet`, `yield`
- **Real-time:** Socket.IO with 9 namespaces matching Redux slices (`/portfolio`, `/prices`, `/bots`, `/copytrade`, `/arb`, `/sniper`, `/history`, `/intel`, `/yield`)
- **Socket initialization:** `frontend/src/services/socket.ts` - connects all namespaces and dispatches to Redux
- **Store config:** `frontend/src/app/store.ts`
- **Styling:** Tailwind CSS v4 with custom cyberpunk colors in `tailwind.config.js`

### Backend (Python Flask)
- **Entry point:** `backend/app.py` - Flask app, blueprint registration, engine initialization
- **Config:** `backend/config.py` - loads `.env`, API keys, keypair, RPC URLs
- **Database:** SQLite via `backend/database.py` - tables for trades, bots, copytrade_targets, arb_pairs, sniper_tracked, yield_positions
- **Routes:** `backend/routes/` - REST API blueprints
- **Services:** `backend/services/` - background engines (bots, trading, portfolio, notifications)

### Key Backend Engines
- `backend/copy_trader.py` - Whale tracking via Helius WebSocket, decodes transactions, emits signals
- `backend/arb_engine.py` - Cross-DEX spread detection, Jupiter quote comparison
- `backend/sniper_outrider.py` - New token discovery
- `backend/helius_infrastructure.py` - Unified Helius API client (RPC, WebSocket, DAS)
- `backend/services/jito.py` - Jito bundle signing for MEV-resistant execution
- `backend/services/yield_hunter/` - DeFi yield aggregation across Kamino, Jupiter Lend, Loopscale, HyLo protocols

### Data Flow Pattern
1. Backend service detects event (whale swap, arb opportunity, price update)
2. Emits via Socket.IO namespace (e.g., `emit('signal_detected')`)
3. Frontend listener in `socket.ts` receives and dispatches to Redux
4. React components re-render via `useAppSelector`

## Key Files for Understanding

Read in this order for quickest onboarding:
1. `frontend/src/app/store.ts` - Redux slice structure
2. `frontend/src/services/socket.ts` - All WebSocket events and Redux integration
3. `backend/app.py` - Flask setup and engine initialization
4. `backend/config.py` - Environment and API configuration
5. `backend/copy_trader.py` - Example of a complete backend engine

## Environment Variables

Required in `backend/.env`:
```
HELIUS_API_KEY=<required>
JUPITER_API_KEY=<optional>
DISCORD_WEBHOOK_URL=<for trade notifications>
DISCORD_SYSTEM_WEBHOOK_URL=<for system status>
```

Keypair stored at `backend/keypair.json` (gitignored).

## Logs

- Backend: `backend/server.log`
- Price Server: `backend/price_server.log`
- Sniper: `backend/sniper_outrider.log`
- Frontend: `frontend/frontend.log`
- Supervisor: `backend/supervisor.log`

## Dev Proxy

Vite proxies `/socket.io/*` and `/api/*` to `http://localhost:5001` (configured in `frontend/vite.config.ts`).
