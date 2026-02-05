import { Bell, BellOff, CheckCircle, AlertCircle, Zap, Info } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { clearAll } from '@/features/notifications/notificationsSlice'
import { WidgetContainer } from './base/WidgetContainer'

const formatTime = (ts: number) => {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const getAlertType = (type: string) => {
  switch (type) {
    case 'success':
      return { label: 'Success', color: 'bg-accent-green/10 text-accent-green' }
    case 'error':
      return { label: 'Error', color: 'bg-accent-red/10 text-accent-red' }
    case 'signal':
      return { label: 'Signal', color: 'bg-accent-cyan/10 text-accent-cyan' }
    default:
      return { label: 'Info', color: 'bg-white/10 text-white/70' }
  }
}

export const AlertsWidget = () => {
  const dispatch = useAppDispatch()
  const { notifications } = useAppSelector(state => state.notifications)

  return (
    <WidgetContainer
      id="alerts"
      title="System Alerts"
      icon={<Bell className="w-4 h-4" />}
      badge={notifications.length > 0 ? `${notifications.length}` : undefined}
      noPadding
      actions={
        <button
          onClick={() => dispatch(clearAll())}
          className="text-[10px] uppercase tracking-wider text-white/40 hover:text-accent-cyan transition-colors font-semibold"
        >
          Clear
        </button>
      }
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[60px_55px_1fr] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div>Time</div>
          <div className="-ml-1.5">Type</div>
          <div>Message</div>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <BellOff size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">No active alerts</span>
          </div>
        ) : (
          notifications.map((alert) => {
            const alertType = getAlertType(alert.type)

            return (
              <div
                key={alert.id}
                className={cn(
                  'grid grid-cols-[60px_55px_1fr] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                  'hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
              >
                {/* Time */}
                <div className="text-[12px] text-white/50">
                  {formatTime(alert.timestamp)}
                </div>

                {/* Type */}
                <div className="-ml-1.5 flex items-center">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded leading-none', alertType.color)}>
                    {alertType.label}
                  </span>
                </div>

                {/* Message */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-semibold text-white truncate">{alert.title}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </WidgetContainer>
  )
}
