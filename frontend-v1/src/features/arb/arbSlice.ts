import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface ArbOpportunity {
  input_mint: string
  output_mint: string
  input_symbol: string
  output_symbol: string
  best_venue: string
  worst_venue: string
  best_amount: number
  worst_amount: number
  spread_pct: number
  gross_profit_usd: number
  net_profit_usd: number
  timestamp: number
  input_amount: number
}

export interface ArbState {
  opportunities: ArbOpportunity[]
  matrix: Record<string, { venues: Record<string, number>; id?: string }>
  isMonitoring: boolean
  minProfit: number
  jitoTip: number
  autoStrike: boolean
}

const initialState: ArbState = {
  opportunities: [],
  matrix: {},
  isMonitoring: true,
  minProfit: 0.1,
  jitoTip: 0.001,
  autoStrike: false
}

const arbSlice = createSlice({
  name: 'arb',
  initialState,
  reducers: {
    addOpportunity: (state, action: PayloadAction<ArbOpportunity>) => {
      state.opportunities = [action.payload, ...state.opportunities].slice(0, 50)
    },
    updateMatrix: (state, action: PayloadAction<{ pair: string; venues: Record<string, number>; id?: string }>) => {
      state.matrix[action.payload.pair] = {
        venues: action.payload.venues,
        id: action.payload.id
      }
    },
    clearMatrix: (state) => {
      state.matrix = {}
    },
    setArbConfig: (state, action: PayloadAction<Partial<ArbState>>) => {
      return { ...state, ...action.payload }
    },
    clearOpportunities: (state) => {
      state.opportunities = []
    }
  }
})

export const { addOpportunity, updateMatrix, clearMatrix, setArbConfig, clearOpportunities } = arbSlice.actions
export default arbSlice.reducer
