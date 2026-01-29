import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { updateBots } from '@/features/bots/botsSlice'
import { addNotification, clearAll } from '@/features/notifications/notificationsSlice'

export function setupBotsHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    socket.emit('request_bots')
  })

  socket.on('bots_update', (data: { bots: unknown[] }) => {
    appStore.dispatch(updateBots(data.bots as never[]))
  })

  socket.on('system_reset', () => {
    appStore.dispatch(clearAll())
  })

  socket.on('notification', (data: { title: string; message: string; type: 'success' | 'info' | 'error' | 'signal' }) => {
    appStore.dispatch(addNotification({
      title: data.title,
      message: data.message,
      type: data.type || 'info'
    }))
  })
}
