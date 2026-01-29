import { Bell, BellOff, Info, CheckCircle, AlertCircle, Zap, Clock } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { clearAll } from '@/features/notifications/notificationsSlice'

export const AlertsWidget = () => {
  const dispatch = useAppDispatch()
  const { notifications } = useAppSelector(state => state.notifications)

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  return (
    <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-6 shadow-xl relative overflow-hidden group flex flex-col h-full shrink-0">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 via-accent-cyan/20 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-accent-cyan/10 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
        <h3 className="text-sm font-bold flex items-center gap-2 text-white uppercase tracking-tight">
          <Bell className="text-accent-cyan" size={18} />
          System Alerts
        </h3>
        <div className="flex gap-2">
           <button 
             onClick={() => dispatch(clearAll())}
             className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-bold text-text-muted hover:text-white hover:bg-white/10 transition-colors uppercase tracking-widest"
           >
             Clear All
           </button>
        </div>
      </div>

      {/* Alerts Stream */}
      <div className="flex-1 overflow-auto custom-scrollbar pr-2 space-y-2 mt-2">
        {notifications.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50 gap-2">
            <BellOff size={24} strokeWidth={1} />
            <div className="text-center">
              <div className="font-bold text-[10px] uppercase tracking-widest">No Active Alerts</div>
              <div className="text-[9px]">Engine activity will appear here</div>
            </div>
          </div>
        ) : (
          notifications.map((alert) => (
            <div 
              key={alert.id} 
              className={cn(
                "p-3 rounded-xl border transition-all relative overflow-hidden group",
                alert.type === 'success' ? "bg-accent-green/5 border-accent-green/10" :
                alert.type === 'error' ? "bg-accent-red/5 border-accent-red/10" :
                alert.type === 'signal' ? "bg-accent-cyan/5 border-accent-cyan/10" :
                "bg-white/[0.02] border-white/5"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-1.5 rounded-lg shrink-0",
                  alert.type === 'success' ? "text-accent-green bg-accent-green/10" :
                  alert.type === 'error' ? "text-accent-red bg-accent-red/10" :
                  alert.type === 'signal' ? "text-accent-cyan bg-accent-cyan/10" :
                  "text-text-muted bg-white/5"
                )}>
                  {alert.type === 'success' ? <CheckCircle size={14} /> :
                   alert.type === 'error' ? <AlertCircle size={14} /> :
                   alert.type === 'signal' ? <Zap size={14} /> :
                   <Info size={14} />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-black text-white uppercase tracking-tight truncate">{alert.title}</span>
                    <span className="text-[8px] text-text-muted font-mono shrink-0 flex items-center gap-1">
                      <Clock size={8} />
                      {formatTime(alert.timestamp)}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">
                    {alert.message}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
