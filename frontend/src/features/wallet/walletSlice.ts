import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type WalletMode = 'server' | 'browser'

export interface SessionKeyInfo {
  sessionPubkey: string
  expiresAt: number
  permissions: {
    maxTradeSize?: number
    allowedTokens?: string[]
  }
}

export interface WalletState {
  mode: WalletMode
  browserWalletConnected: boolean
  browserWalletAddress: string | null
  serverWalletAddress: string | null
  sessionKeyActive: boolean
  sessionKeyInfo: SessionKeyInfo | null
  delegationPending: boolean
}

const initialState: WalletState = {
  mode: 'server',
  browserWalletConnected: false,
  browserWalletAddress: null,
  serverWalletAddress: null,
  sessionKeyActive: false,
  sessionKeyInfo: null,
  delegationPending: false,
}

export const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    setWalletMode: (state, action: PayloadAction<WalletMode>) => {
      state.mode = action.payload
    },
    setBrowserWalletConnected: (state, action: PayloadAction<{ connected: boolean; address: string | null }>) => {
      state.browserWalletConnected = action.payload.connected
      state.browserWalletAddress = action.payload.address
      if (!action.payload.connected) {
        state.sessionKeyActive = false
        state.sessionKeyInfo = null
      }
    },
    setServerWalletAddress: (state, action: PayloadAction<string>) => {
      state.serverWalletAddress = action.payload
    },
    setSessionKeyActive: (state, action: PayloadAction<{ active: boolean; info?: SessionKeyInfo }>) => {
      state.sessionKeyActive = action.payload.active
      state.sessionKeyInfo = action.payload.info || null
    },
    setDelegationPending: (state, action: PayloadAction<boolean>) => {
      state.delegationPending = action.payload
    },
    clearSessionKey: (state) => {
      state.sessionKeyActive = false
      state.sessionKeyInfo = null
    },
  },
})

export const {
  setWalletMode,
  setBrowserWalletConnected,
  setServerWalletAddress,
  setSessionKeyActive,
  setDelegationPending,
  clearSessionKey,
} = walletSlice.actions

export default walletSlice.reducer
