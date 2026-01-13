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
    <div className="bg-background-card border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col h-full shrink-0">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
      
      <div className="flex items-center justify-between mb-4 border-b border-white/5 shrink-0 h-[35px]">
        <h3 className="text-base font-bold flex items-center gap-2 text-white uppercase tracking-tight">
          <Activity className="text-accent-cyan" size={18} />
          Strategy Terminal
        </h3>
        <div className="text-[10px] font-mono text-text-muted">SELECT ENGINE TYPE</div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left Side: 3x2 Grid */}
        <div className="grid grid-cols-3 gap-2 flex-[3]">
          {STRATEGIES.map((strat) => {
            const isActive = bots?.some((b: any) => b?.type?.toLowerCase() === strat.id && b.status === 'active')
            const isSelected = selectedId === strat.id
            
            return (
              <button
                key={strat.id}
                onClick={() => onSelect?.(strat.id)}
                className={cn(
                  "group/btn relative border rounded-xl p-2 flex flex-col items-center justify-center gap-1.5 transition-all text-center overflow-hidden",
                  isSelected 
                    ? "bg-accent-cyan/10 border-accent-cyan/40 shadow-[0_0_15px_rgba(0,255,255,0.1)]" 
                    : "bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10"
                )}
              >
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse shadow-[0_0_8px_rgba(0,255,157,0.5)]" />
                )}
                <strat.icon size={18} className={cn("transition-transform duration-300 group-hover/btn:scale-110", isSelected ? "text-accent-cyan" : "text-text-muted")} />
                <div className={cn("text-[10px] font-black uppercase tracking-widest", (isActive || isSelected) ? "text-white" : "text-text-muted")}>{strat.label}</div>
              </button>
            )
          })}
        </div>

        {/* Right Side: Strategy Intel */}
        <div className="flex-[4] bg-black/20 rounded-xl border border-white/5 p-4 flex flex-col relative group">
           <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <span className={cn("w-1 h-3 rounded-full bg-current", selectedStrat.color.replace('text-', 'bg-'))} />
                  {selectedStrat.label} INTEL
                </h4>
                <p className="text-[10px] text-text-secondary mt-1 leading-relaxed line-clamp-2 italic">
                  "{selectedStrat.desc}"
                </p>
              </div>
              <button 
                onClick={onViewBots}
                className="px-4 py-2 bg-accent-cyan text-black hover:bg-white border border-accent-cyan rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:shadow-[0_0_25px_rgba(0,255,255,0.4)] transform hover:-translate-y-0.5 active:scale-95"
              >
                View Bots
              </button>
           </div>

           <div className="mt-auto grid grid-cols-3 gap-2">
              {selectedStrat.features.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded border border-white/5">
                   <Info size={10} className="text-text-muted shrink-0" />
                   <span className="text-[8px] font-bold text-text-secondary uppercase truncate">{f}</span>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  )
}