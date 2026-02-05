import { io, Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'

// Socket namespaces
export type SocketNamespace =
  | 'portfolio'
  | 'prices'
  | 'history'
  | 'bots'
  | 'copytrade'
  | 'arb'
  | 'sniper'
  | 'intel'
  | 'yield'
  | 'dlmm'
  | 'liquidity'
  | 'skr'

export interface SocketConfig {
  transports: string[]
  reconnectionAttempts: number
  reconnectionDelay: number
}

export type SocketHandler = (socket: Socket, appStore: AppStore) => void

const DEFAULT_CONFIG: SocketConfig = {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
}

class SocketManager {
  private static instance: SocketManager
  private sockets: Map<SocketNamespace, Socket> = new Map()
  private handlers: Map<SocketNamespace, SocketHandler> = new Map()
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map()
  private appStore: AppStore | null = null

  private constructor() {}

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager()
    }
    return SocketManager.instance
  }

  /**
   * Set the Redux store reference
   */
  setStore(appStore: AppStore): void {
    this.appStore = appStore
  }

  /**
   * Register a handler for a namespace
   */
  registerHandler(
    namespace: SocketNamespace,
    handler: SocketHandler
  ): void {
    this.handlers.set(namespace, handler)
  }

  /**
   * Connect to a specific namespace
   */
  connect(namespace: SocketNamespace, config: Partial<SocketConfig> = {}): Socket {
    // Disconnect existing socket if any
    this.disconnect(namespace)

    const mergedConfig = { ...DEFAULT_CONFIG, ...config }
    const socket = io(`/${namespace}`, mergedConfig)

    this.sockets.set(namespace, socket)

    // Apply registered handler if exists
    const handler = this.handlers.get(namespace)
    if (handler && this.appStore) {
      handler(socket, this.appStore)
    }

    // Connection logging
    socket.on('connect', () => {
      console.log(`[Socket] ${namespace} connected | SID: ${socket.id}`)
    })

    socket.on('disconnect', (reason) => {
      console.warn(`[Socket] ${namespace} disconnected:`, reason)
    })

    socket.on('connect_error', (error) => {
      console.error(`[Socket] ${namespace} connection error:`, error.message)
    })

    return socket
  }

  /**
   * Disconnect from a specific namespace
   */
  disconnect(namespace: SocketNamespace): void {
    const socket = this.sockets.get(namespace)
    if (socket) {
      socket.disconnect()
      this.sockets.delete(namespace)
    }
  }

  /**
   * Disconnect from all namespaces
   */
  disconnectAll(): void {
    this.clearAllIntervals()
    for (const namespace of this.sockets.keys()) {
      this.disconnect(namespace)
    }
  }

  /**
   * Get a socket by namespace
   */
  getSocket(namespace: SocketNamespace): Socket | undefined {
    return this.sockets.get(namespace)
  }

  /**
   * Emit an event on a namespace
   */
  emit(namespace: SocketNamespace, event: string, ...args: unknown[]): void {
    const socket = this.sockets.get(namespace)
    if (socket?.connected) {
      socket.emit(event, ...args)
    }
  }

  /**
   * Set up an interval and track it for cleanup
   */
  setInterval(key: string, callback: () => void, ms: number): void {
    this.clearInterval(key)
    this.intervals.set(key, setInterval(callback, ms))
  }

  /**
   * Clear a specific interval
   */
  clearInterval(key: string): void {
    const interval = this.intervals.get(key)
    if (interval) {
      clearInterval(interval)
      this.intervals.delete(key)
    }
  }

  /**
   * Clear all intervals
   */
  clearAllIntervals(): void {
    for (const [key] of this.intervals) {
      this.clearInterval(key)
    }
  }

  /**
   * Check if a namespace is connected
   */
  isConnected(namespace: SocketNamespace): boolean {
    const socket = this.sockets.get(namespace)
    return socket?.connected ?? false
  }

  /**
   * Get connection status for all namespaces
   */
  getConnectionStatus(): Record<SocketNamespace, boolean> {
    const namespaces: SocketNamespace[] = [
      'portfolio', 'prices', 'history', 'bots', 'copytrade',
      'arb', 'sniper', 'intel', 'yield', 'dlmm', 'liquidity', 'skr'
    ]

    return namespaces.reduce((acc, ns) => {
      acc[ns] = this.isConnected(ns)
      return acc
    }, {} as Record<SocketNamespace, boolean>)
  }
}

export const socketManager = SocketManager.getInstance()
