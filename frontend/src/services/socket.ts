import { io } from 'socket.io-client'
import axios from 'axios'
import { store } from '../app/store'
import { updatePortfolio, updateHistory, setWebConnection } from '../features/portfolio/portfolioSlice'
import { updatePrice, setPriceConnection } from '../features/prices/pricesSlice'
import { updateBots } from '../features/bots/botsSlice'
import { setTargets, addSignal, setSignals } from '../features/copytrade/copytradeSlice'
import { addOpportunity, updateMatrix, clearMatrix } from '../features/arb/arbSlice'
import { addNotification } from '../features/notifications/notificationsSlice'

export let portfolioSocket: any
export let priceSocket: any
export let historySocket: any
export let botsSocket: any
export let copytradeSocket: any
export let arbSocket: any

export const initSockets = () => {
  portfolioSocket = io('/portfolio', { transports: ['websocket', 'polling'] })
  priceSocket = io('/prices', { transports: ['websocket', 'polling'] })
  historySocket = io('/history', { transports: ['websocket', 'polling'] })
  botsSocket = io('/bots', { transports: ['websocket', 'polling'] })
  copytradeSocket = io('/copytrade', { transports: ['websocket', 'polling'] })
  arbSocket = io('/arb', { transports: ['websocket', 'polling'] })
  
  console.log('[Socket] Initializing Arb Socket on namespace /arb')

  arbSocket.on('connect', () => {
    console.log('[Socket] Arb Connected | SID:', arbSocket.id)
    setInterval(() => arbSocket.emit('ping_arb'), 5000)
  })

  arbSocket.on('arb_opportunity', (data: any) => {
    store.dispatch(addOpportunity(data))
  })

  arbSocket.on('price_matrix_update', (data: any) => {
    store.dispatch(updateMatrix({ 
      pair: `${data.input_symbol}/${data.output_symbol}`, 
      venues: data.venues,
      id: data.id
    }))
  })

  arbSocket.on('matrix_clear', () => {
    store.dispatch(clearMatrix())
  })

  // Initial Fetch for Bots
  const fetchInitialBots = async () => {
    try {
      const res = await axios.get('/api/dca/list')
      store.dispatch(updateBots(res.data))
    } catch (e) {
      console.error('[Socket] Initial Bots Fetch Error:', e)
    }
  }
  fetchInitialBots()

  // Portfolio listeners
  portfolioSocket.on('connect_error', (err: any) => {
    console.error('[Socket] Portfolio Connection Error:', err)
    store.dispatch(setWebConnection(false))
  })
  
  portfolioSocket.on('connect', () => {
    console.log('[Socket] Portfolio Connected | SID:', portfolioSocket.id)
    store.dispatch(setWebConnection(true))
    portfolioSocket.emit('request_balance')
  })

  portfolioSocket.on('disconnect', (reason: any) => {
    console.warn('[Socket] Portfolio Disconnected:', reason)
    store.dispatch(setWebConnection(false))
  })

  portfolioSocket.on('balance_update', (data: any) => {
    store.dispatch(updatePortfolio(data))
  })

  // Bots listeners
  botsSocket.on('connect', () => {
    console.log('[Socket] Bots Connected | SID:', botsSocket.id)
    botsSocket.emit('request_bots')
  })

  botsSocket.on('bots_update', (data: any) => {
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
    console.log('[Socket] Copytrade Connected | SID:', copytradeSocket.id)
    copytradeSocket.emit('request_targets')
    copytradeSocket.emit('request_signals')
  })

  copytradeSocket.on('targets_update', (data: any) => {
    store.dispatch(setTargets(data.targets))
  })

  copytradeSocket.on('signals_update', (data: any) => {
    store.dispatch(setTargets(data.targets))
    store.dispatch(setSignals(data.signals))
  })

  copytradeSocket.on('signal_detected', (data: any) => {
    store.dispatch(addSignal(data))
    const alias = data.alias || data.wallet?.slice(0, 8) || 'Whale'
    const recvAsset = data.received?.symbol || 'Asset'
    const recvAmount = data.received?.amount !== undefined ? data.received.amount.toFixed(2) : '0.00'
    const sentAsset = data.sent?.symbol || 'Asset'
    const sentAmount = data.sent?.amount !== undefined ? data.sent.amount.toFixed(2) : '0.00'

    store.dispatch(addNotification({
      title: `${alias} Activity`,
      message: `Detected whale swap: ${sentAmount} ${sentAsset} → ${recvAmount} ${recvAsset}`,
      type: 'signal'
    }))
  })

  // History listeners
  historySocket.on('connect', () => {
    console.log('[Socket] History Connected | SID:', historySocket.id)
    const state = store.getState()
    historySocket.emit('request_history', { wallet: state.portfolio.wallet !== '0x...' ? state.portfolio.wallet : null })
  })

  historySocket.on('history_update', (data: any) => {
    store.dispatch(updateHistory(data.history))
  })

  // Price listeners
  priceSocket.on('connect', () => {
    console.log('[Socket] Prices Connected | SID:', priceSocket.id)
    store.dispatch(setPriceConnection(true))
  })

  priceSocket.on('connect_error', (err: any) => {
    console.error('[Socket] Prices Connection Error:', err)
    store.dispatch(setPriceConnection(false))
  })

  priceSocket.on('disconnect', (reason: any) => {
    console.warn('[Socket] Prices Disconnected:', reason)
    store.dispatch(setPriceConnection(false))
  })

  priceSocket.on('price_update', (data: { mint: string; price: number }) => {
    console.log('[Socket] Price Update:', data.mint, data.price); 
    store.dispatch(updatePrice(data))
  })

  return { portfolioSocket, priceSocket, historySocket, botsSocket, copytradeSocket, arbSocket }
}