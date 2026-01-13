import { io } from 'socket.io-client'
import { store } from '../app/store'
import { updatePortfolio, updateHistory, setWebConnection } from '../features/portfolio/portfolioSlice'
import { updatePrice, setPriceConnection } from '../features/prices/pricesSlice'
import { updateBots } from '../features/bots/botsSlice'
import { setTargets, addSignal, setSignals } from '../features/copytrade/copytradeSlice'
import { addNotification } from '../features/notifications/notificationsSlice'

export const initSockets = () => {
  const portfolioSocket = io('/portfolio', { transports: ['websocket', 'polling'] })
  const priceSocket = io('/prices', { transports: ['websocket', 'polling'] })
  const historySocket = io('/history', { transports: ['websocket', 'polling'] })
  const botsSocket = io('/bots', { transports: ['websocket', 'polling'] })
  const copytradeSocket = io('/copytrade', { transports: ['websocket', 'polling'] })

  // Portfolio listeners
  portfolioSocket.on('connect_error', (err) => {
    console.error('[Socket] Portfolio Error:', err)
    store.dispatch(setWebConnection(false))
  })
  
  portfolioSocket.on('connect', () => {
    console.log('[Socket] Portfolio Connected')
    store.dispatch(setWebConnection(true))
    portfolioSocket.emit('request_balance')
  })

  portfolioSocket.on('disconnect', () => {
    store.dispatch(setWebConnection(false))
  })

  portfolioSocket.on('balance_update', (data) => {
    store.dispatch(updatePortfolio(data))
  })

  // Bots listeners
  botsSocket.on('connect', () => {
    console.log('[Socket] Bots Connected')
    botsSocket.emit('request_bots')
  })

  botsSocket.on('bots_update', (data) => {
    store.dispatch(updateBots(data.bots))
  })

  botsSocket.on('notification', (data: { title: string; message: string; type: any }) => {
    store.dispatch(addNotification({
      title: data.title,
      message: data.message,
      type: data.type || 'info'
    }))
  })

  // Copytrade listeners
  copytradeSocket.on('connect', () => {
    console.log('[Socket] Copytrade Connected')
    copytradeSocket.emit('request_targets')
    copytradeSocket.emit('request_signals')
  })

  copytradeSocket.on('targets_update', (data) => {
    store.dispatch(setTargets(data.targets))
  })

  copytradeSocket.on('signals_update', (data) => {
    store.dispatch(setSignals(data.signals))
  })

  copytradeSocket.on('signal_detected', (data) => {
    store.dispatch(addSignal(data))
    
    // Also create a notification for signals
    const asset = data.received?.symbol || 'Asset'
    const amount = data.received?.amount !== undefined ? data.received.amount.toFixed(2) : '0.00'
    store.dispatch(addNotification({
      title: 'Copy Trade Signal',
      message: `Detected whale swap: Received ${amount} ${asset}`,
      type: 'signal'
    }))
  })

  // History listeners
  historySocket.on('connect', () => {
    console.log('[Socket] History Connected')
    const state = store.getState()
    historySocket.emit('request_history', { wallet: state.portfolio.wallet !== '0x...' ? state.portfolio.wallet : null })
  })

  historySocket.on('history_update', (data) => {
    store.dispatch(updateHistory(data.history))
  })

  // Price listeners
  priceSocket.on('connect', () => {
    console.log('[Socket] Prices Connected')
    store.dispatch(setPriceConnection(true))
  })

  priceSocket.on('disconnect', () => {
    store.dispatch(setPriceConnection(false))
  })

  priceSocket.on('price_update', (data: { mint: string; price: number }) => {
    // console.log('[Socket] Price:', data.mint, data.price); 
    store.dispatch(updatePrice(data))
  })

  return { portfolioSocket, priceSocket, historySocket, botsSocket }
}