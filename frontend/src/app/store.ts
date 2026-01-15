import { configureStore } from '@reduxjs/toolkit'
import portfolioReducer from '../features/portfolio/portfolioSlice'
import pricesReducer from '../features/prices/pricesSlice'
import botsReducer from '../features/bots/botsSlice'
import copytradeReducer from '../features/copytrade/copytradeSlice'
import arbReducer from '../features/arb/arbSlice'
import notificationsReducer from '../features/notifications/notificationsSlice'
import sniperReducer from '../features/sniper/sniperSlice'

export const store = configureStore({
  reducer: {
    portfolio: portfolioReducer,
    prices: pricesReducer,
    bots: botsReducer,
    copytrade: copytradeReducer,
    arb: arbReducer,
    notifications: notificationsReducer,
    sniper: sniperReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
