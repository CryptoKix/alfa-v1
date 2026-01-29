import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import {
  setPools,
  setPositions,
  setDetectedPools,
  addDetectedPool,
  setSniperSettings,
  addRebalanceSuggestion
} from '@/features/dlmm/dlmmSlice'

export function setupDLMMHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    socket.emit('request_pools')
    socket.emit('request_detected_pools')
  })

  socket.on('pools_update', (data: { pools: unknown[] }) => {
    appStore.dispatch(setPools(data.pools as never[]))
  })

  socket.on('positions_update', (data: { positions: unknown[] }) => {
    appStore.dispatch(setPositions(data.positions as never[]))
  })

  socket.on('position_update', (data: { action: string; wallet: string }) => {
    // Trigger a refresh of positions
    const state = appStore.getState()
    const wallet = state.wallet.browserWalletAddress
    if (wallet && data.wallet === wallet) {
      socket.emit('request_positions', { wallet })
    }
  })

  socket.on('detected_pools_update', (data: { pools: unknown[] }) => {
    appStore.dispatch(setDetectedPools(data.pools as never[]))
  })

  socket.on('dlmm_pool_detected', (data: {
    pool_address: string
    token_x_mint?: string
    token_y_mint?: string
    token_x_symbol?: string
    token_y_symbol?: string
    bin_step: number
    base_fee_bps: number
    initial_price: number
    detected_signature: string
    detected_at: string
    sniped: boolean
    status: string
  }) => {
    appStore.dispatch(addDetectedPool(data as never))
  })

  socket.on('sniper_settings_update', (data: { settings: unknown }) => {
    appStore.dispatch(setSniperSettings(data.settings as never))
  })

  socket.on('rebalance_suggestion', (data: { position_pubkey: string; reason: string }) => {
    appStore.dispatch(addRebalanceSuggestion({
      position_pubkey: data.position_pubkey,
      reason: data.reason,
      timestamp: Date.now()
    }))
  })
}
