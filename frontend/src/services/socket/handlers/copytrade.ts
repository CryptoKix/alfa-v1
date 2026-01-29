import type { Socket } from 'socket.io-client'
import type { AppStore } from '@/app/store'
import { setTargets, addSignal, setSignals } from '@/features/copytrade/copytradeSlice'
import { addNotification } from '@/features/notifications/notificationsSlice'

export function setupCopytradeHandler(socket: Socket, appStore: AppStore): void {
  socket.on('connect', () => {
    socket.emit('request_targets')
    socket.emit('request_signals')
  })

  socket.on('targets_update', (data: { targets: unknown[] }) => {
    appStore.dispatch(setTargets(data.targets as never[]))
  })

  socket.on('signals_update', (data: { targets: unknown[]; signals: unknown[] }) => {
    appStore.dispatch(setTargets(data.targets as never[]))
    appStore.dispatch(setSignals(data.signals as never[]))
  })

  socket.on('signal_detected', (data: {
    alias?: string
    wallet?: string
    received?: { symbol: string; amount: number }
    sent?: { symbol: string; amount: number }
  }) => {
    appStore.dispatch(addSignal(data as never))

    const alias = data.alias || data.wallet?.slice(0, 8) || 'Whale'
    const recvAsset = data.received?.symbol || 'Asset'
    const recvAmount = data.received?.amount !== undefined ? data.received.amount.toFixed(2) : '0.00'
    const sentAsset = data.sent?.symbol || 'Asset'
    const sentAmount = data.sent?.amount !== undefined ? data.sent.amount.toFixed(2) : '0.00'

    appStore.dispatch(addNotification({
      title: `${alias} Activity`,
      message: `Detected whale swap: ${sentAmount} ${sentAsset} -> ${recvAmount} ${recvAsset}`,
      type: 'signal'
    }))
  })
}
