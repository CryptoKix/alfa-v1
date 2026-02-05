# TacTix.sol Architecture Map

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TACTIX.SOL SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    FRONTEND (React + TypeScript)                      │ │
│  │                         Port 5173 (Vite)                              │ │
│  │                                                                       │ │
│  │  Redux Store (12 slices)    Socket.IO Client    Wallet Connection    │ │
│  │  ├─ portfolio               ├─ 11 namespaces    ├─ Jupiter Wallet    │ │
│  │  ├─ prices                  │                   ├─ Session Keys      │ │
│  │  ├─ bots                    │                   │                    │ │
│  │  ├─ copytrade              │                   │                    │ │
│  │  ├─ arb                     │                   │                    │ │
│  │  ├─ sniper                  │                   │                    │ │
│  │  ├─ yield                   │                   │                    │ │
│  │  ├─ dlmm                    │                   │                    │ │
│  │  ├─ liquidity               │                   │                    │ │
│  │  └─ ...                     │                   │                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│              ┌───────────────┴───────────────┐                             │
│              │  REST /api/*   │   WebSocket  │                             │
│              └───────────────┬───────────────┘                             │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      MIDDLEWARE LAYER                                 │ │
│  │                                                                       │ │
│  │  Authentication         Rate Limiting        Security Headers        │ │
│  │  ├─ Token auth          ├─ Per-endpoint      ├─ X-Frame-Options      │ │
│  │  ├─ Session cookies     └─ Trading limits    ├─ CSP                  │ │
│  │  └─ IP whitelist                             └─ XSS Protection       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                   BACKEND (Flask + Socket.IO)                         │ │
│  │                          Port 5001                                    │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ API Blueprints                                                  │ │ │
│  │  │ /api/       /api/auth/     /api/wallet/    /api/copytrade/     │ │ │
│  │  │ /api/arb/   /api/dlmm/     /api/liquidity/ /api/yield/          │ │ │
│  │  │ /api/services/                                                  │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ Background Services & Engines                                   │ │ │
│  │  │                                                                 │ │ │
│  │  │ CopyTraderEngine    ArbEngine        BotsService               │ │ │
│  │  │ ├─ Helius WS        ├─ Jupiter API   ├─ DCA Scheduler          │ │ │
│  │  │ ├─ TX Decoding      ├─ Spread Calc   ├─ Grid Logic             │ │ │
│  │  │ └─ Auto-copy        └─ Jito Bundle   └─ TWAP/VWAP              │ │ │
│  │  │                                                                 │ │ │
│  │  │ PortfolioService    YieldHunter      LiquidityService          │ │ │
│  │  │ ├─ Balance poll     ├─ Kamino        ├─ Meteora DLMM           │ │ │
│  │  │ └─ Snapshots        ├─ Jupiter Lend  ├─ Orca Whirlpools        │ │ │
│  │  │                     └─ HyLo          └─ Auto-rebalance         │ │ │
│  │  │                                                                 │ │ │
│  │  │ TradeGuard          SessionKeys      NewsService               │ │ │
│  │  │ └─ Pre-trade val    └─ Wallet deleg  └─ RSS + Discord          │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ WebSocket Namespaces (11)                                       │ │ │
│  │  │ /portfolio  /prices    /history  /bots     /copytrade          │ │ │
│  │  │ /arb        /sniper    /intel    /yield    /dlmm    /liquidity │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│              ┌───────────────┴───────────────┐                             │
│              ▼                               ▼                              │
│  ┌─────────────────────────┐   ┌─────────────────────────┐                 │
│  │   Meteora Sidecar       │   │     Orca Sidecar        │                 │
│  │      Port 5002          │   │      Port 5003          │                 │
│  │                         │   │                         │                 │
│  │   @meteora-ag/dlmm      │   │  @orca-so/whirlpools    │                 │
│  │   ├─ Create position    │   │   ├─ Create position    │                 │
│  │   ├─ Add liquidity      │   │   ├─ Add liquidity      │                 │
│  │   ├─ Remove liquidity   │   │   ├─ Remove liquidity   │                 │
│  │   └─ Claim fees         │   │   └─ Claim fees         │                 │
│  └─────────────────────────┘   └─────────────────────────┘                 │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                   SUPPORTING SERVICES                                 │ │
│  │                                                                       │ │
│  │  Price Server         Sniper Outrider      Network Monitor           │ │
│  │  ├─ Pyth feeds        ├─ Token discovery   ├─ Health checks          │ │
│  │  ├─ Helius WS         └─ LP detection      └─ API monitoring         │ │
│  │  └─ Webhook POST                                                      │ │
│  │                                                                       │ │
│  │  Supervisor (Process Manager)                                        │ │
│  │  └─ Auto-restart, log aggregation, graceful shutdown                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      EXTERNAL APIs                                    │ │
│  │                                                                       │ │
│  │  Helius           Jupiter         Pyth           DeFi Protocols      │ │
│  │  ├─ RPC           ├─ Quote        └─ Oracles     ├─ Kamino           │ │
│  │  ├─ WebSocket     ├─ Swap                        ├─ Jupiter Lend     │ │
│  │  └─ DAS           └─ Limit                       ├─ Loopscale        │ │
│  │                                                  └─ HyLo             │ │
│  │  Meteora          Orca           Jito                                │ │
│  │  └─ DLMM API      └─ GraphQL     └─ MEV Bundles                      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      DATA LAYER                                       │ │
│  │                                                                       │ │
│  │  SQLite (tactix_data.db)                                             │ │
│  │  ├─ trades          ├─ snapshots       ├─ targets                    │ │
│  │  ├─ bots            ├─ signals         ├─ arb_pairs                  │ │
│  │  ├─ tokens          ├─ user_wallets    ├─ yield_positions            │ │
│  │  ├─ dlmm_positions  ├─ orca_positions  └─ pool_metadata              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Port Configuration

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Frontend (Vite) | 5173 | HTTP | React dev server |
| Backend (Flask) | 5001 | HTTP + WS | Main API + Socket.IO |
| Meteora Sidecar | 5002 | HTTP | DLMM SDK wrapper |
| Orca Sidecar | 5003 | HTTP | Whirlpools SDK wrapper |

---

## Data Flow Patterns

### 1. Trade Execution Flow

```
User (Browser)
    │
    ▼
React Frontend ──► REST POST /api/*
    │
    ▼
Flask Backend
    │
    ├─► Session Key Mode (Browser Wallet)
    │   └─► Sign with delegated session key
    │
    └─► Server Keypair Mode (Server-owned bot)
        └─► Sign with server keypair
    │
    ▼
Jupiter Quote API ──► Best route calculation
    │
    ▼
Execute (Jito bundle or direct)
    │
    ▼
Confirmation ──► DB Update ──► Socket.IO Broadcast ──► Redux Update
```

### 2. Real-Time Price Flow

```
Solana Network
    │
    ▼
Helius WebSocket
    │
    ▼
Price Server (parse Pyth data)
    │
    ▼
POST /api/webhook/price
    │
    ▼
Backend Cache ──► Socket.IO /prices ──► Frontend Redux
```

### 3. Whale Copy Trade Signal Flow

```
Monitored Whale Wallet
    │
    ▼
Swap Transaction
    │
    ▼
Helius WebSocket (CopyTraderEngine subscription)
    │
    ▼
Decode: input_mint, output_mint, amount
    │
    ▼
Save to DB
    │
    ├─► Auto-strike ON ──► Execute immediately
    │
    └─► Auto-strike OFF ──► Socket.IO /copytrade ──► Frontend notification
```

### 4. Liquidity Position Flow

```
User selects pool
    │
    ▼
Frontend ──► Socket.IO 'request_pools' ──► DLMMClient.get_all_pools()
    │
    ▼
User enters position params
    │
    ▼
StrategyCalculator ──► Compute bin ranges
    │
    ▼
REST POST /api/liquidity/positions/create
    │
    ▼
Backend ──► HTTP to Sidecar (5002/5003)
    │
    ▼
Sidecar builds transaction with SDK
    │
    ▼
Frontend receives serialized TX ──► Wallet signs ──► Submit to Solana
    │
    ▼
Confirmation ──► DB save ──► Socket.IO broadcast
```

---

## File Structure

### Backend (`/backend`)

```
backend/
├── app.py                      # Main Flask entry point
├── supervisor.py               # Process manager
├── config.py                   # Configuration & env vars
├── database.py                 # SQLite schema & ORM
├── extensions.py               # Shared instances
├── helius_infrastructure.py    # Helius API client
├── copy_trader.py              # Whale tracking engine
├── arb_engine.py               # Arbitrage detection
├── price_server.py             # Dedicated price feed
├── sniper_outrider.py          # Token discovery
│
├── middleware/
│   ├── auth.py                 # Authentication
│   └── rate_limit.py           # Rate limiting
│
├── routes/
│   ├── api.py                  # General API
│   ├── auth.py                 # Auth endpoints
│   ├── wallet.py               # Wallet operations
│   ├── copytrade.py            # Copy trade management
│   ├── arb.py                  # Arbitrage config
│   ├── dlmm_routes.py          # Meteora DLMM
│   ├── liquidity_routes.py     # Unified liquidity
│   ├── yield_routes.py         # Yield aggregator
│   ├── services.py             # Service control
│   └── websocket.py            # WebSocket handlers
│
├── services/
│   ├── bots.py                 # Bot scheduler (DCA/Grid/TWAP/VWAP)
│   ├── trading.py              # Trade execution
│   ├── portfolio.py            # Balance tracking
│   ├── sniper.py               # Sniper service
│   ├── session_keys.py         # Wallet delegation
│   ├── trade_guard.py          # Pre-trade validation
│   ├── news.py                 # News aggregation
│   ├── audit.py                # Transaction logging
│   │
│   ├── liquidity/
│   │   ├── unified_position_manager.py
│   │   ├── orca_client.py
│   │   └── position_monitor.py
│   │
│   ├── meteora_dlmm/
│   │   ├── dlmm_client.py
│   │   ├── position_manager.py
│   │   └── strategy_calculator.py
│   │
│   └── yield_hunter/
│       ├── yield_aggregator.py
│       ├── kamino.py
│       ├── jupiter_lend.py
│       └── hylo.py
│
└── meteora_sidecar/
    ├── index.js                # Meteora sidecar (port 5002)
    ├── orca_sidecar.js         # Orca sidecar (port 5003)
    ├── instruction_builder.js  # Meteora TX builder
    └── orca_instruction_builder.js
```

### Frontend (`/frontend/src`)

```
frontend/src/
├── App.tsx                     # Root component
├── main.tsx                    # Entry point
│
├── app/
│   └── store.ts                # Redux store config
│
├── features/
│   ├── portfolio/              # Portfolio slice
│   ├── prices/                 # Prices slice
│   ├── bots/                   # Bots slice
│   ├── copytrade/              # Copy trade slice
│   ├── arb/                    # Arbitrage slice
│   ├── sniper/                 # Sniper slice
│   ├── yield/                  # Yield slice
│   ├── dlmm/                   # DLMM slice
│   ├── liquidity/              # Liquidity slice
│   └── ...
│
├── services/
│   └── socket/
│       ├── index.ts            # Socket initialization
│       ├── SocketManager.ts    # Connection manager
│       └── handlers/
│           ├── portfolio.ts
│           ├── prices.ts
│           ├── bots.ts
│           ├── copytrade.ts
│           ├── arb.ts
│           ├── liquidity.ts
│           └── ...
│
├── pages/
│   ├── Dashboard.tsx
│   ├── BotsPage.tsx
│   ├── CopyTradePage.tsx
│   ├── ArbPage.tsx
│   ├── LiquidityPage.tsx
│   ├── DLMMPage.tsx
│   ├── YieldHunterPage.tsx
│   └── SniperPage.tsx
│
└── components/
    ├── widgets/                # Dashboard widgets
    ├── modals/                 # Modal dialogs
    └── ui/                     # Base UI components
```

---

## WebSocket Namespaces

| Namespace | Redux Slice | Events |
|-----------|-------------|--------|
| `/portfolio` | portfolio | balance_update, holdings_update |
| `/prices` | prices | price_update, price_feed |
| `/history` | portfolio | trade_history, new_trade |
| `/bots` | bots | bot_update, bot_created, bot_stopped |
| `/copytrade` | copytrade | signal_detected, target_update |
| `/arb` | arb | matrix_update, opportunity_detected |
| `/sniper` | sniper | token_detected, snipe_executed |
| `/intel` | intel | news_update |
| `/yield` | yield | opportunities_update |
| `/dlmm` | dlmm | pools_update, position_update |
| `/liquidity` | liquidity | unified_pools, rebalance_suggestion |

---

## External API Integrations

### Helius
- **RPC**: `https://mainnet.helius-rpc.com/?api-key={key}`
- **WebSocket**: `wss://mainnet.helius-rpc.com/?api-key={key}`
- **DAS API**: Token metadata

### Jupiter
- **Quote**: `https://api.jup.ag/swap/v1/quote`
- **Swap**: `https://api.jup.ag/swap/v1/swap`
- **Limit**: `https://api.jup.ag/limit/v2`

### Pyth Network
- **Hermes**: `https://hermes.pyth.network/api/latest_price_feeds`

### Meteora
- **DLMM API**: Pool discovery and metadata

### Orca
- **GraphQL**: Whirlpools data

### DeFi Protocols
- Kamino, Jupiter Lend, Loopscale, HyLo

---

## Security Layers

1. **Authentication**: Token-based + session cookies (24h expiry)
2. **IP Whitelist**: localhost (127.0.0.1, ::1) by default
3. **Rate Limiting**: Per-endpoint throttling
4. **Encrypted Keypair**: PBKDF2 + Fernet encryption
5. **Security Headers**: X-Frame-Options, CSP, XSS Protection
6. **CORS**: Restricted to localhost:5173
7. **Trade Guard**: Pre-trade validation and sanity checks
8. **Audit Logging**: All transactions logged

---

## Startup Sequence

```bash
# Recommended: Full system via supervisor
python supervisor.py

# Supervisor starts:
# 1. Backend (app.py)           → Port 5001
# 2. Price Server               → Background
# 3. Sniper Outrider            → Background
# 4. Meteora Sidecar (npm)      → Port 5002
# 5. Orca Sidecar               → Port 5003
# 6. Frontend (npm)             → Port 5173
# 7. Network Monitor            → Background
```

---

## Visual Diagram

Open `/docs/architecture-diagram.html` in a browser for an interactive visual diagram.
