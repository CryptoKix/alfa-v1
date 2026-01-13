import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface CopyTarget {
  address: string
  alias: string
  tags: string[]
  status: 'active' | 'paused' | 'deleted'
  config: {
    scale_factor: number
    max_per_trade: number
  }
  performance: {
    total_profit_sol?: number
    win_rate?: number
    total_trades?: number
  }
}

export interface CopySignal {
  id: number
  signature: string
  wallet: string
  timestamp: number
  type: string
  sent?: { mint: string; symbol: string; amount: number }
  received?: { mint: string; symbol: string; amount: number }
}

interface CopyTradeState {
  targets: CopyTarget[]
  signals: CopySignal[]
  loading: boolean
}

const initialState: CopyTradeState = {
  targets: [],
  signals: [],
  loading: false,
}

const copytradeSlice = createSlice({
  name: 'copytrade',
  initialState,
  reducers: {
    setTargets: (state, action: PayloadAction<CopyTarget[]>) => {
      state.targets = action.payload
    },
    updateTarget: (state, action: PayloadAction<CopyTarget>) => {
      const index = state.targets.findIndex(t => t.address === action.payload.address)
      if (index !== -1) {
        state.targets[index] = action.payload
      }
    },
    setSignals: (state, action: PayloadAction<CopySignal[]>) => {
      state.signals = action.payload
    },
    addSignal: (state, action: PayloadAction<CopySignal>) => {
      state.signals = [action.payload, ...state.signals].slice(0, 100)
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
  },
})

export const { setTargets, updateTarget, setSignals, addSignal, setLoading } = copytradeSlice.actions
export default copytradeSlice.reducer
