import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { updatePrice, setPriceConnection } from '@/features/prices/pricesSlice'

export function setupPricesHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    appStore.dispatch(setPriceConnection(true))
  })

  socket.on('disconnect', () => {
    appStore.dispatch(setPriceConnection(false))
  })

  socket.on('connect_error', () => {
    appStore.dispatch(setPriceConnection(false))
  })

  socket.on('price_update', (data: { mint: string; price: number }) => {
    appStore.dispatch(updatePrice(data))
  })
}
