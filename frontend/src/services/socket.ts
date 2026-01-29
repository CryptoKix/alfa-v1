// Re-export from modular socket structure for backwards compatibility
export { initSockets, disconnectSockets, socketManager } from './socket/index'
export type { SocketNamespace } from './socket/SocketManager'

// Legacy exports for components that import individual sockets
// These are now managed by the SocketManager
export const portfolioSocket = () => socketManager.getSocket('portfolio')
export const priceSocket = () => socketManager.getSocket('prices')
export const historySocket = () => socketManager.getSocket('history')
export const botsSocket = () => socketManager.getSocket('bots')
export const copytradeSocket = () => socketManager.getSocket('copytrade')
export const arbSocket = () => socketManager.getSocket('arb')
export const sniperSocket = () => socketManager.getSocket('sniper')
export const intelSocket = () => socketManager.getSocket('intel')
export const yieldSocket = () => socketManager.getSocket('yield')
export const dlmmSocket = () => socketManager.getSocket('dlmm')
export const liquiditySocket = () => socketManager.getSocket('liquidity')

import { socketManager } from './socket/index'
