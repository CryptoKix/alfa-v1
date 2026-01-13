# Plan: Tactix UI - Solana Trading Terminal

## Overview
Build a new React frontend from scratch for the Tactix Solana trading platform, using a widget-based architecture for maximum reusability.

**Tech Stack:**
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui components
- Redux Toolkit for state management
- Socket.IO client for real-time updates

**Design:** Cyberpunk/Neon theme (dark background, cyan/pink accents)

---

## Project Structure

```
/data/kixAI/tactix/frontend/
├── src/
│   ├── app/
│   │   ├── store.ts              # Redux store configuration
│   │   └── hooks.ts              # Typed Redux hooks
│   ├── features/
│   │   ├── portfolio/            # Portfolio slice + selectors
│   │   ├── trading/              # Trading slice (orders, execution)
│   │   ├── bots/                 # Bot management slice
│   │   ├── copytrade/            # Copy trading slice
│   │   └── prices/               # Price feed slice
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── widgets/              # Reusable dashboard widgets
│   │   │   ├── PortfolioWidget.tsx
│   │   │   ├── PriceTickerWidget.tsx
│   │   │   ├── TradeHistoryWidget.tsx
│   │   │   ├── ActiveBotsWidget.tsx
│   │   │   ├── CopySignalsWidget.tsx
│   │   │   ├── QuickTradeWidget.tsx
│   │   │   └── PerformanceWidget.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MainLayout.tsx
│   │   └── shared/               # Shared components
│   │       ├── TokenSelect.tsx
│   │       ├── AmountInput.tsx
│   │       └── TransactionStatus.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx         # Main dashboard with widgets
│   │   ├── Trade.tsx             # Simple trading interface
│   │   ├── Strategies.tsx        # DCA/TWAP/VWAP/Grid bots
│   │   ├── CopyTrade.tsx         # Copy trading interface
│   │   └── Sniper.tsx            # Token sniper (future)
│   ├── services/
│   │   ├── api.ts                # REST API client
│   │   └── socket.ts             # WebSocket connection manager
│   ├── lib/
│   │   ├── utils.ts              # Utility functions
│   │   └── constants.ts          # App constants
│   ├── styles/
│   │   └── globals.css           # Tailwind + custom styles
│   └── main.tsx                  # App entry point
├── public/
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Phase 1: Project Setup & Foundation

### 1.1 Initialize Project
```bash
cd /data/kixAI/tactix
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

### 1.2 Install Dependencies
```bash
# Core
npm install @reduxjs/toolkit react-redux socket.io-client axios

# UI
npm install tailwindcss postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react                    # Icons
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-tooltip

# Charts
npm install lightweight-charts recharts

# Utilities
npm install date-fns
```

### 1.3 Configure Tailwind with Cyberpunk Theme
**tailwind.config.js:**
```js
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#0a0a0f',
          card: '#12121a',
          elevated: '#1a1a2e',
        },
        accent: {
          cyan: '#00ffff',
          pink: '#ff0080',
          purple: '#9945FF',
        },
        border: '#2a2a3a',
        text: {
          primary: '#ffffff',
          secondary: '#8a8a9a',
          muted: '#5a5a6a',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
```

### 1.4 Setup shadcn/ui
```bash
npx shadcn@latest init
# Select: TypeScript, Default style, CSS variables, tailwind.config.js
npx shadcn@latest add button card dialog dropdown-menu input select tabs toast tooltip badge
```

---

## Phase 2: Redux Store & Services

### 2.1 Redux Store Structure

**features/portfolio/portfolioSlice.ts:**
```ts
interface PortfolioState {
  holdings: TokenHolding[];
  totalUsd: number;
  wallet: string;
  loading: boolean;
}
```

**features/prices/pricesSlice.ts:**
```ts
interface PricesState {
  prices: Record<string, number>;  // mint -> price
  lastUpdate: number;
}
```

**features/trading/tradingSlice.ts:**
```ts
interface TradingState {
  tokens: Token[];
  history: Trade[];
  pendingTrade: TradeRequest | null;
  status: 'idle' | 'loading' | 'success' | 'error';
}
```

**features/bots/botsSlice.ts:**
```ts
interface BotsState {
  bots: Bot[];
  loading: boolean;
}
```

**features/copytrade/copytradeSlice.ts:**
```ts
interface CopyTradeState {
  targets: CopyTarget[];
  signals: Signal[];
  loading: boolean;
}
```

### 2.2 WebSocket Service

**services/socket.ts:**
- Connect to namespaces: `/prices`, `/portfolio`, `/bots`, `/history`, `/copytrade`
- Dispatch Redux actions on events
- Auto-reconnect logic

### 2.3 API Service

**services/api.ts:**
- REST client with axios
- Endpoints for all backend routes
- Error handling middleware

---

## Phase 3: Dashboard Page

### 3.1 Layout
- Header: Logo, wallet info, connection status
- Sidebar: Navigation (Dashboard, Trade, Strategies, Copy Trade, Sniper)
- Main: Grid of draggable/resizable widgets

### 3.2 Dashboard Widgets

| Widget | Data Source | Purpose |
|--------|-------------|---------|
| PortfolioWidget | `/portfolio` WS | Holdings pie chart + list |
| PriceTickerWidget | `/prices` WS | Real-time token prices |
| TradeHistoryWidget | `/history` WS | Recent trades table |
| ActiveBotsWidget | `/bots` WS | Bot status cards |
| CopySignalsWidget | `/copytrade` WS | Recent copy signals |
| QuickTradeWidget | REST API | Fast swap form |
| PerformanceWidget | Snapshots API | PnL chart over time |

---

## Phase 4: Simple Trading Page (Priority 1)

### 4.1 Components
- **TokenSelector**: Dropdown with search, shows balance
- **SwapCard**: Input token, output token, amount, slippage
- **PriceChart**: TradingView Lightweight Charts (candlestick)
- **OrderPanel**: Market/Limit tabs, amount input, execute button
- **TradeConfirmModal**: Review trade details before execution

### 4.2 Features
- Real-time price updates from `/prices` namespace
- Jupiter quote preview before execution
- Slippage and priority fee configuration
- Transaction status toast notifications
- Trade history sidebar

### 4.3 API Integration
- `GET /api/tokens` - Load available tokens
- `POST /api/trade` - Execute swap
- WebSocket `/prices` - Live price feed

---

## Phase 5: Strategy Bots Page

### 5.1 Components
- **BotCard**: Status, progress, config summary
- **CreateBotModal**: Strategy type selector + config form
- **BotDetailPanel**: Full config, execution log, controls

### 5.2 Strategy Types
| Type | Config Fields |
|------|---------------|
| DCA | interval, maxRuns, takeProfit, amount |
| TWAP | duration, totalAmount, slices |
| VWAP | duration, totalAmount |
| GRID | lowerBound, upperBound, steps, investment |

### 5.3 API Integration
- `GET /api/dca/list` - List all bots
- `POST /api/dca/add` - Create bot
- `POST /api/dca/delete` - Delete bot
- WebSocket `/bots` - Real-time status updates

---

## Phase 6: Copy Trading Page

### 6.1 Components
- **TargetTable**: List of wallets being copied
- **AddTargetModal**: Address input, alias, config
- **SignalFeed**: Real-time detected swaps
- **TargetDetailPanel**: Performance metrics, trade history

### 6.2 Features
- Add/remove/pause copy targets
- Configure scale factor and max per trade
- Real-time signal detection with sound alerts
- PnL tracking per target

### 6.3 API Integration
- `GET /api/copytrade/targets` - List targets
- `POST /api/copytrade/targets/add` - Add target
- `POST /api/copytrade/targets/update` - Update config
- `GET /api/copytrade/signals` - Historical signals
- WebSocket `/copytrade` - Real-time signals

---

## Phase 7: Sniper Page (Placeholder)

### 7.1 Initial Structure
- Coming soon placeholder
- Infrastructure requirements list
- Basic UI mockup for future development

---

## Implementation Order

1. **Setup** (Phase 1) - Project init, dependencies, Tailwind config
2. **Redux + Services** (Phase 2) - Store, slices, socket/API services
3. **Layout + Widgets** (Phase 3) - Header, sidebar, widget components
4. **Dashboard** (Phase 3) - Assemble widgets into dashboard
5. **Trade Page** (Phase 4) - Simple trading interface
6. **Strategies Page** (Phase 5) - Bot management
7. **Copy Trade Page** (Phase 6) - Copy trading interface
8. **Sniper Page** (Phase 7) - Placeholder

---

## Critical Files

**New files to create:**
- `/data/kixAI/tactix/frontend/` - Entire frontend directory

**Backend proxy config (vite.config.ts):**
```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
```

---

## Verification

1. `npm run dev` starts Vite on port 5173
2. Dashboard loads with portfolio data from WebSocket
3. Trade page executes swaps via Jupiter
4. Bot creation and monitoring works
5. Copy trading signals appear in real-time
6. All WebSocket namespaces connect successfully

---

## Design System Reference

**Colors:**
- Background: `#0a0a0f` (primary), `#12121a` (card), `#1a1a2e` (elevated)
- Accents: `#00ffff` (cyan/bullish), `#ff0080` (pink/bearish)
- Text: `#ffffff` (primary), `#8a8a9a` (secondary)
- Borders: `#2a2a3a`

**Typography:**
- Font: JetBrains Mono (monospace for trading data)
- Sizes: xs (10px), sm (12px), base (14px), lg (16px)

**Components:**
- Rounded corners: `rounded-lg` (8px) or `rounded-xl` (12px)
- Borders: 1px solid border color
- Cards: Background card color with border
- Buttons: Cyan accent for primary actions, pink for destructive
