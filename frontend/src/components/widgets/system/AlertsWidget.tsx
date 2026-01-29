import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  AlertCircle,
  CheckCircle,
  Info,
  Activity,
  Trash2,
} from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { markAsRead, clearAll } from '@/features/notifications/notificationsSlice'
import { cn, formatTimestamp } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { Button } from '@/components/ui'

const typeIcons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  signal: Activity,
}

const typeColors = {
  success: 'text-[var(--accent-green)] bg-[var(--accent-green)]/10',
  error: 'text-[var(--accent-red)] bg-[var(--accent-red)]/10',
  info: 'text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10',
  signal: 'text-[var(--accent-pink)] bg-[var(--accent-pink)]/10',
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
      <div className="h-full overflow-auto glass-scrollbar">
        <AnimatePresence>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-white/40">
              <Bell className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {notifications.slice(0, 20).map((notification, index) => {
                const Icon = typeIcons[notification.type]
                const colorClasses = typeColors[notification.type]

                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => handleMarkAsRead(notification.id)}
                    className={cn(
                      'p-3 cursor-pointer transition-colors hover:bg-white/[0.02]',
                      !notification.read && 'bg-white/[0.01]'
                    )}
                  >
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                          colorClasses
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4
                            className={cn(
                              'text-sm font-medium truncate',
                              !notification.read ? 'text-white' : 'text-white/70'
                            )}
                          >
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-white/50 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-white/30 mt-1">
                          {formatTimestamp(notification.timestamp)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </AnimatePresence>
      </div>
    </WidgetContainer>
  )
}
