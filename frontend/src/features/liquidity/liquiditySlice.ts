import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type LiquidityProtocol = 'meteora' | 'orca' | 'all'

export interface TokenInfo {
  mint: string
  symbol: string
  decimals?: number
}

export interface UnifiedPool {
  protocol: 'meteora' | 'orca'
  address: string
  name: string
  tokenX: TokenInfo
  tokenY: TokenInfo
  priceSpacing: number  // binStep for Meteora, tickSpacing for Orca
  feeRate: number
  liquidity: number
  volume24h: number
  fees24h: number
  apr: number
  price: number
  tvl: number
  currentPriceIndex: number
}

export interface UnifiedPosition {
  protocol: 'meteora' | 'orca'
  positionPubkey: string
  positionNftMint: string | null  // Orca only
  poolAddress: string
  userWallet: string
  rangeMin: number
  rangeMax: number
  liquidity: string
  tokenXAmount: string
  tokenYAmount: string
  feeXOwed: string
  feeYOwed: string
  inRange: boolean
  distanceFromEdge: number
  autoRebalance: boolean
  riskProfile: 'high' | 'medium' | 'low'
  createdAt: number
  rewards?: Array<{
    index: number
    amountOwed: string
    mint: string
  }>
}

export interface RebalanceSuggestion {
  positionPubkey: string
  protocol: 'meteora' | 'orca'
  poolAddress: string
  userWallet: string
  reason: 'out_of_range' | 'near_edge'
  currentPriceIndex: number
  rangeMin: number
  rangeMax: number
  distanceFromEdge: number
  suggestedRangeMin: number
  suggestedRangeMax: number
  urgency: 'high' | 'medium' | 'low'
  autoRebalance: boolean
  timestamp: number
}

export interface RebalanceSettings {
  thresholds: {
    high: number
    medium: number
    low: number
  }
  riskConfigs: {
    high: { rangePct: number }
    medium: { rangePct: number }
    low: { rangePct: number }
  }
  checkInterval: number
  running: boolean
}

export interface MonitorSettings {
  distanceThresholds: {
    high: number
    medium: number
    low: number
  }
  feeThresholdUsd: number | null
  maxPositionAgeHours: number | null
  volatilityThresholdPct: number | null
  volatilityWindowMinutes: number
  checkIntervalSeconds: number
}

export interface PositionStatus {
  positionPubkey: string
  protocol: 'meteora' | 'orca'
  poolAddress: string
  userWallet: string
  inRange: boolean
  distanceFromEdge: number
  currentPrice: number
  rangeMinPrice: number
  rangeMaxPrice: number
  feesX: number
  feesY: number
  totalFeesUsd: number
  positionAgeHours: number
  urgency: 'healthy' | 'warning' | 'critical'
  reason: string
  timestamp: number
}

export interface PriceData {
  bins?: Array<{
    binId?: number
    tickIndex?: number
    price: number
    normalizedHeight: number
  }>
  ticks?: Array<{
    tickIndex: number
    price: string
    initialized: boolean
  }>
  currentPriceIndex: number
  priceSpacing: number
}

export interface FavoritePool {
  protocol: 'meteora' | 'orca'
  address: string
  name: string
  tokenXSymbol: string
  tokenYSymbol: string
  priceSpacing: number
  tvl?: number
  apr?: number
  addedAt: number
}

export interface LiquidityState {
  // Protocol filter
  selectedProtocol: LiquidityProtocol

  // Pools
  pools: UnifiedPool[]
  favorites: FavoritePool[]
  selectedPool: UnifiedPool | null
  selectedPoolPriceData: PriceData | null
  selectedPoolPriceDataLoading: boolean

  // Positions
  positions: UnifiedPosition[]
  positionStatuses: Record<string, PositionStatus>

  // Rebalancing
  rebalanceSuggestions: RebalanceSuggestion[]
  rebalanceSettings: RebalanceSettings | null

  // Monitor settings
  monitorSettings: MonitorSettings | null

  // UI state
  loading: boolean
  error: string | null
  sidecarHealth: {
    meteora: boolean
    orca: boolean
  }

  // Filters
  filters: {
    search: string
    minTvl: number | null
    minApr: number | null
  }
}

// Default favorites - pre-loaded pools
const defaultFavorites: FavoritePool[] = [
  {
    protocol: 'orca',
    address: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    name: 'SOL-USDC',
    tokenXSymbol: 'SOL',
    tokenYSymbol: 'USDC',
    priceSpacing: 4,  // tick spacing
    addedAt: Date.now(),
  },
]

const initialState: LiquidityState = {
  selectedProtocol: 'all',
  pools: [],
  favorites: defaultFavorites,
  selectedPool: null,
  selectedPoolPriceData: null,
  selectedPoolPriceDataLoading: false,
  positions: [],
  positionStatuses: {},
  rebalanceSuggestions: [],
  rebalanceSettings: null,
  monitorSettings: null,
  loading: false,
  error: null,
  sidecarHealth: {
    meteora: false,
    orca: false,
  },
  filters: {
    search: '',
    minTvl: null,
    minApr: null,
  },
}

const liquiditySlice = createSlice({
  name: 'liquidity',
  initialState,
  reducers: {
    // Protocol selection
    setSelectedProtocol: (state, action: PayloadAction<LiquidityProtocol>) => {
      state.selectedProtocol = action.payload
    },

    // Pools
    setPools: (state, action: PayloadAction<UnifiedPool[]>) => {
      state.pools = action.payload
      state.loading = false
      state.error = null
    },

    // Favorites
    setFavorites: (state, action: PayloadAction<FavoritePool[]>) => {
      state.favorites = action.payload
    },

    addFavorite: (state, action: PayloadAction<FavoritePool>) => {
      if (!state.favorites.find((f) => f.address === action.payload.address)) {
        state.favorites = [action.payload, ...state.favorites]
      }
    },

    removeFavorite: (state, action: PayloadAction<string>) => {
      state.favorites = state.favorites.filter((f) => f.address !== action.payload)
    },

    setSelectedPool: (state, action: PayloadAction<UnifiedPool | null>) => {
      state.selectedPool = action.payload
      state.selectedPoolPriceData = null
    },

    setSelectedPoolPriceData: (state, action: PayloadAction<PriceData | null>) => {
      state.selectedPoolPriceData = action.payload
      state.selectedPoolPriceDataLoading = false
    },

    setSelectedPoolPriceDataLoading: (state, action: PayloadAction<boolean>) => {
      state.selectedPoolPriceDataLoading = action.payload
    },

    // Positions
    setPositions: (state, action: PayloadAction<UnifiedPosition[]>) => {
      state.positions = action.payload
    },

    addPosition: (state, action: PayloadAction<UnifiedPosition>) => {
      state.positions = [action.payload, ...state.positions]
    },

    updatePosition: (state, action: PayloadAction<{ pubkey: string; updates: Partial<UnifiedPosition> }>) => {
      const index = state.positions.findIndex((p) => p.positionPubkey === action.payload.pubkey)
      if (index !== -1) {
        state.positions[index] = { ...state.positions[index], ...action.payload.updates }
      }
    },

    removePosition: (state, action: PayloadAction<string>) => {
      state.positions = state.positions.filter((p) => p.positionPubkey !== action.payload)
    },

    // Rebalancing
    setRebalanceSuggestions: (state, action: PayloadAction<RebalanceSuggestion[]>) => {
      state.rebalanceSuggestions = action.payload
    },

    addRebalanceSuggestion: (state, action: PayloadAction<RebalanceSuggestion>) => {
      const exists = state.rebalanceSuggestions.find(
        (s) => s.positionPubkey === action.payload.positionPubkey
      )
      if (!exists) {
        state.rebalanceSuggestions = [action.payload, ...state.rebalanceSuggestions].slice(0, 20)
      }
    },

    removeRebalanceSuggestion: (state, action: PayloadAction<string>) => {
      state.rebalanceSuggestions = state.rebalanceSuggestions.filter(
        (s) => s.positionPubkey !== action.payload
      )
    },

    setRebalanceSettings: (state, action: PayloadAction<RebalanceSettings>) => {
      state.rebalanceSettings = action.payload
    },

    // Monitor settings
    setMonitorSettings: (state, action: PayloadAction<MonitorSettings>) => {
      state.monitorSettings = action.payload
    },

    // Position status updates
    updatePositionStatus: (state, action: PayloadAction<PositionStatus>) => {
      state.positionStatuses[action.payload.positionPubkey] = action.payload
    },

    clearPositionStatuses: (state) => {
      state.positionStatuses = {}
    },

    // UI state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.loading = false
    },

    setSidecarHealth: (state, action: PayloadAction<{ meteora: boolean; orca: boolean }>) => {
      state.sidecarHealth = action.payload
    },

    // Filters
    setFilters: (state, action: PayloadAction<Partial<LiquidityState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },

    clearFilters: (state) => {
      state.filters = initialState.filters
    },
  },
})

export const {
  setSelectedProtocol,
  setPools,
  setFavorites,
  addFavorite,
  removeFavorite,
  setSelectedPool,
  setSelectedPoolPriceData,
  setSelectedPoolPriceDataLoading,
  setPositions,
  addPosition,
  updatePosition,
  removePosition,
  setRebalanceSuggestions,
  addRebalanceSuggestion,
  removeRebalanceSuggestion,
  setRebalanceSettings,
  setMonitorSettings,
  updatePositionStatus,
  clearPositionStatuses,
  setLoading,
  setError,
  setSidecarHealth,
  setFilters,
  clearFilters,
} = liquiditySlice.actions

export default liquiditySlice.reducer
