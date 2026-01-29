import { motion, AnimatePresence } from 'framer-motion'
import { cn, formatTimestamp } from '@/lib/utils'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { markAsRead, clearAll } from '@/features/notifications/notificationsSlice'
import { X, Bell, AlertCircle, CheckCircle, Info, Activity, Trash2 } from 'lucide-react'
import { Button, Badge } from '@/components/ui'

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
}

const typeIcons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  signal: Activity,
}

const typeColors = {
  success: 'text-[var(--accent-green)]',
  error: 'text-[var(--accent-red)]',
  info: 'text-[var(--accent-cyan)]',
  signal: 'text-[var(--accent-pink)]',
}

const typeBg = {
  success: 'bg-[var(--accent-green)]/10',
  error: 'bg-[var(--accent-red)]/10',
  info: 'bg-[var(--accent-cyan)]/10',
  signal: 'bg-[var(--accent-pink)]/10',
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
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
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed right-0 top-0 h-full w-full max-w-md z-50',
              'glass-panel-solid border-l border-white/[0.06]',
              'flex flex-col'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-[var(--accent-cyan)]" />
                <h2 className="text-lg font-semibold">Notifications</h2>
                {unreadCount > 0 && (
                  <Badge variant="pink">{unreadCount} new</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleClearAll}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-auto glass-scrollbar">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/40">
                  <Bell className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {notifications.map((notification) => {
                    const Icon = typeIcons[notification.type]
                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => handleMarkAsRead(notification.id)}
                        className={cn(
                          'p-4 cursor-pointer transition-colors hover:bg-white/[0.02]',
                          !notification.read && 'bg-white/[0.01]'
                        )}
                      >
                        <div className="flex gap-3">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                              typeBg[notification.type]
                            )}
                          >
                            <Icon
                              className={cn('w-4 h-4', typeColors[notification.type])}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4
                                className={cn(
                                  'text-sm font-medium truncate',
                                  !notification.read && 'text-white'
                                )}
                              >
                                {notification.title}
                              </h4>
                              {!notification.read && (
                                <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)]" />
                              )}
                            </div>
                            <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
