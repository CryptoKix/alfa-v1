import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface PricesState {
  prices: Record<string, number>
  lastUpdate: number
  connected: boolean
}

const initialState: PricesState = {
  prices: {},
  lastUpdate: 0,
  connected: false,
}

export const pricesSlice = createSlice({
  name: 'prices',
  initialState,
  reducers: {
    setPriceConnection: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload
    },
    updatePrice: (state, action: PayloadAction<{ mint: string; price: number }>) => {
      state.prices[action.payload.mint] = action.payload.price
      state.lastUpdate = Date.now()
    },
    updateBulkPrices: (state, action: PayloadAction<Record<string, number>>) => {
      state.prices = { ...state.prices, ...action.payload }
      state.lastUpdate = Date.now()
    },
  },
})

export const { updatePrice, updateBulkPrices, setPriceConnection } = pricesSlice.actions
export default pricesSlice.reducer
