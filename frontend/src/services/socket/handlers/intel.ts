import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { setNews } from '@/features/intel/intelSlice'

export function setupIntelHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    socket.emit('request_news')
  })

  socket.on('news_update', (data: { news: unknown[] }) => {
    appStore.dispatch(setNews(data.news as never[]))
  })
}
