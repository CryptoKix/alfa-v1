import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface TokenHolding {
  symbol: string
  mint: string
  balance: number
  price: number
  value: number
  logoURI?: string
}

export interface Trade {
  id: number
  timestamp: string
  source: string
  input: string
  output: string
  amount_in: number
  amount_out: number
  usd_value: number
  status: string
  signature: string
  priority_fee?: number
  swap_fee?: number
  swap_fee_currency?: string
  slippage_bps?: number
}

export interface PortfolioSnapshot {
  id: number
  timestamp: string
  total_value_usd: number
  wallet_address: string
}

export interface UserWallet {
  address: string
  alias: string
  totalUsd: number
  holdings: TokenHolding[]
}

export interface PortfolioState {
  holdings: TokenHolding[]
  holdings24hAgo: TokenHolding[]
  history: Trade[]
  snapshots: PortfolioSnapshot[]
  totalUsd: number
  totalUsd24hAgo: number
  wallet: string
  walletAlias: string
  loading: boolean
  connected: boolean
  wallets: UserWallet[]
  selectedWallet: string | null
}

const initialState: PortfolioState = {
  holdings: [],
  holdings24hAgo: [],
  history: [],
  snapshots: [],
  totalUsd: 0,
  totalUsd24hAgo: 0,
  wallet: '0x...',
  walletAlias: 'Loading...',
  loading: false,
  connected: false,
  wallets: [],
  selectedWallet: null,
}

export const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    setWebConnection: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload
    },
    setSnapshots: (state, action: PayloadAction<PortfolioSnapshot[]>) => {
      state.snapshots = action.payload
    },
    updatePortfolio: (state, action: PayloadAction<{ total_usd: number; total_usd_24h_ago?: number; holdings: any[]; holdings_24h_ago?: any[]; wallet?: string; wallet_alias?: string }>) => {
      state.totalUsd = action.payload.total_usd
      if (action.payload.total_usd_24h_ago !== undefined) {
        state.totalUsd24hAgo = action.payload.total_usd_24h_ago
      }
      
      // Map holdings to include logoURI
      state.holdings = action.payload.holdings.map(h => ({
        ...h,
        logoURI: h.logo_uri
      }))
      
      if (action.payload.holdings_24h_ago) {
        state.holdings24hAgo = action.payload.holdings_24h_ago.map(h => ({
          ...h,
          logoURI: h.logo_uri
        }))
      }
      if (action.payload.wallet) state.wallet = action.payload.wallet
      if (action.payload.wallet_alias) state.walletAlias = action.payload.wallet_alias
    },
    updateHistory: (state, action: PayloadAction<Trade[]>) => {
      state.history = action.payload
    },
    setWallets: (state, action: PayloadAction<UserWallet[]>) => {
      state.wallets = action.payload
    },
    setSelectedWallet: (state, action: PayloadAction<string | null>) => {
      state.selectedWallet = action.payload
    },
    updatePortfolioForWallet: (state, action: PayloadAction<{ address: string; totalUsd: number; holdings: TokenHolding[] }>) => {
      const idx = state.wallets.findIndex(w => w.address === action.payload.address)
      if (idx !== -1) {
        state.wallets[idx].totalUsd = action.payload.totalUsd
        state.wallets[idx].holdings = action.payload.holdings
      }
      // If this is the currently selected wallet, also update main state
      if (state.selectedWallet === action.payload.address || state.wallet === action.payload.address) {
        state.totalUsd = action.payload.totalUsd
        state.holdings = action.payload.holdings
      }
    },
  },
})

export const { updatePortfolio, updateHistory, setWebConnection, setSnapshots, setWallets, setSelectedWallet, updatePortfolioForWallet } = portfolioSlice.actions
export default portfolioSlice.reducer
