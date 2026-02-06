import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import {
  setTrackedTokens, addTrackedToken, setSnipePositions,
  setSniperStatus, syncSettings,
  setHftPositions, updateHftPosition, removeHftPosition,
} from '@/features/sniper/sniperSlice'
import type { SnipedToken, SnipePosition, SniperSettings, HftPosition } from '@/features/sniper/sniperSlice'

export function setupSniperHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    socket.emit('request_tracked')
    socket.emit('request_snipe_positions')
    socket.emit('request_sniper_status')
    socket.emit('request_hft_positions')
  })

  socket.on('new_token_detected', (data: SnipedToken) => {
    appStore.dispatch(addTrackedToken(data))
  })

  socket.on('tracked_update', (data: { tokens: SnipedToken[] }) => {
    appStore.dispatch(setTrackedTokens(data.tokens))
  })

  // Armed/detecting status from backend
  socket.on('sniper_status', (data: { armed: boolean; detecting: boolean }) => {
    appStore.dispatch(setSniperStatus(data))
  })

  // Full settings sync from backend (on connect)
  socket.on('sniper_settings_sync', (data: Partial<SniperSettings>) => {
    appStore.dispatch(syncSettings(data))
  })

  socket.on('snipe_positions_update', (data: { positions: SnipePosition[] }) => {
    appStore.dispatch(setSnipePositions(data.positions))
  })

  // After a successful snipe, refresh positions
  socket.on('snipe_result', () => {
    socket.emit('request_snipe_positions')
  })

  // Sell result — refresh positions on completion
  socket.on('sell_result', (data: { success: boolean; status?: string; symbol?: string; error?: string }) => {
    if (data.success && data.status !== 'pending') {
      socket.emit('request_snipe_positions')
    }
  })

  // HFT position events
  socket.on('hft_positions_update', (data: { positions: HftPosition[] }) => {
    appStore.dispatch(setHftPositions(data.positions))
  })

  socket.on('hft_position_opened', (data: HftPosition) => {
    appStore.dispatch(updateHftPosition(data))
  })

  socket.on('hft_position_update', (data: HftPosition) => {
    if (data.status === 'sold' || data.status === 'error') {
      appStore.dispatch(removeHftPosition(data.mint))
    } else {
      appStore.dispatch(updateHftPosition(data))
    }
  })
}
