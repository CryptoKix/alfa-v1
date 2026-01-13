import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface GridLevel {
  price: number
  has_position: boolean
  token_amount: number
}

export interface Bot {
  id: string
  type: string
  status: string
  input_mint: string
  output_mint: string
  input_symbol: string
  output_symbol: string
  created_at: string
  last_run: string | null
  // Strategy specific fields (optional as they depend on type)
  lower_bound?: number
  upper_bound?: number
  steps?: number
  profit_realized?: number
  run_count?: number
  amount?: number
  max_runs?: number
  phase?: string
  avg_buy_price?: number
  total_bought?: number
  grid_levels?: GridLevel[]
}

export interface BotsState {
  bots: Bot[]
  loading: boolean
}

const initialState: BotsState = {
  bots: [],
  loading: false,
}

export const botsSlice = createSlice({
  name: 'bots',
  initialState,
  reducers: {
    updateBots: (state, action: PayloadAction<Bot[]>) => {
      state.bots = action.payload
      state.loading = false
    },
    setBotsLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    }
  },
})

export const { updateBots, setBotsLoading } = botsSlice.actions
export default botsSlice.reducer
