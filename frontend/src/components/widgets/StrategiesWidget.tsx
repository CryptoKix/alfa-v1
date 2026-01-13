import { Activity, Zap, Bot, Users, Layers, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'

const STRATEGIES = [
  { 
    id: 'vwap', 
    label: 'VWAP', 
    icon: Activity,
    color: 'text-accent-cyan',
    desc: 'Volume-Weighted Average Price execution. Best for large institutional orders to minimize market impact.',
    features: ['Volume Analysis', 'Smart Slicing', 'Institutional Grade']
  },
  { 
    id: 'twap', 
    label: 'TWAP', 
    icon: Zap,
    color: 'text-accent-purple',
    desc: 'Time-Weighted Average Price execution. Executes trades linearly over time to achieve average entry.',
    features: ['Linear Execution', 'Custom Intervals', 'Duration Control']
  },
  { 
    id: 'grid', 
    label: 'GRID', 
    icon: Layers,
    color: 'text-accent-green',
    desc: 'Automated Buy Low / Sell High strategy within a defined price range. Profitable in volatile sideways markets.',
    features: []
  },
  { 
    id: 'dca', 
    label: 'DCA', 
    icon: Bot,
    color: 'text-accent-pink',
    desc: 'Dollar Cost Averaging. Automatically buy tokens at regular intervals regardless of price.',
    features: ['Fixed Investment', 'Frequency Selection', 'Long-term Accumulation']
  },
  { 
    id: 'arb', 
    label: 'ARB', 
    icon: TrendingUp,
    color: 'text-accent-yellow',
    desc: 'Arbitrage Engine. Detects and executes price differences between different DEXs or pools.',
    features: ['Multi-DEX Scan', 'Atomic Swaps', 'Risk Free']
  },
  { 
    id: 'copy', 
    label: 'COPY', 
    icon: Users,
    color: 'text-accent-cyan',
    desc: 'Mirror the trades of high-performance whale wallets in real-time with configurable scale factors.',
    features: ['Whale Tracking', 'Auto-Mirror', 'Risk Caps']
  },
]

export const StrategiesWidget = ({ onSelect, selectedId, onViewBots }: any) => {
  const { bots } = useAppSelector(state => state.bots)
  const selectedStrat = STRATEGIES.find(s => s.id === selectedId) || STRATEGIES[2] // Default to GRID

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
    <div className="bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full shrink-0">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
      
      <div className="flex items-center justify-between mb-3 border-b border-white/5 shrink-0 h-[30px]">
        <h3 className="text-sm font-bold flex items-center gap-2 text-white uppercase tracking-tight">
          <Activity className="text-accent-cyan" size={16} />
          Strategy Terminal
        </h3>
        <div className="text-[8px] font-mono text-text-muted uppercase tracking-widest">Command Deck V2.5</div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Side: 3x2 Grid (Tactical HUD Style) */}
        <div className="grid grid-cols-3 gap-3 flex-[4.5]">
          {STRATEGIES.map((strat) => {
            const isActive = bots?.some((b: any) => b?.type?.toLowerCase() === strat.id && b.status === 'active')
            const isSelected = selectedId === strat.id
            
            return (
              <button
                key={strat.id}
                onClick={() => onSelect?.(strat.id)}
                className={cn(
                  "group/btn relative h-[58px] transition-all duration-500",
                  "transform hover:scale-[1.05] active:scale-95",
                  isSelected ? "z-20" : "z-10"
                )}
              >
                {/* Unified Neon Glow (TWAP Purple Style) */}
                <div 
                  className={cn(
                    "absolute -inset-1 transition-all duration-500 blur-xl opacity-0 pointer-events-none rounded-xl",
                    isSelected ? "opacity-40" : "group-hover/btn:opacity-30"
                  )}
                  style={{ backgroundColor: 'var(--color-accent-purple)' }}
                />

                {/* Tactical HUD Frame */}
                <div className={cn(
                  "absolute inset-0 border-2 transition-all duration-500 rounded-xl flex flex-col items-center justify-center gap-1",
                  isSelected 
                    ? "bg-background-elevated border-accent-cyan shadow-[inset_0_0_20px_rgba(0,255,255,0.1)]" 
                    : "bg-black/40 border-white/5 group-hover/btn:border-white/20",
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

                  {/* Corner Accents (Selected Only) */}
                  {isSelected && (
                    <>
                      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white rounded-tl-sm opacity-50" />
                      <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-white rounded-tr-sm opacity-50" />
                      <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-white rounded-bl-sm opacity-50" />
                      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white rounded-br-sm opacity-50" />
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Right Side: Strategy Console & PnL Visualization (Narrower) */}
        <div className="flex-[3] bg-black/40 rounded-2xl border border-white/5 p-3 flex flex-col relative group overflow-hidden shadow-inner">
           <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className={cn("w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]", selectedId ? "text-accent-cyan" : "text-white")} />
                <span className="text-[10px] font-black text-white uppercase tracking-wider">Tactical Console</span>
              </div>
              <button 
                onClick={onViewBots}
                className="px-3 py-1.5 bg-accent-cyan text-black hover:bg-white border border-accent-cyan rounded-lg text-[8px] font-black uppercase tracking-wider transition-all shadow-[0_0_8px_rgba(0,255,255,0.2)] transform active:scale-95 shrink-0"
              >
                View Bots
              </button>
           </div>

           {/* PnL Visualization Panel */}
           <div className="flex-1 flex flex-col justify-center gap-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                 <div className="bg-background-elevated/50 border border-white/5 rounded-lg p-1.5 flex flex-col gap-0.5">
                    <span className="text-[6px] font-black text-text-muted uppercase tracking-[0.1em] truncate">Unrealized</span>
                    <div className={cn(
                      "text-xs font-black font-mono tracking-tighter truncate",
                      metrics.unrealized >= 0 ? "text-accent-green" : "text-accent-red"
                    )}>
                      ${metrics.unrealized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                 </div>
                 <div className="bg-background-elevated/50 border border-white/5 rounded-lg p-1.5 flex flex-col gap-0.5 text-right">
                    <span className="text-[6px] font-black text-text-muted uppercase tracking-[0.1em] truncate">Realized</span>
                    <div className={cn(
                      "text-xs font-black font-mono tracking-tighter text-white truncate"
                    )}>
                      ${metrics.realized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                 </div>
              </div>

              {/* Strategy Features (If any) */}
              {selectedStrat.features.length > 0 && (
                <div className="flex gap-1 overflow-hidden">
                  {selectedStrat.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 px-1 py-0.5 bg-white/5 rounded border border-white/5 shrink-0">
                      <span className="text-[5px] font-bold text-text-muted uppercase whitespace-nowrap">{f}</span>
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  )
}