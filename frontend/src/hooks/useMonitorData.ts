import { useEffect } from 'react'
import { create } from 'zustand'

// ─── Types ──────────────────────────────────────────────────────────

export interface SystemService {
  id: string
  name: string
  description: string
  port: number | null
  status: 'running' | 'stopped' | 'error' | 'unknown'
  last_log: string
  log_file: string
}

export interface TradingModule {
  name: string
  description: string
  running: boolean
  initialized: boolean
  icon?: string
  color?: string
  error?: string
}

export interface BlockhashStats {
  blockhash: string | null
  slot: number
  last_valid_block_height: number
  age_ms: number
  fetch_count: number
  cache_hits: number
  hit_rate: string
  grpc_active: boolean
  grpc_slot_updates: number
}

export interface ShyftStats {
  is_running: boolean
  geyser_connected: boolean
  rabbit_connected: boolean
  geyser_updates: number
  rabbit_updates: number
  geyser_errors: number
  rabbit_errors: number
  geyser_age_ms: number | null
  rabbit_age_ms: number | null
  slot_subs: string[]
  account_subs: string[]
  program_subs: string[]
  tx_subs: string[]
}

export interface SidecarHealth {
  status: 'running' | 'stopped' | 'error' | 'unknown'
  response_ms: number | null
  port: number
  checked_at: number
}

export interface MonitorData {
  systemServices: SystemService[]
  tradingModules: Record<string, TradingModule>
  blockhash: BlockhashStats | null
  shyft: ShyftStats | null
  sidecars: Record<string, SidecarHealth>
  timestamp: number
  loading: boolean
  error: string | null
}

interface MonitorStore extends MonitorData {
  _subscribers: number
  _intervalId: ReturnType<typeof setInterval> | null
  _subscribe: () => () => void
  refresh: () => Promise<void>
  refreshAfterToggle: () => Promise<void>
}

// ─── Store ──────────────────────────────────────────────────────────

const POLL_INTERVAL = 5000

export const useMonitorStore = create<MonitorStore>()((set, get) => ({
  systemServices: [],
  tradingModules: {},
  blockhash: null,
  shyft: null,
  sidecars: {},
  timestamp: 0,
  loading: true,
  error: null,

  _subscribers: 0,
  _intervalId: null,

  refresh: async () => {
    try {
      const res = await window.fetch('/api/services/monitor')
      const data = await res.json()
      set({
        systemServices: data.system_services ?? [],
        tradingModules: data.trading_modules ?? {},
        blockhash: data.blockhash && Object.keys(data.blockhash).length ? data.blockhash : null,
        shyft: data.shyft && Object.keys(data.shyft).length ? data.shyft : null,
        sidecars: data.sidecars ?? {},
        timestamp: data.timestamp ?? Date.now() / 1000,
        loading: false,
        error: null,
      })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  refreshAfterToggle: async () => {
    await new Promise(r => setTimeout(r, 300))
    return get().refresh()
  },

  _subscribe: () => {
    const state = get()
    const newCount = state._subscribers + 1

    if (newCount === 1) {
      // Data already pre-fetched eagerly — just start the polling interval
      if (state.loading) state.refresh()
      const id = setInterval(() => get().refresh(), POLL_INTERVAL)
      set({ _subscribers: newCount, _intervalId: id })
    } else {
      set({ _subscribers: newCount })
    }

    return () => {
      const s = get()
      const next = s._subscribers - 1
      if (next <= 0 && s._intervalId) {
        clearInterval(s._intervalId)
        set({ _subscribers: 0, _intervalId: null })
      } else {
        set({ _subscribers: next })
      }
    }
  },
}))

// Eager pre-fetch: fire immediately on import so data is ready before the page mounts
useMonitorStore.getState().refresh()

/**
 * Hook that auto-subscribes on mount and unsubscribes on unmount.
 * Multiple widgets share one polling timer via reference counting.
 */
export function useMonitorSubscription() {
  const subscribe = useMonitorStore(s => s._subscribe)
  useEffect(() => subscribe(), [subscribe])
}
