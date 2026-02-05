import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import {
  setStats,
  addEvent,
  setEvents,
  setSnapshots,
  setWhales,
  setConnected,
  type StakingEvent,
  type StakingSnapshot,
  type WhaleEntry,
} from '@/features/skr/skrSlice'

export function setupSKRHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    appStore.dispatch(setConnected(true))
    // Request initial data
    socket.emit('request_stats')
    socket.emit('request_events', { limit: 100 })
    socket.emit('request_snapshots', { period: appStore.getState().skr.chartPeriod })
    socket.emit('request_whales', { limit: 50 })
  })

  socket.on('disconnect', () => {
    appStore.dispatch(setConnected(false))
  })

  socket.on('stats_update', (data: { total_staked: number; total_stakers: number; supply_pct_staked?: number }) => {
    appStore.dispatch(setStats(data))
  })

  socket.on('staking_event', (data: StakingEvent) => {
    appStore.dispatch(addEvent(data))
  })

  socket.on('events_update', (data: { events: StakingEvent[] }) => {
    appStore.dispatch(setEvents(data.events))
  })

  socket.on('snapshots_update', (data: { snapshots: StakingSnapshot[] }) => {
    appStore.dispatch(setSnapshots(data.snapshots))
  })

  socket.on('whales_update', (data: { whales: WhaleEntry[] }) => {
    appStore.dispatch(setWhales(data.whales))
  })
}
