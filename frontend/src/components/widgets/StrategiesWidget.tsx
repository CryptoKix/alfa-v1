import { Activity, Zap, Bot, Users, Layers, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'

const STRATEGIES = [
  { 
    id: 'vwap', 
    label: 'VWAP', 
    icon: Activity,
    color: 'text-accent-cyan',
    desc: 'Volume-Weighted Average Price execution.',
    features: ['Volume Analysis', 'Smart Slicing', 'Institutional Grade']
  },
  { 
    id: 'twap', 
    label: 'TWAP', 
    icon: Zap,
    color: 'text-accent-purple',
    desc: 'Time-Weighted Average Price execution.',
    features: []
  },
  { 
    id: 'grid', 
    label: 'GRID', 
    icon: Layers,
    color: 'text-accent-green',
    desc: 'Automated Buy Low / Sell High strategy.',
    features: []
  },
  { 
    id: 'dca', 
    label: 'DCA', 
    icon: Bot,
    color: 'text-accent-pink',
    desc: 'Dollar Cost Averaging.',
    features: ['Fixed Investment', 'Frequency Selection', 'Long-term Accumulation']
  },
  { 
    id: 'arb', 
    label: 'ARB', 
    icon: TrendingUp,
    color: 'text-accent-yellow',
    desc: 'Arbitrage Engine.',
    features: ['Multi-DEX Scan', 'Atomic Swaps', 'Risk Free']
  },
  { 
    id: 'copy', 
    label: 'COPY', 
    icon: Users,
    color: 'text-accent-cyan',
    desc: 'Mirror the trades of high-performance whale wallets.',
    features: []
  },
]

export const StrategiesWidget = ({ onSelect, selectedId, onViewBots, rightElement }: any) => {
  const { bots } = useAppSelector(state => state.bots)

  const terminalContent = (
    <div className={cn(
      "bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full shrink-0",
      rightElement ? "lg:w-[500px]" : "w-full"
    )}>
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
      
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-tight">Strategy Terminal</h3>
          </div>
        </div>
        <button 
          onClick={onViewBots}
          className="px-3 py-1.5 bg-accent-cyan text-black hover:bg-white border border-accent-cyan rounded-lg text-[8px] font-black uppercase tracking-wider transition-all shadow-[0_0_8px_rgba(0,255,255,0.2)] transform active:scale-95 shrink-0"
        >
          View Bots
        </button>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 items-stretch mt-2">
        <div className="grid grid-cols-3 grid-rows-2 gap-3 flex-1">
          {STRATEGIES.map((strat) => {
            const isActive = bots?.some((b: any) => b?.type?.toLowerCase() === strat.id && b.status === 'active')
            const isSelected = selectedId === strat.id
            
            return (
              <button
                key={strat.id}
                onClick={() => onSelect?.(strat.id)}
                className={cn(
                  "group/btn relative transition-all duration-500 h-full",
                  "transform hover:scale-[1.02] active:scale-95",
                  isSelected ? "z-20" : "z-10"
                )}
              >
                <div 
                  className={cn(
                    "absolute -inset-1 transition-all duration-500 blur-xl opacity-0 pointer-events-none rounded-xl",
                    isSelected ? "opacity-40" : "group-hover/btn:opacity-30"
                  )}
                  style={{ backgroundColor: 'var(--color-accent-purple)' }}
                />

                <div className={cn(
                  "absolute inset-0 border transition-all duration-500 rounded-xl flex flex-col items-center justify-center gap-1",
                  isSelected 
                    ? "bg-background-elevated border-accent-cyan shadow-[inset_0_0_20px_rgba(0,255,255,0.1)]" 
                    : "bg-black/40 border-white/15 group-hover/btn:border-white/25",
                )}>
                  {isActive && (
                    <div className="absolute top-1.5 right-2 flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-accent-green animate-ping absolute" />
                      <div className="w-1 h-1 rounded-full bg-accent-green relative" />
                    </div>
                  )}

                  <strat.icon 
                    size={22} 
                    className={cn(
                      "transition-all duration-500", 
                      isSelected ? "text-white scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" : "text-accent-cyan group-hover/btn:text-white"
                    )} 
                  />
                  
                  <div className={cn(
                    "text-[9px] font-black uppercase tracking-[0.25em] transition-all duration-500", 
                    isSelected ? "text-white" : "text-accent-cyan/80 group-hover/btn:text-white"
                  )}>
                    {strat.label}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (!rightElement) return terminalContent

  return (
    <div className="flex gap-2 h-full">
      {terminalContent}
      <div className="flex-1 min-w-0">
        {rightElement}
      </div>
    </div>
  )
}
