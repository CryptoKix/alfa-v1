import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { updatePortfolio, updateHistory, setWebConnection } from '@/features/portfolio/portfolioSlice'
import { socketManager } from '../SocketManager'

export function setupPortfolioHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    appStore.dispatch(setWebConnection(true))
    socket.emit('request_balance')

    // Set up 30s balance poll interval
    socketManager.setInterval('balance-poll', () => {
      socket.emit('request_balance')
    }, 30000)
  })

  socket.on('disconnect', () => {
    appStore.dispatch(setWebConnection(false))
    socketManager.clearInterval('balance-poll')
  })

  socket.on('connect_error', () => {
    appStore.dispatch(setWebConnection(false))
  })

  socket.on('balance_update', (data: {
    total_usd: number
    total_usd_24h_ago?: number
    holdings: Array<{
      symbol: string
      mint: string
      balance: number
      price: number
      value: number
      logo_uri?: string
    }>
    holdings_24h_ago?: Array<{
      symbol: string
      mint: string
      balance: number
      price: number
      value: number
      logo_uri?: string
    }>
    wallet?: string
    wallet_alias?: string
  }) => {
    appStore.dispatch(updatePortfolio(data))
  })
}

export function setupHistoryHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    const state = appStore.getState()
    socket.emit('request_history', {
      wallet: state.portfolio.wallet !== '0x...' ? state.portfolio.wallet : null
    })
  })

  socket.on('history_update', (data: { history: unknown[] }) => {
    appStore.dispatch(updateHistory(data.history as never[]))
  })
}
