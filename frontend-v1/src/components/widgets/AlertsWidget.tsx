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
    <div className="bg-background-card border border-accent-pink/30 rounded-lg p-6 shadow-floating relative overflow-hidden group flex flex-col h-full shrink-0">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
        <h3 className="text-sm font-bold flex items-center gap-2 text-white uppercase tracking-tight">
          <Bell className="text-accent-purple" size={18} />
          System Alerts
        </h3>
        <div className="flex gap-2">
           <button 
             onClick={() => dispatch(clearAll())}
             className="px-2 py-0.5 bg-white/5 border border-border rounded text-[9px] font-bold text-text-muted hover:text-white hover:bg-white/10 transition-colors uppercase tracking-widest"
           >
             Clear All
           </button>
        </div>
      </div>

      {/* Alerts Stream */}
      <div className="flex-1 overflow-auto custom-scrollbar pr-2 space-y-2 mt-2">
        {notifications.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in-95 duration-500">
             <div className="p-4 rounded-full bg-accent-pink/5 border border-accent-pink/20 shadow-[0_0_30px_rgba(255,0,128,0.1)]">
               <BellOff size={32} strokeWidth={1.5} className="text-accent-pink" />
             </div>
             <div className="text-center space-y-1">
               <div className="font-black text-xs uppercase tracking-[0.2em] text-white">All Clear</div>
               <div className="text-[10px] font-bold text-accent-pink/70">Engine status normal</div>
             </div>
           </div>
        ) : (
          notifications.map((alert) => (
            <div 
              key={alert.id} 
              className={cn(
                "p-3 rounded-md border transition-all relative overflow-hidden group",
                alert.type === 'success' ? "bg-accent-green/5 border-accent-green/10" :
                alert.type === 'error' ? "bg-accent-red/5 border-accent-red/10" :
                alert.type === 'signal' ? "bg-accent-cyan/5 border-accent-cyan/10" :
                "bg-white/[0.02] border-border"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-1.5 rounded-lg shrink-0",
                  alert.type === 'success' ? "text-accent-purple bg-accent-purple/10" :
                  alert.type === 'error' ? "text-accent-red bg-accent-red/10" :
                  alert.type === 'signal' ? "text-accent-purple bg-accent-purple/10" :
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
