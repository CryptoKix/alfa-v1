import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, Info, Zap, X } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { markAsRead, AppNotification } from '@/features/notifications/notificationsSlice'
import { cn } from '@/lib/utils'

export const NotificationToast = () => {
  const dispatch = useAppDispatch()
  const { notifications } = useAppSelector(state => state.notifications)
  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([])

  // Only show unread notifications from the last 10 seconds
  useEffect(() => {
    const now = Date.now()
    const recent = notifications.filter(n => !n.read && (now - n.timestamp) < 10000)
    setActiveToasts(recent)
  }, [notifications])

  const handleClose = (id: string) => {
    dispatch(markAsRead(id))
  }

  if (activeToasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[10000] flex flex-col gap-3 pointer-events-none">
      {activeToasts.map((n) => (
        <ToastItem key={n.id} notification={n} onClose={() => handleClose(n.id)} />
      ))}
    </div>
  )
}

const ToastItem = ({ notification, onClose }: { notification: AppNotification; onClose: () => void }) => {
  const [isExiting, setIsExiting] = useState(false)

  const icons = {
    success: <CheckCircle className="text-accent-green" size={18} />,
    error: <AlertCircle className="text-accent-red" size={18} />,
    info: <Info className="text-accent-cyan" size={18} />,
    signal: <Zap className="text-accent-purple" size={18} />,
  }

  const handleManualClose = () => {
    setIsExiting(true)
    setTimeout(onClose, 300)
  }

  return (
    <div 
      className={cn(
        "pointer-events-auto bg-background-card/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl min-w-[320px] max-w-md flex items-start gap-4 animate-in slide-in-from-right-10 duration-300 relative overflow-hidden",
        isExiting && "animate-out fade-out slide-out-to-right-10 duration-300"
      )}
    >
      {/* Progress Bar (Auto-hide) */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-white/10 w-full">
        <div 
          className="h-full bg-accent-cyan/50 animate-progress" 
          style={{ animationDuration: '10s' }}
        />
      </div>

      <div className="shrink-0 mt-0.5">
        {icons[notification.type] || icons.info}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs font-black text-white uppercase tracking-wider mb-1">{notification.title}</div>
        <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">{notification.message}</p>
      </div>

      <button 
        onClick={handleManualClose}
        className="shrink-0 p-1 hover:bg-white/5 rounded-lg text-text-muted hover:text-white transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
