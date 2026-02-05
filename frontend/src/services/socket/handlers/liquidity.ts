import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import {
  setPools,
  setPositions,
  addRebalanceSuggestion,
  removeRebalanceSuggestion,
  setRebalanceSettings,
  setMonitorSettings,
  updatePositionStatus,
  setSidecarHealth,
  type UnifiedPool,
  type UnifiedPosition,
  type RebalanceSuggestion,
  type RebalanceSettings,
  type MonitorSettings,
  type PositionStatus,
} from '@/features/liquidity/liquiditySlice'

export function setupLiquidityHandler(socket: Socket, store: AppStore): void {
  // Pool updates
  socket.on('pools_update', (data: { pools: UnifiedPool[]; timestamp: number }) => {
    console.log('[Liquidity] Received pools_update:', data.pools?.length || 0, 'pools')
    if (data.pools) {
      store.dispatch(setPools(data.pools))
    }
  })

  // Position updates
  socket.on('positions_update', (data: { positions: UnifiedPosition[]; timestamp: number }) => {
    console.log('[Liquidity] Received positions_update:', data.positions?.length || 0, 'positions')
    if (data.positions) {
      store.dispatch(setPositions(data.positions))
    }
  })

  // Position created
  socket.on('position_created', (data: { protocol: string; position_pubkey: string; pool_address: string; timestamp: number }) => {
    console.log('[Liquidity] Position created:', data.position_pubkey)
    // Request updated positions
    socket.emit('request_positions', { wallet: store.getState().wallet.activeWallet })
  })

  // Position closed
  socket.on('position_closed', (data: { position_pubkey: string; timestamp: number }) => {
    console.log('[Liquidity] Position closed:', data.position_pubkey)
    // Request updated positions
    socket.emit('request_positions', { wallet: store.getState().wallet.activeWallet })
  })

  // Rebalance suggestion
  socket.on('rebalance_suggestion', (data: RebalanceSuggestion) => {
    console.log('[Liquidity] Rebalance suggestion:', data.positionPubkey, data.reason)
    store.dispatch(addRebalanceSuggestion(data))
  })

  // Rebalance suggestions update
  socket.on('rebalance_suggestions_update', (data: { suggestions: RebalanceSuggestion[]; timestamp: number }) => {
    console.log('[Liquidity] Rebalance suggestions update:', data.suggestions?.length || 0)
    // Replace all suggestions
    data.suggestions?.forEach((s) => store.dispatch(addRebalanceSuggestion(s)))
  })

  // Rebalance started
  socket.on('rebalance_started', (data: { position_pubkey: string; timestamp: number }) => {
    console.log('[Liquidity] Rebalance started:', data.position_pubkey)
  })

  // Rebalance completed
  socket.on('rebalance_completed', (data: {
    oldPositionPubkey: string
    newPositionPubkey: string
    closeSignature?: string
    openSignature?: string
    timestamp: number
  }) => {
    console.log('[Liquidity] Rebalance completed:', data.oldPositionPubkey, '->', data.newPositionPubkey)
    store.dispatch(removeRebalanceSuggestion(data.oldPositionPubkey))
    // Request updated positions
    socket.emit('request_positions', { wallet: store.getState().wallet.activeWallet })
  })

  // Rebalance failed
  socket.on('rebalance_failed', (data: { position_pubkey: string; error: string; timestamp: number }) => {
    console.error('[Liquidity] Rebalance failed:', data.position_pubkey, data.error)
  })

  // Settings updated
  socket.on('settings_update', (data: RebalanceSettings) => {
    console.log('[Liquidity] Settings update')
    store.dispatch(setRebalanceSettings(data))
  })

  // Monitor settings updated
  socket.on('monitor_settings_update', (data: MonitorSettings) => {
    console.log('[Liquidity] Monitor settings update')
    store.dispatch(setMonitorSettings(data))
  })

  // Position status update from monitor
  socket.on('position_status', (data: PositionStatus) => {
    console.log('[Liquidity] Position status:', data.positionPubkey, data.urgency, data.reason)
    store.dispatch(updatePositionStatus(data))
  })

  // Health check
  socket.on('health_update', (data: { meteora: boolean; orca: boolean }) => {
    store.dispatch(setSidecarHealth(data))
  })

  // Connection events
  socket.on('connect', () => {
    console.log('[Liquidity] Socket connected')
    // Request initial data
    socket.emit('request_pools', {})
    const wallet = store.getState().wallet.activeWallet
    if (wallet) {
      socket.emit('request_positions', { wallet })
      socket.emit('request_rebalance_suggestions', { wallet })
    }
  })

  socket.on('disconnect', () => {
    console.log('[Liquidity] Socket disconnected')
  })
}
