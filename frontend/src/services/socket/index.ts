import axios from 'axios'
import { socketManager, type SocketNamespace } from './SocketManager'
import { store } from '@/app/store'
import { updateBots } from '@/features/bots/botsSlice'
import { setPools } from '@/features/dlmm/dlmmSlice'

// Import handlers
import { setupPortfolioHandler, setupHistoryHandler } from './handlers/portfolio'
import { setupPricesHandler } from './handlers/prices'
import { setupBotsHandler } from './handlers/bots'
import { setupCopytradeHandler } from './handlers/copytrade'
import { setupArbHandler } from './handlers/arb'
import { setupSniperHandler } from './handlers/sniper'
import { setupIntelHandler } from './handlers/intel'
import { setupYieldHandler } from './handlers/yield'
import { setupDLMMHandler } from './handlers/dlmm'
import { setupLiquidityHandler } from './handlers/liquidity'

// Set the store reference
socketManager.setStore(store)

// Register all handlers
socketManager.registerHandler('portfolio', setupPortfolioHandler)
socketManager.registerHandler('history', setupHistoryHandler)
socketManager.registerHandler('prices', setupPricesHandler)
socketManager.registerHandler('bots', setupBotsHandler)
socketManager.registerHandler('copytrade', setupCopytradeHandler)
socketManager.registerHandler('arb', setupArbHandler)
socketManager.registerHandler('sniper', setupSniperHandler)
socketManager.registerHandler('intel', setupIntelHandler)
socketManager.registerHandler('yield', setupYieldHandler)
socketManager.registerHandler('dlmm', setupDLMMHandler)
socketManager.registerHandler('liquidity', setupLiquidityHandler)

/**
 * Initialize all socket connections
 */
export function initSockets(): void {
  console.log('[Socket] Initializing all socket connections...')

  // Connect to all namespaces
  const namespaces: SocketNamespace[] = [
    'portfolio',
    'prices',
    'history',
    'bots',
    'copytrade',
    'arb',
    'sniper',
    'intel',
    'yield',
    'dlmm',
    'liquidity',
  ]

  for (const ns of namespaces) {
    socketManager.connect(ns)
  }

  // Initial fetch for bots (REST API)
  fetchInitialBots()

  // Initial fetch for DLMM pools (REST API)
  fetchInitialDLMMPools()
}

/**
 * Fetch initial bot data via REST API
 */
async function fetchInitialBots(): Promise<void> {
  try {
    const res = await axios.get('/api/dca/list')
    store.dispatch(updateBots(res.data))
  } catch (e) {
    console.error('[Socket] Initial bots fetch error:', e)
  }
}

/**
 * Fetch initial DLMM pools via REST API
 */
async function fetchInitialDLMMPools(): Promise<void> {
  try {
    const res = await axios.get('/api/dlmm/pools')
    if (res.data.success && res.data.pools) {
      store.dispatch(setPools(res.data.pools))
    }
  } catch (e) {
    console.error('[Socket] Initial DLMM pools fetch error:', e)
  }
}

/**
 * Disconnect all sockets (for cleanup)
 */
export function disconnectSockets(): void {
  socketManager.disconnectAll()
}

// Re-export for convenience
export { socketManager }
export type { SocketNamespace } from './SocketManager'
