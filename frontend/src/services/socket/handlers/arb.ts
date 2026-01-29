import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { addOpportunity, updateMatrix, clearMatrix } from '@/features/arb/arbSlice'
import { socketManager } from '../SocketManager'

export function setupArbHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    // Set up ping interval to keep arb engine active
    socketManager.setInterval('arb-ping', () => {
      socket.emit('ping_arb')
    }, 5000)
  })

  socket.on('disconnect', () => {
    socketManager.clearInterval('arb-ping')
  })

  socket.on('arb_opportunity', (data: {
    input_mint: string
    output_mint: string
    input_symbol: string
    output_symbol: string
    best_venue: string
    worst_venue: string
    best_amount: number
    worst_amount: number
    spread_pct: number
    gross_profit_usd: number
    net_profit_usd: number
    timestamp: number
    input_amount: number
  }) => {
    appStore.dispatch(addOpportunity(data))
  })

  socket.on('price_matrix_update', (data: {
    input_symbol: string
    output_symbol: string
    venues: Record<string, number>
    id?: string
  }) => {
    appStore.dispatch(updateMatrix({
      pair: `${data.input_symbol}/${data.output_symbol}`,
      venues: data.venues,
      id: data.id
    }))
  })

  socket.on('matrix_clear', () => {
    appStore.dispatch(clearMatrix())
  })
}
