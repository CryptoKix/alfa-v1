import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface DLMMPool {
  address: string
  name: string
  token_x_mint: string
  token_y_mint: string
  token_x_symbol: string
  token_y_symbol: string
  bin_step: number
  base_fee_bps: number
  protocol_fee_bps: number
  liquidity: number
  volume_24h: number
  fees_24h: number
  apr: number
  price: number
}

export interface DLMMPosition {
  id: number
  position_pubkey: string
  pool_address: string
  pool_name: string | null
  token_x_mint: string
  token_y_mint: string
  token_x_symbol: string | null
  token_y_symbol: string | null
  wallet_address: string
  risk_profile: 'high' | 'medium' | 'low'
  strategy_type: 'spot' | 'curve' | 'bidask'
  min_bin_id: number
  max_bin_id: number
  bin_step: number
  deposit_x_amount: number
  deposit_y_amount: number
  deposit_usd_value: number
  current_x_amount: number
  current_y_amount: number
  current_usd_value: number
  unclaimed_fees_x: number
  unclaimed_fees_y: number
  total_fees_claimed_x: number
  total_fees_claimed_y: number
  create_signature: string
  close_signature: string | null
  created_at: string
  last_updated: string
  status: 'active' | 'closed' | 'pending'
  roi?: {
    deposit_usd: number
    current_usd: number
    pnl_usd: number
    roi_pct: number
    unclaimed_fees_x: number
    unclaimed_fees_y: number
  }
}

export interface DetectedPool {
  id: number
  pool_address: string
  token_x_mint: string | null
  token_y_mint: string | null
  token_x_symbol: string | null
  token_y_symbol: string | null
  bin_step: number
  base_fee_bps: number
  initial_price: number
  detected_signature: string
  detected_at: string
  sniped: boolean
  snipe_position_pubkey: string | null
  status: 'detected' | 'sniped' | 'ignored'
}

export interface SniperSettings {
  enabled: boolean
  risk_profile_filter: 'all' | 'high' | 'medium' | 'low'
  min_bin_step: number
  max_bin_step: number
  auto_create_position: boolean
  default_strategy_type: 'spot' | 'curve' | 'bidask'
  default_range_width_pct: number
  deposit_amount_sol: number
  max_positions: number
}

export interface CalculatedStrategy {
  bin_range: {
    min_bin_id: number
    max_bin_id: number
    num_bins: number
    range_pct: number
    risk_profile: string
    rebalance_threshold: number
  }
  price_impact: {
    max_price_move_pct: number
    il_at_max_move_pct: number
  }
  fee_potential: {
    adjusted_apr: number
    base_apr: number
    concentration_multiplier: number
    daily_estimate_usd: number
    weekly_estimate_usd: number
    monthly_estimate_usd: number
  }
  pool_info: {
    active_bin_id: number
    bin_step: number
    current_price: number
  }
}

export interface RebalanceSuggestion {
  position_pubkey: string
  reason: string
  timestamp: number
}

export interface FavoritePool {
  address: string
  name: string
  token_x_symbol: string
  token_y_symbol: string
  bin_step: number
  liquidity?: number
  apr?: number
  added_at: number
}

export interface BinLiquidityData {
  binId: number
  price: number
  xAmount: string
  yAmount: string
  supply: string
  liquidity: number
  normalizedHeight: number
}

export interface PoolBinLiquidity {
  activeBinId: number
  bins: BinLiquidityData[]
  binStep: number
}

export interface DLMMState {
  pools: DLMMPool[]
  positions: DLMMPosition[]
  detectedPools: DetectedPool[]
  favorites: FavoritePool[]
  selectedPool: DLMMPool | null
  selectedPoolBins: PoolBinLiquidity | null
  selectedPoolBinsLoading: boolean
  calculatedStrategy: CalculatedStrategy | null
  sniperSettings: SniperSettings
  rebalanceSuggestions: RebalanceSuggestion[]
  loading: boolean
  error: string | null
  sidecarHealthy: boolean
  filters: {
    search: string
    minLiquidity: number | null
    minApr: number | null
  }
}

const defaultSniperSettings: SniperSettings = {
  enabled: false,
  risk_profile_filter: 'all',
  min_bin_step: 1,
  max_bin_step: 100,
  auto_create_position: false,
  default_strategy_type: 'spot',
  default_range_width_pct: 20.0,
  deposit_amount_sol: 0.1,
  max_positions: 5
}

const initialState: DLMMState = {
  pools: [],
  positions: [],
  detectedPools: [],
  favorites: [],
  selectedPool: null,
  selectedPoolBins: null,
  selectedPoolBinsLoading: false,
  calculatedStrategy: null,
  sniperSettings: defaultSniperSettings,
  rebalanceSuggestions: [],
  loading: false,
  error: null,
  sidecarHealthy: false,
  filters: {
    search: '',
    minLiquidity: null,
    minApr: null
  }
}

const dlmmSlice = createSlice({
  name: 'dlmm',
  initialState,
  reducers: {
    setPools: (state, action: PayloadAction<DLMMPool[]>) => {
      state.pools = action.payload
      state.loading = false
      state.error = null
    },
    setPositions: (state, action: PayloadAction<DLMMPosition[]>) => {
      state.positions = action.payload
    },
    addPosition: (state, action: PayloadAction<DLMMPosition>) => {
      state.positions = [action.payload, ...state.positions]
    },
    updatePosition: (state, action: PayloadAction<{ pubkey: string; updates: Partial<DLMMPosition> }>) => {
      const index = state.positions.findIndex(p => p.position_pubkey === action.payload.pubkey)
      if (index !== -1) {
        state.positions[index] = { ...state.positions[index], ...action.payload.updates }
      }
    },
    removePosition: (state, action: PayloadAction<string>) => {
      state.positions = state.positions.filter(p => p.position_pubkey !== action.payload)
    },
    setDetectedPools: (state, action: PayloadAction<DetectedPool[]>) => {
      state.detectedPools = action.payload
    },
    addDetectedPool: (state, action: PayloadAction<DetectedPool>) => {
      // Avoid duplicates
      if (!state.detectedPools.find(p => p.pool_address === action.payload.pool_address)) {
        state.detectedPools = [action.payload, ...state.detectedPools].slice(0, 100)
      }
    },
    updateDetectedPool: (state, action: PayloadAction<{ address: string; updates: Partial<DetectedPool> }>) => {
      const index = state.detectedPools.findIndex(p => p.pool_address === action.payload.address)
      if (index !== -1) {
        state.detectedPools[index] = { ...state.detectedPools[index], ...action.payload.updates }
      }
    },
    setFavorites: (state, action: PayloadAction<FavoritePool[]>) => {
      state.favorites = action.payload
    },
    addFavorite: (state, action: PayloadAction<FavoritePool>) => {
      if (!state.favorites.find(f => f.address === action.payload.address)) {
        state.favorites = [action.payload, ...state.favorites]
      }
    },
    removeFavorite: (state, action: PayloadAction<string>) => {
      state.favorites = state.favorites.filter(f => f.address !== action.payload)
    },
    setSelectedPool: (state, action: PayloadAction<DLMMPool | null>) => {
      state.selectedPool = action.payload
      state.calculatedStrategy = null // Reset strategy when pool changes
      state.selectedPoolBins = null // Reset bin data when pool changes
    },
    setSelectedPoolBins: (state, action: PayloadAction<PoolBinLiquidity | null>) => {
      state.selectedPoolBins = action.payload
      state.selectedPoolBinsLoading = false
    },
    setSelectedPoolBinsLoading: (state, action: PayloadAction<boolean>) => {
      state.selectedPoolBinsLoading = action.payload
    },
    setCalculatedStrategy: (state, action: PayloadAction<CalculatedStrategy | null>) => {
      state.calculatedStrategy = action.payload
    },
    setSniperSettings: (state, action: PayloadAction<SniperSettings>) => {
      state.sniperSettings = action.payload
    },
    updateSniperSettings: (state, action: PayloadAction<Partial<SniperSettings>>) => {
      state.sniperSettings = { ...state.sniperSettings, ...action.payload }
    },
    addRebalanceSuggestion: (state, action: PayloadAction<RebalanceSuggestion>) => {
      // Avoid duplicates and keep last 10
      const exists = state.rebalanceSuggestions.find(s => s.position_pubkey === action.payload.position_pubkey)
      if (!exists) {
        state.rebalanceSuggestions = [action.payload, ...state.rebalanceSuggestions].slice(0, 10)
      }
    },
    clearRebalanceSuggestion: (state, action: PayloadAction<string>) => {
      state.rebalanceSuggestions = state.rebalanceSuggestions.filter(s => s.position_pubkey !== action.payload)
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.loading = false
    },
    setSidecarHealthy: (state, action: PayloadAction<boolean>) => {
      state.sidecarHealthy = action.payload
    },
    setFilters: (state, action: PayloadAction<Partial<DLMMState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = initialState.filters
    }
  }
})

export const {
  setPools,
  setPositions,
  addPosition,
  updatePosition,
  removePosition,
  setDetectedPools,
  addDetectedPool,
  updateDetectedPool,
  setFavorites,
  addFavorite,
  removeFavorite,
  setSelectedPool,
  setSelectedPoolBins,
  setSelectedPoolBinsLoading,
  setCalculatedStrategy,
  setSniperSettings,
  updateSniperSettings,
  addRebalanceSuggestion,
  clearRebalanceSuggestion,
  setLoading,
  setError,
  setSidecarHealthy,
  setFilters,
  clearFilters
} = dlmmSlice.actions

export default dlmmSlice.reducer
