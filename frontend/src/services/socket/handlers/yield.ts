import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { setOpportunities, setPositions } from '@/features/yield/yieldSlice'

export function setupYieldHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    socket.emit('request_opportunities')
  })

  socket.on('opportunities_update', (data: { opportunities: unknown[] }) => {
    appStore.dispatch(setOpportunities(data.opportunities as never[]))
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
}
