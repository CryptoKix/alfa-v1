import { Activity, Zap, Bot, Users, Layers, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'

const STRATEGIES = [
  { 
    id: 'arb', 
    label: 'ARB', 
    icon: TrendingUp,
    color: 'text-accent-yellow',
    desc: 'Arbitrage Engine.'
  },
  { 
    id: 'copy', 
    label: 'COPY', 
    icon: Users,
    color: 'text-accent-cyan',
    desc: 'Mirror the trades of high-performance whale wallets.'
  },
  { 
    id: 'dca', 
    label: 'DCA', 
    icon: Bot,
    color: 'text-accent-pink',
    desc: 'Dollar Cost Averaging.'
  },
  { 
    id: 'grid', 
    label: 'GRID', 
    icon: Layers,
    color: 'text-accent-green',
    desc: 'Automated Buy Low / Sell High strategy.'
  },
  { 
    id: 'twap', 
    label: 'TWAP', 
    icon: Zap,
    color: 'text-accent-purple',
    desc: 'Time-Weighted Average Price execution.'
  },
  { 
    id: 'vwap', 
    label: 'VWAP', 
    icon: Activity,
    color: 'text-accent-cyan',
    desc: 'Volume-Weighted Average Price execution.'
  },
]

export const StrategiesWidget = ({ onSelect, selectedId, onViewBots, rightElement }: any) => {
  const { bots } = useAppSelector(state => state.bots)

  const terminalContent = (
    <div className={cn(
      "bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full shrink-0",
      rightElement ? "lg:w-[650px]" : "w-full"
    )}>
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
      
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-tight">Strategy Terminal</h3>
          </div>
        </div>
        <button 
          onClick={onViewBots}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all transform active:scale-95 shrink-0"
        >
          Active Strategies
        </button>
      </div>

      <div className="flex-1 flex gap-2 min-h-0 items-stretch mt-4">
        <div className="grid grid-cols-6 gap-2 flex-1">
          {STRATEGIES.map((strat) => {
            const isActive = bots?.some((b: any) => b?.type?.toLowerCase() === strat.id && b.status === 'active')
            const isSelected = selectedId === strat.id
            
            return (
              <button
                key={strat.id}
                onClick={() => onSelect?.(strat.id)}
                className={cn(
                  "group/btn relative transition-all duration-300 h-full",
                  "transform active:scale-95",
                  isSelected ? "z-20" : "z-10"
                )}
              >
                {/* Highlight Glow */}
                <div 
                  className={cn(
                    "absolute -inset-1 transition-all duration-500 blur-xl opacity-0 pointer-events-none rounded-xl",
                    isSelected ? "opacity-30" : "group-hover/btn:opacity-20"
                  )}
                  style={{ backgroundColor: isSelected ? 'var(--color-accent-cyan)' : 'var(--color-accent-purple)' }}
                />

                <div className={cn(
                  "absolute inset-0 border transition-all duration-300 rounded-xl flex flex-col items-center justify-center gap-1 overflow-hidden",
                  isSelected 
                    ? "bg-background-elevated border-accent-cyan shadow-[0_0_15px_rgba(0,255,255,0.1)]" 
                    : "bg-black/20 border-white/10 group-hover/btn:border-white/20 hover:bg-black/40",
                )}>
                  {/* Active Indicator */}
                  {isActive && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-accent-green animate-ping absolute" />
                      <div className="w-1 h-1 rounded-full bg-accent-green relative" />
                    </div>
                  )}

                  {/* Icon with Dynamic Coloring */}
                  <strat.icon 
                    size={24} 
                    className={cn(
                      "transition-all duration-500", 
                      isSelected ? "text-accent-cyan scale-110 drop-shadow-[0_0_8px_rgba(0,255,255,0.5)]" : "text-text-muted group-hover/btn:text-white"
                    )} 
                  />
                  
                  <div className={cn(
                    "text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-500 mt-1", 
                    isSelected ? "text-white" : "text-text-muted group-hover/btn:text-white"
                  )}>
                    {strat.label}
                  </div>

                  {/* Bottom selection bar */}
                  {isSelected && (
                    <div className="absolute bottom-0 left-0 w-full h-[1.5px] bg-accent-cyan shadow-[0_0_10px_rgba(0,255,255,0.8)]" />
                  )}
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
