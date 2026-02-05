import {
  Bell,
  BellOff,
  AlertCircle,
  CheckCircle,
  Info,
  Activity,
  Trash2,
} from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { markAsRead, clearAll } from '@/features/notifications/notificationsSlice'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { Button } from '@/components/ui'

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
      return { label: 'Signal', color: 'bg-accent-pink/10 text-accent-pink' }
    default:
      return { label: 'Info', color: 'bg-accent-cyan/10 text-accent-cyan' }
  }
}

export function AlertsWidget() {
  const dispatch = useAppDispatch()
  const { notifications } = useAppSelector((state) => state.notifications)
  const unreadCount = notifications.filter((n) => !n.read).length

  const handleMarkAsRead = (id: string) => {
    dispatch(markAsRead(id))
  }

  const handleClearAll = () => {
    dispatch(clearAll())
  }

  return (
    <WidgetContainer
      id="alerts"
      title="Alerts"
      icon={<Bell className="w-4 h-4" />}
      badge={unreadCount > 0 ? `${unreadCount} new` : undefined}
      badgeVariant="pink"
      noPadding
      actions={
        notifications.length > 0 && (
          <Button variant="ghost" size="icon-sm" onClick={handleClearAll}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )
      }
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[60px_55px_1fr] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div>Time</div>
          <div className="-ml-1.5">Type</div>
          <div className="text-right">Message</div>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <BellOff size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">No alerts</span>
          </div>
        ) : (
          notifications.slice(0, 20).map((notification) => {
            const alertType = getAlertType(notification.type)

            return (
              <div
                key={notification.id}
                onClick={() => handleMarkAsRead(notification.id)}
                className={cn(
                  'grid grid-cols-[60px_55px_1fr] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                  'hover:bg-white/[0.04] hover:border-accent-cyan/30',
                  !notification.read && 'border-accent-cyan/20'
                )}
              >
                {/* Time */}
                <div className="text-[12px] text-white/50">
                  {formatTime(notification.timestamp)}
                </div>

                {/* Type */}
                <div className="-ml-1.5 flex items-center">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded leading-none', alertType.color)}>
                    {alertType.label}
                  </span>
                </div>

                {/* Message */}
                <div className="flex items-center justify-end gap-2 min-w-0">
                  {!notification.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan flex-shrink-0" />
                  )}
                  <span className="text-[12px] font-semibold text-white truncate">{notification.title}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </WidgetContainer>
  )
}
