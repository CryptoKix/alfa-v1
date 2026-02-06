import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface SnipedToken {
  mint: string
  symbol: string
  name: string
  pool_address: string
  dex_id: string
  initial_liquidity: number
  is_rug: boolean
  socials_json: string
  detected_at: string
  status: string
}

export interface SnipePosition {
  id: number
  symbol: string
  mint: string
  sol_spent: number
  tokens_received: number
  usd_value: number
  source: string
  timestamp: string
  signature: string
}

export interface SniperSettings {
  autoSnipe: boolean
  buyAmount: number
  slippage: number
  priorityFee: number
  minLiquidity: number
  requireMintRenounced: boolean
  requireLPBurned: boolean
  requireSocials: boolean
  // Take Profit / Stop Loss (graduated mode)
  takeProfitEnabled: boolean
  takeProfitPct: number       // Sell when price is up X% from entry (e.g. 100 = 2x)
  stopLossEnabled: boolean
  stopLossPct: number         // Sell when price is down X% from entry (e.g. 50)
  trailingStopEnabled: boolean
  trailingStopPct: number     // Trailing stop — sell when price drops X% from peak
  // Anti-rug checks (graduated mode)
  skipBondingCurve: boolean          // Legacy — replaced by snipeMode
  rugcheckEnabled: boolean           // Enable RugCheck API validation (creator balance + risk score)
  rugcheckMinScore: number           // Max risk score (higher=riskier, 1=clean, 10000=default)
  creatorBalanceCheckEnabled: boolean // Block tokens where creator holds 0 tokens
  minMarketCapSOL: number            // Minimum estimated FDV in SOL (0=disabled)
  // Mode + HFT
  snipeMode: 'graduated' | 'hft' | 'both'
  hftBuyAmount: number             // SOL per HFT snipe
  hftSlippage: number              // % slippage for bonding curve buys
  hftPriorityFee: number           // SOL — Jito tip
  hftJitoPercentile: string        // "75th" | "95th" | "99th"
  hftMaxHoldSeconds: number        // Auto-sell deadline
  hftTakeProfitPct: number         // Sell at +X%
  hftStopLossPct: number           // Sell at -X%
  hftAutoSellEnabled: boolean      // Master toggle for HFT auto-sell
}

export interface HftPosition {
  mint: string
  symbol: string
  sol_spent: number
  tokens_received: number
  entry_time: string
  peak_pnl_pct: number
  current_pnl_pct: number
  seconds_remaining: number
  status: string           // 'monitoring' | 'selling' | 'sold' | 'error'
  reason?: string
  signature?: string
  sol_received?: number
}

export interface SniperState {
  trackedTokens: SnipedToken[]
  snipePositions: SnipePosition[]
  hftPositions: HftPosition[]
  loading: boolean
  settings: SniperSettings
  armed: boolean      // autoSnipe ON — will auto-execute
  detecting: boolean  // detection engine running (started from control panel)
}

const initialState: SniperState = {
  trackedTokens: [],
  snipePositions: [],
  hftPositions: [],
  loading: false,
  armed: false,
  detecting: false,
  settings: {
    autoSnipe: false,
    buyAmount: 0.1,
    slippage: 15,
    priorityFee: 0.005,
    minLiquidity: 0.1,
    requireMintRenounced: true,
    requireLPBurned: true,
    requireSocials: false,
    takeProfitEnabled: true,
    takeProfitPct: 100,
    stopLossEnabled: true,
    stopLossPct: 50,
    trailingStopEnabled: false,
    trailingStopPct: 20,
    // Anti-rug checks
    skipBondingCurve: false,
    rugcheckEnabled: true,
    rugcheckMinScore: 10000,
    creatorBalanceCheckEnabled: true,
    minMarketCapSOL: 0,
    // Mode + HFT
    snipeMode: 'graduated',
    hftBuyAmount: 0.1,
    hftSlippage: 25,
    hftPriorityFee: 0.00005,
    hftJitoPercentile: '95th',
    hftMaxHoldSeconds: 60,
    hftTakeProfitPct: 30,
    hftStopLossPct: 25,
    hftAutoSellEnabled: true,
  }
}

export const sniperSlice = createSlice({
  name: 'sniper',
  initialState,
  reducers: {
    setTrackedTokens: (state, action: PayloadAction<SnipedToken[]>) => {
      state.trackedTokens = action.payload
      state.loading = false
    },
    addTrackedToken: (state, action: PayloadAction<SnipedToken>) => {
      const index = state.trackedTokens.findIndex(t => t.mint === action.payload.mint)
      if (index !== -1) {
        const updatedToken = { ...state.trackedTokens[index], ...action.payload }
        state.trackedTokens.splice(index, 1)
        state.trackedTokens.unshift(updatedToken)
      } else {
        state.trackedTokens = [action.payload, ...state.trackedTokens].slice(0, 100)
      }
    },
    setSnipePositions: (state, action: PayloadAction<SnipePosition[]>) => {
      state.snipePositions = action.payload
    },
    setSniperLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    updateSniperSettings: (state, action: PayloadAction<Partial<SniperSettings>>) => {
      state.settings = { ...state.settings, ...action.payload }
    },
    setSniperStatus: (state, action: PayloadAction<{ armed: boolean; detecting: boolean }>) => {
      state.armed = action.payload.armed
      state.detecting = action.payload.detecting
      state.settings.autoSnipe = action.payload.armed
    },
    syncSettings: (state, action: PayloadAction<Partial<SniperSettings>>) => {
      state.settings = { ...state.settings, ...action.payload }
      state.armed = !!action.payload.autoSnipe
    },
    setHftPositions: (state, action: PayloadAction<HftPosition[]>) => {
      state.hftPositions = action.payload
    },
    updateHftPosition: (state, action: PayloadAction<HftPosition>) => {
      const idx = state.hftPositions.findIndex(p => p.mint === action.payload.mint)
      if (idx !== -1) {
        state.hftPositions[idx] = { ...state.hftPositions[idx], ...action.payload }
      } else {
        state.hftPositions.unshift(action.payload)
      }
    },
    removeHftPosition: (state, action: PayloadAction<string>) => {
      state.hftPositions = state.hftPositions.filter(p => p.mint !== action.payload)
    },
  },
})

export const {
  setTrackedTokens, addTrackedToken, setSnipePositions,
  setSniperLoading, updateSniperSettings, setSniperStatus, syncSettings,
  setHftPositions, updateHftPosition, removeHftPosition,
} = sniperSlice.actions
export default sniperSlice.reducer
