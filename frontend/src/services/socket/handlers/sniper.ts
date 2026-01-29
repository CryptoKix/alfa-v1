import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { setTrackedTokens, addTrackedToken } from '@/features/sniper/sniperSlice'

export function setupSniperHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    socket.emit('request_tracked')
  })

  socket.on('new_token_detected', (data: {
    mint: string
    symbol: string
    name: string
    pool_address: string
    dex_id: string
    initial_liquidity: number
    is_rug: boolean
    socials_json: string
    detected_at: string
    status: string
  }) => {
    appStore.dispatch(addTrackedToken(data))
  })

  socket.on('tracked_update', (data: { tokens: unknown[] }) => {
    appStore.dispatch(setTrackedTokens(data.tokens as never[]))
  })
}
