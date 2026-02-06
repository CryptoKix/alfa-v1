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

export interface SniperSettings {
  autoSnipe: boolean
  buyAmount: number
  slippage: number
  priorityFee: number
  minLiquidity: number
  requireMintRenounced: boolean
  requireLPBurned: boolean
  requireSocials: boolean
  // Take Profit / Stop Loss
  takeProfitEnabled: boolean
  takeProfitPct: number       // Sell when price is up X% from entry (e.g. 100 = 2x)
  stopLossEnabled: boolean
  stopLossPct: number         // Sell when price is down X% from entry (e.g. 50)
  trailingStopEnabled: boolean
  trailingStopPct: number     // Trailing stop — sell when price drops X% from peak
}

export interface SniperState {
  trackedTokens: SnipedToken[]
  loading: boolean
  settings: SniperSettings
  engineActive: boolean
}

const initialState: SniperState = {
  trackedTokens: [],
  loading: false,
  engineActive: false,
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
        // Update existing token and move to top
        const updatedToken = { ...state.trackedTokens[index], ...action.payload }
        state.trackedTokens.splice(index, 1)
        state.trackedTokens.unshift(updatedToken)
      } else {
        // Add new token to top
        state.trackedTokens = [action.payload, ...state.trackedTokens].slice(0, 100)
      }
    },
    setSniperLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    updateSniperSettings: (state, action: PayloadAction<Partial<SniperSettings>>) => {
      state.settings = { ...state.settings, ...action.payload }
    },
    setEngineActive: (state, action: PayloadAction<boolean>) => {
      state.engineActive = action.payload
    }
  },
})

export const { setTrackedTokens, addTrackedToken, setSniperLoading, updateSniperSettings, setEngineActive } = sniperSlice.actions
export default sniperSlice.reducer
