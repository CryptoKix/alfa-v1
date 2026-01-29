import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type NewsCategory = 'crypto' | 'stocks' | 'forex' | 'macro'

export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  type: 'news' | 'social'
  category: NewsCategory
  published_at: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'urgent'
  is_relevant: boolean
  currencies?: string[]
  tickers?: string[]
}

export interface IntelState {
  news: NewsItem[]
  loading: boolean
}

const initialState: IntelState = {
  news: [],
  loading: false,
}

export const intelSlice = createSlice({
  name: 'intel',
  initialState,
  reducers: {
    setNews: (state, action: PayloadAction<NewsItem[]>) => {
      state.news = action.payload
      state.loading = false
    },
    addNewsItem: (state, action: PayloadAction<NewsItem>) => {
      if (!state.news.find(n => n.id === action.payload.id)) {
        state.news = [action.payload, ...state.news].slice(0, 50)
      }
    },
    setIntelLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    }
  },
})

export const { setNews, addNewsItem, setIntelLoading } = intelSlice.actions
export default intelSlice.reducer
