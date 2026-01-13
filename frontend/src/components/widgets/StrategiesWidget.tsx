import { Activity, Zap, Bot, Users, Layers, TrendingUp, Info } from 'lucide-react'
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
    if (bot.type?.toLowerCase() === selectedId) {
      if (bot.status === 'active') {
        acc.unrealized += (bot.profit_realized || 0)
      } else if (bot.status === 'completed') {
        acc.realized += (bot.profit_realized || 0)
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
        {/* Left Side: 3x2 Grid */}
        <div className="grid grid-cols-3 gap-4 flex-[4]">
          {STRATEGIES.map((strat) => {
            const isActive = bots?.some((b: any) => b?.type?.toLowerCase() === strat.id && b.status === 'active')
            const isSelected = selectedId === strat.id
            const colorClass = strat.color
            
            return (
              <button
                key={strat.id}
                onClick={() => onSelect?.(strat.id)}
                className={cn(
                  "group/btn relative h-[42px] transition-all duration-500",
                  "transform hover:scale-[1.05] active:scale-95",
                  isSelected ? "z-20" : "z-10"
                )}
              >
                {/* Unified Neon Glow (TWAP Purple Style) */}
                <div 
                  className={cn(
                    "absolute -inset-1 transition-all duration-500 blur-xl opacity-0 pointer-events-none",
                    isSelected ? "opacity-30" : "group-hover/btn:opacity-50"
                  )}
                  style={{ backgroundColor: 'var(--color-accent-purple)' }}
                />

                {/* The "Swanky" Beveled Frame */}
                <div className={cn(
                  "absolute inset-0 border transition-all duration-500",
                  isSelected 
                    ? "bg-background-elevated border-accent-purple" 
                    : "bg-white/[0.03] border-white/10 group-hover/btn:border-accent-purple/50",
                  "clip-path-polygon-[0%_0%,100%_0%,100%_75%,85%_100%,0%_100%]"
                )} 
                style={{
                  clipPath: 'polygon(0 0, 100% 0, 100% 75%, 85% 100%, 0 100%)'
                }} />

                {/* Internal Glow / Light Leak */}
                <div 
                  className={cn(
                    "absolute top-0 left-0 w-full h-0.5 transition-all duration-500",
                    isSelected ? "opacity-100" : "opacity-0 group-hover/btn:opacity-100"
                  )}
                  style={{ 
                    backgroundColor: 'var(--color-accent-purple)',
                    boxShadow: '0 0 10px var(--color-accent-purple)'
                  }}
                />

                {/* Content Container */}
                <div className="relative h-full w-full flex flex-col items-center justify-center gap-0.5">
                  {isActive && (
                    <div className="absolute top-1 left-1.5 flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-accent-green animate-ping absolute" />
                      <div className="w-1 h-1 rounded-full bg-accent-green relative" />
                    </div>
                  )}

                  <strat.icon 
                    size={16} 
                    className={cn(
                      "transition-all duration-500", 
                      isSelected ? "text-white" : "text-accent-cyan"
                    )} 
                  />
                  
                  <div className={cn(
                    "text-[7px] font-black uppercase tracking-[0.2em] transition-all duration-500", 
                    isSelected ? "text-white" : "text-accent-cyan"
                  )}>
                    {strat.label}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Right Side: Strategy Intel & PnL Visualization (Narrower) */}
        <div className="flex-[3] bg-black/20 rounded-xl border border-white/5 p-2.5 flex flex-col relative group overflow-hidden">
           <div className="flex items-start justify-between mb-1 shrink-0 gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className={cn("w-1 h-2 rounded-full bg-current", selectedStrat.color.replace('text-', 'bg-'))} />
                  {selectedStrat.label} ANALYTICS
                </h4>
                <p className="text-[8px] text-text-secondary mt-0.5 leading-tight line-clamp-1 italic">
                  {selectedStrat.desc}
                </p>
              </div>
              <button 
                onClick={onViewBots}
                className="px-2 py-1 bg-accent-cyan text-black hover:bg-white border border-accent-cyan rounded-lg text-[7px] font-black uppercase tracking-wider transition-all shadow-[0_0_8px_rgba(0,255,255,0.2)] transform active:scale-95 shrink-0"
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