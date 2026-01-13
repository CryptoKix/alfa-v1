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
    features: ['Auto-Rebalancing', 'Trailing Up', 'PnL Visualization']
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
    color: 'text-yellow-400',
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

  return (
    <div className="bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full shrink-0">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
      
      <div className="flex items-center justify-between mb-3 border-b border-white/5 shrink-0 h-[30px]">
        <h3 className="text-sm font-bold flex items-center gap-2 text-white uppercase tracking-tight">
          <Activity className="text-accent-cyan" size={16} />
          Strategy Terminal
        </h3>
        <div className="text-[8px] font-mono text-text-muted">COMMAND DECK V2.0</div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Side: 3x2 Grid */}
        <div className="grid grid-cols-3 gap-2 flex-[3]">
          {STRATEGIES.map((strat) => {
            const isActive = bots?.some((b: any) => b?.type?.toLowerCase() === strat.id && b.status === 'active')
            const isSelected = selectedId === strat.id
            const colorClass = strat.color
            const glowColor = strat.color.split('-').pop()
            
            return (
              <button
                key={strat.id}
                onClick={() => onSelect?.(strat.id)}
                className={cn(
                  "group/btn relative h-[42px] transition-all duration-500 overflow-hidden",
                  "transform hover:scale-[1.05] active:scale-95",
                  isSelected ? "z-20" : "z-10"
                )}
              >
                {/* The "Swanky" Beveled Frame */}
                <div className={cn(
                  "absolute inset-0 border transition-all duration-500",
                  isSelected 
                    ? `bg-background-elevated border-accent-${glowColor} shadow-[inset_0_0_15px_rgba(var(--color-accent-${glowColor}-rgb),0.15)]` 
                    : `bg-white/[0.03] border-white/10 group-hover/btn:border-accent-${glowColor}/50 group-hover/btn:shadow-[0_0_20px_var(--color-accent-${glowColor})]`,
                  "clip-path-polygon-[0%_0%,100%_0%,100%_75%,85%_100%,0%_100%]"
                )} 
                style={{
                  clipPath: 'polygon(0 0, 100% 0, 100% 75%, 85% 100%, 0 100%)'
                }} />

                {/* Internal Glow / Light Leak */}
                <div className={cn(
                  "absolute top-0 left-0 w-full h-0.5 transition-all duration-500",
                  isSelected 
                    ? `bg-accent-${glowColor} opacity-100 shadow-[0_0_10px_rgba(var(--color-accent-${glowColor}-rgb),0.6)]` 
                    : `bg-accent-${glowColor}/0 opacity-0 group-hover/btn:bg-accent-${glowColor} group-hover/btn:opacity-100 group-hover/btn:shadow-[0_0_10px_var(--color-accent-${glowColor})]`
                )} />

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
                      isSelected ? colorClass : "text-text-muted group-hover/btn:text-white"
                    )} 
                  />
                  
                  <div className={cn(
                    "text-[7px] font-black uppercase tracking-[0.2em] transition-all duration-500", 
                    (isActive || isSelected) ? "text-white" : "text-text-muted group-hover/btn:text-text-secondary"
                  )}>
                    {strat.label}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Right Side: Strategy Intel */}
        <div className="flex-[4] bg-black/20 rounded-xl border border-white/5 p-3 flex flex-col relative group">
           <div className="flex items-start justify-between mb-1.5">
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <span className={cn("w-1 h-2 rounded-full bg-current", selectedStrat.color.replace('text-', 'bg-'))} />
                  {selectedStrat.label}
                </h4>
                <p className="text-[9px] text-text-secondary mt-0.5 leading-relaxed line-clamp-2 italic pr-2">
                  {selectedStrat.desc}
                </p>
              </div>
              <button 
                onClick={onViewBots}
                className="px-3 py-1.5 bg-accent-cyan text-black hover:bg-white border border-accent-cyan rounded-lg text-[8px] font-black uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(0,255,255,0.2)] transform active:scale-95 shrink-0"
              >
                View Bots
              </button>
           </div>

           <div className="mt-auto grid grid-cols-3 gap-1.5">
              {selectedStrat.features.map((f, i) => (
                <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 rounded border border-white/5">
                   <Info size={8} className="text-text-muted shrink-0" />
                   <span className="text-[7px] font-bold text-text-secondary uppercase truncate">{f}</span>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  )
}