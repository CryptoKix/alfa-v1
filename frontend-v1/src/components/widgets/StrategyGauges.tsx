import { useMemo } from 'react'
import { useAppSelector } from '@/app/hooks'
import { TrendingUp, Zap, Bot, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GaugeProps {
  label: string
  value: string | number
  percentage: number
  icon: any
  color: string
  glowColor: string
}

const Gauge = ({ label, value, percentage, icon: Icon, color, glowColor }: GaugeProps) => {
  const circumference = 125.6 // Semi-circle circumference for r=40
  const offset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference

  return (
    <div className="bg-background-card border border-accent-pink/305 rounded-lg p-4 shadow-floating relative overflow-hidden flex items-center justify-between group h-[100px]">
      {/* Top Accent Line */}
      <div className={cn("absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-transparent to-transparent opacity-50", glowColor)} />
      
      <div className="flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("p-1 rounded-md bg-white/5", color)}>
            <Icon size={12} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent-purple">{label}</span>
        </div>
      </div>

      <div className="relative w-32 h-16 flex items-center justify-center">
        <svg viewBox="0 0 100 60" className="w-full h-full">
          {/* Background Arc */}
          <path 
            d="M 10 50 A 40 40 0 0 1 90 50" 
            fill="none" 
            stroke="rgba(255,255,255,0.03)" 
            strokeWidth="10" 
            strokeLinecap="round"
          />
          {/* Progress Arc */}
          <path 
            d="M 10 50 A 40 40 0 0 1 90 50" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="10" 
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn("transition-all duration-1000 ease-out", color)}
          />
        </svg>
        {/* Center Text for Value */}
        <div className="absolute bottom-1 flex flex-col items-center">
          <span className={cn("text-[11px] font-mono font-black tracking-tighter", color)}>
            {value}
          </span>
        </div>
      </div>
    </div>
  )
}

export const StrategyGauges = ({ onViewBots }: { onViewBots?: () => void }) => {
  const { bots } = useAppSelector(state => state.bots)
  
  const { realized, unrealized } = useMemo(() => {
    return bots.reduce((acc, bot) => {
      const totalTacticalPnl = Number(bot.profit_realized) || 0
      
      if (bot.status === 'active' && bot.type === 'GRID') {
        const botYield = Number(bot.grid_yield) || 0
        acc.realized += botYield
        acc.unrealized += (totalTacticalPnl - botYield)
      } else {
        // For completed bots or other types, everything is considered realized once closed
        acc.realized += totalTacticalPnl
      }
      return acc
    }, { realized: 0, unrealized: 0 })
  }, [bots])

  const runningCount = useMemo(() => bots.filter(b => b.status === 'active').length, [bots])
  const completedCount = useMemo(() => bots.filter(b => b.status === 'completed').length, [bots])

  // Fixed targets for count-based gauges
  const runningPercentage = (runningCount / 20) * 100
  const completedPercentage = (completedCount / 50) * 100

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr_1fr] gap-2 shrink-0">
      {/* Tactical PnL Engine Visual */}
      <div className="bg-background-card border border-accent-pink/305 rounded-lg p-4 shadow-floating relative overflow-hidden flex items-center justify-between group h-[100px]">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-30" />
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
             <TrendingUp size={12} className={(realized + unrealized) >= 0 ? "text-accent-purple" : "text-accent-purple"} />
             <span className={cn(
               "text-[9px] font-black uppercase tracking-[0.2em]",
               (realized + unrealized) >= 0 ? "text-accent-purple" : "text-accent-purple"
             )}>Overall</span>
          </div>
          <div className={cn(
            "text-lg font-black font-mono tracking-tighter",
            (realized + unrealized) >= 0 ? "text-accent-purple" : "text-accent-purple"
          )}>
             ${(realized + unrealized).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="flex gap-8 pr-2 h-full items-center">
           <div className="flex flex-col items-start">
              <span className={cn(
                "text-[9px] font-black uppercase tracking-[0.2em]",
                realized >= 0 ? "text-accent-purple" : "text-accent-purple"
              )}>Realized</span>
              <div className={cn(
                "text-lg font-black font-mono tracking-tighter",
                realized >= 0 ? "text-accent-purple" : "text-accent-purple"
              )}>
                 ${realized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
           </div>
           <div className="w-px h-10 bg-white/5" />
           <div className="flex flex-col items-start">
              <span className={cn(
                "text-[9px] font-black uppercase tracking-[0.2em]",
                unrealized >= 0 ? "text-accent-purple" : "text-accent-purple"
              )}>Unrealized</span>
              <div className={cn(
                "text-lg font-black font-mono tracking-tighter",
                unrealized >= 0 ? "text-accent-purple" : "text-accent-purple"
              )}>
                 ${unrealized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
           </div>
        </div>
      </div>
      
      <button 
        onClick={onViewBots}
        className="bg-background-card border border-accent-pink/305 rounded-lg flex flex-col items-center justify-center gap-2 h-[100px] hover:bg-accent-cyan/5 hover:border-accent-cyan/20 transition-all group relative overflow-hidden shadow-floating"
      >
         <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
         <Bot size={20} className="text-accent-purple group-hover:scale-110 transition-transform" />
         <span className="text-[10px] uppercase tracking-[0.3em] text-accent-purple font-black">Manage Active Bots</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Gauge 
          label="Running"
          value={runningCount}
          percentage={runningPercentage}
          icon={Zap}
          color="text-accent-purple"
          glowColor="via-accent-cyan/20"
        />
        
        <Gauge 
          label="Completed"
          value={completedCount}
          percentage={completedPercentage}
          icon={CheckCircle2}
          color="text-accent-purple"
          glowColor="via-accent-purple/20"
        />
      </div>
    </div>
  )
}