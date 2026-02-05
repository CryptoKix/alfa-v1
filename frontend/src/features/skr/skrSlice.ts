import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// ─── Interfaces ─────────────────────────────────────────────────────────

export interface StakingEvent {
  id: number
  signature: string
  event_type: 'stake' | 'unstake'
  wallet_address: string
  amount: number
  guardian: string | null
  slot: number
  block_time: number
  detected_at: string
  display_name?: string
}

export interface StakingSnapshot {
  id: number
  timestamp: string
  total_staked: number
  total_stakers: number
  net_change_since_last: number
}

export interface WhaleEntry {
  wallet_address: string
  total_staked: number
  total_unstaked: number
  net_staked: number
  event_count: number
  last_activity: number
  display_name?: string
}

export type ChartPeriod = '4h' | '24h' | '7d' | '30d'

export interface SKRState {
  totalStaked: number
  totalStakers: number
  supplyPctStaked: number

  events: StakingEvent[]
  eventsLoading: boolean

  snapshots: StakingSnapshot[]
  snapshotsLoading: boolean
  chartPeriod: ChartPeriod

  whales: WhaleEntry[]
  whalesLoading: boolean

  serviceRunning: boolean
  connected: boolean
  error: string | null
}

// ─── Initial State ──────────────────────────────────────────────────────

const initialState: SKRState = {
  totalStaked: 0,
  totalStakers: 0,
  supplyPctStaked: 0,

  events: [],
  eventsLoading: false,

  snapshots: [],
  snapshotsLoading: false,
  chartPeriod: '7d',

  whales: [],
  whalesLoading: false,

  serviceRunning: false,
  connected: false,
  error: null,
}

// ─── Slice ──────────────────────────────────────────────────────────────

const skrSlice = createSlice({
  name: 'skr',
  initialState,
  reducers: {
    setStats: (state, action: PayloadAction<{ total_staked: number; total_stakers: number; supply_pct_staked?: number }>) => {
      state.totalStaked = action.payload.total_staked
      state.totalStakers = action.payload.total_stakers
      if (action.payload.supply_pct_staked !== undefined) {
        state.supplyPctStaked = action.payload.supply_pct_staked
      }
    },

    addEvent: (state, action: PayloadAction<StakingEvent>) => {
      state.events = [action.payload, ...state.events].slice(0, 200)
    },

    setEvents: (state, action: PayloadAction<StakingEvent[]>) => {
      state.events = action.payload
      state.eventsLoading = false
    },

    setSnapshots: (state, action: PayloadAction<StakingSnapshot[]>) => {
      state.snapshots = action.payload
      state.snapshotsLoading = false
    },

    setChartPeriod: (state, action: PayloadAction<ChartPeriod>) => {
      state.chartPeriod = action.payload
      state.snapshotsLoading = true
    },

    setWhales: (state, action: PayloadAction<WhaleEntry[]>) => {
      state.whales = action.payload
      state.whalesLoading = false
    },

    setServiceRunning: (state, action: PayloadAction<boolean>) => {
      state.serviceRunning = action.payload
    },

    setConnected: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload
    },

    setEventsLoading: (state, action: PayloadAction<boolean>) => {
      state.eventsLoading = action.payload
    },

    setSnapshotsLoading: (state, action: PayloadAction<boolean>) => {
      state.snapshotsLoading = action.payload
    },

    setWhalesLoading: (state, action: PayloadAction<boolean>) => {
      state.whalesLoading = action.payload
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
  },
})

export const {
  setStats,
  addEvent,
  setEvents,
  setSnapshots,
  setChartPeriod,
  setWhales,
  setServiceRunning,
  setConnected,
  setEventsLoading,
  setSnapshotsLoading,
  setWhalesLoading,
  setError,
} = skrSlice.actions

export default skrSlice.reducer
