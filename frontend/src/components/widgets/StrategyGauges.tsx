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
    <div className="bg-background-card border border-white/15 rounded-2xl p-4 shadow-xl relative overflow-hidden flex items-center justify-between group h-[100px]">
      {/* Top Accent Line */}
      <div className={cn("absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-transparent to-transparent opacity-50", glowColor)} />
      
      <div className="flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("p-1 rounded-md bg-white/5", color)}>
            <Icon size={12} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent-cyan">{label}</span>
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
            {typeof value === 'number' ? value : value}
          </span>
        </div>
      </div>
    </div>
  )
}

export const StrategyGauges = ({ onViewBots }: { onViewBots?: () => void }) => {
  const { bots } = useAppSelector(state => state.bots)
  
  const totalRealized = useMemo(() => 
    bots.reduce((acc, bot) => acc + (Number(bot.profit_realized) || 0), 0)
  , [bots])

  const runningCount = useMemo(() => bots.filter(b => b.status === 'active').length, [bots])
  const completedCount = useMemo(() => bots.filter(b => b.status === 'completed').length, [bots])

  // Dynamic target for gauge visualization
  const targetRealized = Math.max(100, Math.ceil(totalRealized / 1000) * 1000)
  const realizedPercentage = (totalRealized / targetRealized) * 100

  // Fixed targets for count-based gauges
  const runningPercentage = (runningCount / 20) * 100
  const completedPercentage = (completedCount / 50) * 100

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr_1fr] gap-2 shrink-0">
      <Gauge 
        label="Realized Profit"
        value={`$${totalRealized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        percentage={realizedPercentage}
        icon={TrendingUp}
        color="text-accent-green"
        glowColor="via-accent-green/20"
      />
      
      <button 
        onClick={onViewBots}
        className="bg-background-card border border-white/15 rounded-2xl flex flex-col items-center justify-center gap-2 h-[100px] hover:bg-accent-cyan/5 hover:border-accent-cyan/20 transition-all group relative overflow-hidden shadow-xl"
      >
         <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
         <Bot size={20} className="text-accent-cyan group-hover:scale-110 transition-transform" />
         <span className="text-[10px] uppercase tracking-[0.3em] text-accent-cyan font-black">Manage Active Bots</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Gauge 
          label="Running"
          value={runningCount}
          percentage={runningPercentage}
          icon={Zap}
          color="text-accent-cyan"
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
