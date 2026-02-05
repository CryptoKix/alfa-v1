# TacTix.sol - Pages and Widgets Reference

Quick reference for which widgets appear on which pages.

---

## Quick Reference Table

| Page | Route | Primary Widgets | Modals |
|------|-------|-----------------|--------|
| Dashboard | `/` | Portfolio, Chart, ActiveBots, TradeHistory | - |
| Bots | `/bots` | StrategySelector, BotCreator, ActiveBots, BotPreview, TradeHistory | - |
| Trade | `/trade` | Chart, TradeEntry, LimitOrders, TradeHistory | - |
| Strategies | `/strategies` | StrategyGauges + (Grid/TWAP/VWAP/CopyTrade/WolfPack/Arb) | ActiveBotsModal |
| CopyTrade | `/copytrade` | WhaleTracker, SignalFeed, Alerts | - |
| Arb | `/arb` | ArbScanner, PriceMatrix, Alerts | - |
| Sniper | `/sniper` | TokenSniper, DetectedTokens, Alerts | - |
| Liquidity | `/liquidity` | ProtocolSelector, Favorites, Pools, Positions, Rebalance, CreatePosition | PoolDetailsModal |
| DLMM | `/dlmm` | DLMMPools, DLMMFavorites, DLMMPositions, DLMMStrategy | - |
| Yield | `/yield` | YieldOpportunities, YieldPositions, Portfolio, Alerts | - |
| YieldHunter | `/yield-hunter` | (Inline: Opportunities grid, Protocol stats, Positions) | - |
| YieldFarm | `/yield-farm` | (Inline: Strategy cards, Bin preview, Fleet status) | MeteoraPoolSelectorModal |
| Control | `/control` | ServiceMonitor, TradingModules, Alerts | - |
| Seeker | `/seeker` | SKRStaking, SKRLeaderboard, SKRWhaleFeed, SeekerLogs | - |
| News | `/news` | (Inline: News grid with filters) | - |

---

## Detailed Page Breakdown

### 1. Dashboard (`Dashboard.tsx`)

**Path:** `/`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `PortfolioWidget` | portfolio | Portfolio value, holdings, 24h change |
| `ChartWidget` | chart | Price/trading chart |
| `ActiveBotsWidget` | active-bots | Running bots list |
| `TradeHistoryWidget` | trade-history | Recent trade log |

**Layout:** 4-widget WidgetGrid

---

### 2. Bots Page (`BotsPage.tsx`)

**Path:** `/bots`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `StrategySelector` | (header) | Grid/DCA/TWAP/VWAP tabs |
| `BotCreatorWidget` | bot-creator | Bot configuration form |
| `ActiveBotsWidget` | active-bots | Running bots list |
| `BotPreviewWidget` | bot-preview | Visual grid preview |
| `TradeHistoryWidget` | trade-history | Trade log |

**Conditional Rendering:**
- **Grid Strategy:** Shows Risk Management + Trailing & Execution panels
- **DCA Strategy:** Shows interval/amount config
- **TWAP/VWAP:** Shows time-weighted config

**Layout:** Header selector + WidgetGrid

---

### 3. Trade Page (`TradePage.tsx`)

**Path:** `/trade`

**Widgets:**
| Widget | Position | Description |
|--------|----------|-------------|
| `TradeEntryWidget` | Top-left (4 cols) | Manual swap form |
| `ChartWidget` | Top-right (8 cols) | Price chart |
| `LimitOrdersWidget` | Bottom-left (4 cols) | Limit order management |
| `TradeHistoryWidget` | Bottom-right (8 cols) | Trade history |

**Layout:** 2-row responsive grid (6:3 height ratio)

---

### 4. Strategies Page (`StrategiesPage.tsx`)

**Path:** `/strategies`

**Header Widget:**
| Widget | Description |
|--------|-------------|
| `StrategyGauges` | Visual metrics + "View Bots" button |

**Conditional Strategy Widgets:**
| Strategy | Widgets |
|----------|---------|
| Grid | `GridConfigWidget` |
| TWAP | `TWAPConfigWidget` |
| VWAP | `VWAPConfigWidget` |
| Copy | `CopyTradeConfigWidget` |
| Wolf Pack | `WolfPackWidget` |
| Arb | `ArbSettingsWidget` + `ArbOpportunitiesWidget` + `ArbAnalysisWidget` |

**Modals:**
- `ActiveBotsModal` - Opens from StrategyGauges "View Bots"

**Layout:** Gauges header + conditional content

---

### 5. CopyTrade Page (`CopyTradePage.tsx`)

**Path:** `/copytrade`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `WhaleTrackerWidget` | whale-tracker | Add/manage whale addresses |
| `SignalFeedWidget` | signal-feed | Live whale trade signals |
| `AlertsWidget` | alerts | System alerts |

**Features:**
- Add whales by address + alias
- View whale performance metrics
- Real-time signal notifications

**Layout:** 3-widget WidgetGrid

---

### 6. Arbitrage Page (`ArbPage.tsx`)

**Path:** `/arb`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `ArbScannerWidget` | arb-scanner | Opportunity scanner + auto-strike toggle |
| `PriceMatrixWidget` | price-matrix | Cross-DEX price comparison |
| `AlertsWidget` | alerts | System alerts |

**Features:**
- Auto-strike enable/disable
- Profit calculation per opportunity
- Multi-venue spread display

**Layout:** 3-widget WidgetGrid

---

### 7. Sniper Page (`SniperPage.tsx`)

**Path:** `/sniper`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `TokenSniperWidget` | token-sniper | Sniper arm/disarm + settings |
| `DetectedTokensWidget` | detected-tokens | New token alerts |
| `AlertsWidget` | alerts | System alerts |

**Features:**
- Buy amount, slippage, priority fee config
- Safety filters: mint renounced, LP burned, socials
- Rug detection warnings
- Social links (Twitter/Telegram)

**Layout:** 3-widget WidgetGrid

---

### 8. Liquidity Page (`LiquidityPage.tsx`)

**Path:** `/liquidity`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `ProtocolSelectorWidget` | protocol-selector | Meteora/Orca/All toggle |
| `FavoritesWidget` | liquidity-favorites | Bookmarked pools |
| `LiquidityPoolsWidget` | liquidity-pools | Pool browser with search |
| `LiquidityPositionsWidget` | liquidity-positions | User's LP positions |
| `RebalanceWidget` | rebalance-manager | Auto-rebalance engine |
| `CreatePositionWidget` | create-position | New position form |

**Modals:**
- `PoolDetailsModal` - Pool info on double-click or action

**Features:**
- Protocol-specific styling
- Sidecar health monitoring
- Risk profiles: Low/Medium/High
- Urgency levels: High (red) / Medium (yellow) / Low (green)

**Layout:** 6-widget WidgetGrid

---

### 9. DLMM Page (`DLMMPage.tsx`)

**Path:** `/dlmm`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `DLMMPoolsWidget` | dlmm-pools | Meteora pool browser |
| `DLMMFavoritesWidget` | dlmm-favorites | Bookmarked pools + URL input |
| `DLMMPositionsWidget` | dlmm-positions | User positions + unclaimed fees |
| `DLMMStrategyWidget` | dlmm-strategy | Strategy creator |

**DLMMStrategyWidget Sub-components:**
- `PoolLiquidityChart` - Actual bin liquidity visualization
- `BinPreview` - Strategy bin distribution preview

**Strategy Options:**
| Setting | Options |
|---------|---------|
| Risk Profile | Low (50 bins), Medium (25 bins), High (10 bins) |
| Strategy Type | Spot, Curve, Bid-Ask |
| Deposit Mode | Dual-sided, Single-X, Single-Y |

**Layout:** 4-widget WidgetGrid

---

### 10. Yield Page (`YieldPage.tsx`)

**Path:** `/yield`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `YieldOpportunitiesWidget` | yield-opportunities | Browse yields with risk filter |
| `YieldPositionsWidget` | yield-positions | Active yield positions |
| `PortfolioWidget` | portfolio | Portfolio snapshot |
| `AlertsWidget` | alerts | System alerts |

**Features:**
- Risk levels: Low/Medium/High
- APY, TVL, min deposit display
- Withdrawal buttons on positions

**Layout:** 4-widget WidgetGrid

---

### 11. YieldHunter Page (`YieldHunterPage.tsx`)

**Path:** `/yield-hunter`

**Inline Components (no separate widgets):**
| Section | Description |
|---------|-------------|
| Stats Row | Total Opportunities, Best APY, Total TVL, Your Positions |
| Filters Panel | Risk level, Protocol, Sort (collapsible) |
| Opportunities Grid | 2-3 column card grid |
| Sidebar | Protocol stats + Your Positions |

**Filters:**
| Filter | Options |
|--------|---------|
| Protocol | Kamino, Jupiter Lend, Loopscale, HyLo |
| Risk | Low, Medium, High |
| Sort | APY, TVL, Risk |

**Layout:** Custom flex (not WidgetGrid)

---

### 12. YieldFarm Page (`YieldFarm.tsx`)

**Path:** `/yield-farm`

**Inline Components:**
| Section | Position | Description |
|---------|----------|-------------|
| Strategy Cards | Left column | Risk profile selection |
| Fleet Status | Left column | Active positions overview |
| Bin Preview | Right column | Liquidity distribution chart |
| Asset Selection | Right column | Token pair picker |
| Capital Input | Right column | Deposit amount |
| Monitor Panel | Right column | Real-time metrics (when position selected) |

**Modals:**
- `MeteoraPoolSelectorModal` - Pool selection

**Risk Profiles:**
| Profile | Strategy | Risk |
|---------|----------|------|
| Stability Harvester | Curve | Low |
| Volatility Engine | Bid-Ask | Medium |
| Bin Sniper | Spot | High |

**Layout:** 2-column tactical interface (4:8 ratio)

---

### 13. Control Panel (`ControlPanel.tsx`)

**Path:** `/control`

**Widgets:**
| Widget | Key | Description |
|--------|-----|-------------|
| `ServiceMonitorWidget` | service-monitor | Backend service status |
| `TradingModulesWidget` | trading-modules | Trading engine status |
| `AlertsWidget` | alerts | System alerts |

**Layout:** 3-widget WidgetGrid

---

### 14. Seeker Page (`SeekerPage.tsx`)

**Path:** `/seeker`

**Widgets:**
| Widget | Position | Description |
|--------|----------|-------------|
| `SKRStakingWidget` | Left-top | Staking metrics (340px) |
| `SKRWhaleLeaderboardWidget` | Left-bottom | Top whales (flex) |
| `SKRWhaleFeedWidget` | Right-top | Live whale activity (flex) |
| `SeekerLogsWidget` | Right-bottom | System logs (250px) |

**Layout:** 2-column grid (7:5 ratio)

---

### 15. News Page (`NewsPage.tsx`)

**Path:** `/news`

**Inline Components:**
| Section | Description |
|---------|-------------|
| Header | Title + filters + feed status |
| Filter Controls | Category, Type, Sort dropdowns |
| News Grid | 2-3 column responsive card grid |

**Filters:**
| Filter | Options |
|--------|---------|
| Category | All, Crypto, TradFi (Stocks, Forex, Macro) |
| Type | All, News, Social |
| Sentiment | Bullish (green), Bearish (red), Urgent (purple) |

**Layout:** Custom 3-column grid

---

## Widget Component Locations

### Shared Widgets (`/components/widgets/`)

```
components/widgets/
├── index.ts                    # Barrel export
├── base/
│   └── WidgetContainer.tsx     # Widget wrapper
├── portfolio/
│   ├── PortfolioWidget.tsx
│   └── TradeHistoryWidget.tsx
├── trading/
│   ├── ChartWidget.tsx
│   ├── TradeEntryWidget.tsx
│   └── LimitOrdersWidget.tsx
├── bots/
│   ├── ActiveBotsWidget.tsx
│   ├── BotPreviewWidget.tsx
│   ├── GridConfigWidget.tsx
│   ├── TWAPConfigWidget.tsx
│   └── VWAPConfigWidget.tsx
├── copytrade/
│   └── CopyTradeConfigWidget.tsx
├── arb/
│   ├── ArbSettingsWidget.tsx
│   ├── ArbOpportunitiesWidget.tsx
│   └── ArbAnalysisWidget.tsx
├── system/
│   ├── ServiceMonitorWidget.tsx
│   ├── TradingModulesWidget.tsx
│   └── AlertsWidget.tsx
└── seeker/
    ├── SKRStakingWidget.tsx
    ├── SKRWhaleLeaderboardWidget.tsx
    ├── SKRWhaleFeedWidget.tsx
    └── SeekerLogsWidget.tsx
```

### Modals (`/components/modals/`)

```
components/modals/
├── ActiveBotsModal.tsx         # View all bots
├── BotDetailsModal.tsx         # Bot configuration
├── PoolDetailsModal.tsx        # LP pool info
├── MeteoraPoolSelectorModal.tsx # Pool selection
├── WalletConnectModal.tsx      # Wallet connection
├── ManualSnipeModal.tsx        # One-off sniper
├── ArbSimulatorModal.tsx       # ARB backtesting
├── BacktestModal.tsx           # Strategy backtesting
├── HistoryModal.tsx            # Extended history
└── LoopSimulatorModal.tsx      # Liquidity simulation
```

---

## Layout Patterns

### WidgetGrid Layout
Most pages use `WidgetGrid` with keyed widgets:
```tsx
<WidgetGrid widgets={[
  { key: "widget-key", component: <WidgetComponent /> },
  // ...
]} />
```

### Two-Column Layout
Pages like Seeker and YieldFarm use grid columns:
```tsx
<div className="grid grid-cols-12 gap-4">
  <div className="lg:col-span-7">...</div>
  <div className="lg:col-span-5">...</div>
</div>
```

### Conditional Rendering
Strategy pages render different widgets based on Redux state:
```tsx
{selectedStrategy === 'grid' && <GridConfigWidget />}
{selectedStrategy === 'twap' && <TWAPConfigWidget />}
```

---

## Common Widget Props

| Prop | Type | Description |
|------|------|-------------|
| `className` | string | Additional CSS classes |
| `onAction` | function | Callback for widget actions |
| `data` | object | Pre-loaded data (optional) |
| `compact` | boolean | Compact display mode |

---

## Notes for Development

1. **Adding a widget to a page:** Import from `/components/widgets` and add to the WidgetGrid array
2. **Creating inline widgets:** Define within the page file for page-specific functionality
3. **Opening modals:** Use React state + conditional rendering
4. **Conditional widgets:** Check Redux state (e.g., `selectedStrategy`) before rendering
5. **Responsive layouts:** Use Tailwind breakpoints (`lg:col-span-X`)
