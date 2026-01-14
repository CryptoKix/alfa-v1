import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'

export const TacticalConsoleWidget = ({ selectedId }: { selectedId: string }) => {
  const { bots } = useAppSelector(state => state.bots)
  
  // Calculate Strategy-Specific PnL Metrics
  const metrics = (bots || []).reduce((acc, bot) => {
    if (bot && bot.type?.toLowerCase() === selectedId) {
      const pnl = Number(bot.profit_realized) || 0
      if (bot.status === 'active') {
        acc.unrealized += pnl
      } else if (bot.status === 'completed') {
        acc.realized += pnl
      }
    }
    return acc
  }, { unrealized: 0, realized: 0 })

  return (
    <div className="bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
            <Activity size={18} />
          </div>
          <h3 className="text-xs font-bold text-white uppercase tracking-tight">Tactical Console</h3>
        </div>
      </div>

      <div className="flex-1 bg-black/40 rounded-2xl border border-white/15 p-3 flex flex-col relative group overflow-hidden shadow-inner mt-2">
         {/* PnL Visualization Panel */}
         <div className="flex-1 flex flex-col justify-center gap-2">
            <div className="grid grid-cols-2 gap-2">
               <div className="bg-background-elevated/50 border border-white/15 rounded-xl p-2.5 flex flex-col gap-1 relative overflow-hidden group/pnl">
                  <div className="absolute top-0 left-0 w-1 h-full bg-accent-cyan opacity-20" />
                  <span className="text-[7px] font-black text-text-muted uppercase tracking-[0.2em]">Unrealized PnL</span>
                  <div className={cn(
                    "text-sm font-black font-mono tracking-tight transition-all duration-500",
                    metrics.unrealized > 0 ? "text-accent-green" : metrics.unrealized < 0 ? "text-accent-red" : "text-white"
                  )}>
                    {metrics.unrealized > 0 ? '+' : metrics.unrealized < 0 ? '-' : ''}${Math.abs(metrics.unrealized).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
               </div>
               <div className="bg-background-elevated/50 border border-white/15 rounded-xl p-2.5 flex flex-col gap-1 text-right relative overflow-hidden group/pnl">
                  <div className="absolute top-0 right-0 w-1 h-full bg-accent-purple opacity-20" />
                  <span className="text-[7px] font-black text-text-muted uppercase tracking-[0.2em]">Realized Total</span>
                  <div className={cn(
                    "text-sm font-black font-mono tracking-tight transition-all duration-500",
                    metrics.realized > 0 ? "text-accent-green" : metrics.realized < 0 ? "text-accent-red" : "text-white"
                  )}>
                    {metrics.realized > 0 ? '+' : metrics.realized < 0 ? '-' : ''}${Math.abs(metrics.realized).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  )
}
