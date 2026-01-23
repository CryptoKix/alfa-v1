import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface YieldOpportunity {
  protocol: string
  vault_address: string
  name: string
  deposit_token: string
  deposit_symbol: string
  apy: number
  tvl: number
  risk_level: 'low' | 'medium' | 'high'
  risk_factors: string[]
  min_deposit: number
  protocol_logo: string
  token_logo: string
}

export interface YieldPosition {
  id: number
  wallet_address: string
  protocol: string
  vault_address: string
  vault_name: string
  deposit_mint: string
  deposit_symbol: string
  deposit_amount: number
  shares_received: number
  entry_apy: number
  deposit_signature: string
  deposit_timestamp: string
  withdraw_amount?: number
  withdraw_signature?: string
  withdraw_timestamp?: string
  status: 'active' | 'closed'
}

export interface YieldState {
  opportunities: YieldOpportunity[]
  positions: YieldPosition[]
  loading: boolean
  error: string | null
  filters: {
    risk: string | null
    protocol: string | null
    sortBy: 'apy' | 'tvl' | 'risk'
    sortOrder: 'asc' | 'desc'
  }
  stats: {
    totalOpportunities: number
    avgApy: number
    maxApy: number
    totalTvl: number
  } | null
}

const initialState: YieldState = {
  opportunities: [],
  positions: [],
  loading: false,
  error: null,
  filters: {
    risk: null,
    protocol: null,
    sortBy: 'apy',
    sortOrder: 'desc'
  },
  stats: null
}

const yieldSlice = createSlice({
  name: 'yield',
  initialState,
  reducers: {
    setOpportunities: (state, action: PayloadAction<YieldOpportunity[]>) => {
      state.opportunities = action.payload
      state.loading = false
      state.error = null
      // Update stats
      if (action.payload.length > 0) {
        state.stats = {
          totalOpportunities: action.payload.length,
          avgApy: action.payload.reduce((sum, o) => sum + o.apy, 0) / action.payload.length,
          maxApy: Math.max(...action.payload.map(o => o.apy)),
          totalTvl: action.payload.reduce((sum, o) => sum + o.tvl, 0)
        }
      }
    },
    setPositions: (state, action: PayloadAction<YieldPosition[]>) => {
      state.positions = action.payload
    },
    addPosition: (state, action: PayloadAction<YieldPosition>) => {
      state.positions = [action.payload, ...state.positions]
    },
    updatePosition: (state, action: PayloadAction<{ id: number; updates: Partial<YieldPosition> }>) => {
      const index = state.positions.findIndex(p => p.id === action.payload.id)
      if (index !== -1) {
        state.positions[index] = { ...state.positions[index], ...action.payload.updates }
      }
    },
    removePosition: (state, action: PayloadAction<number>) => {
      state.positions = state.positions.filter(p => p.id !== action.payload)
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.loading = false
    },
    setFilters: (state, action: PayloadAction<Partial<YieldState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = initialState.filters
    }
  }
})

export const {
  setOpportunities,
  setPositions,
  addPosition,
  updatePosition,
  removePosition,
  setLoading,
  setError,
  setFilters,
  clearFilters
} = yieldSlice.actions

export default yieldSlice.reducer
