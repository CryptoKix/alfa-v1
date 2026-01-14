import { TrendingUp, Users, Bot, Layers, Zap, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { setSelectedStrategy } from '@/features/bots/botsSlice'

const STRATEGIES = [
  { id: 'arb', label: 'ARB', icon: TrendingUp },
  { id: 'copy', label: 'COPY', icon: Users },
  { id: 'dca', label: 'DCA', icon: Bot },
  { id: 'grid', label: 'GRID', icon: Layers },
  { id: 'twap', label: 'TWAP', icon: Zap },
  { id: 'vwap', label: 'VWAP', icon: Activity },
]

export const StrategyTabs = () => {
  const dispatch = useAppDispatch()
  const { selectedStrategy, bots } = useAppSelector(state => state.bots)

  return (
    <div className="flex items-center gap-1.5 bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
      {STRATEGIES.map((strat) => {
        const isActive = bots?.some((b: any) => b?.type?.toLowerCase() === strat.id && b.status === 'active')
        const isSelected = selectedStrategy === strat.id
        
        return (
          <button
            key={strat.id}
            onClick={() => dispatch(setSelectedStrategy(strat.id))}
            className={cn(
              "relative px-5 py-2.5 flex items-center gap-2.5 rounded-xl transition-all duration-300 group border",
              isSelected 
                ? "bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan shadow-[0_0_20px_rgba(0,255,255,0.15)] scale-[1.02]" 
                : "bg-accent-pink/[0.08] border-accent-pink/20 text-text-muted hover:text-white hover:bg-accent-pink/[0.12] hover:border-accent-pink/40"
            )}
          >
            {isActive && (
              <div className="absolute -top-1 -right-1 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-accent-green animate-ping absolute opacity-75" />
                <div className="w-2 h-2 rounded-full bg-accent-green relative border border-black shadow-[0_0_8px_rgba(0,255,157,0.5)]" />
              </div>
            )}
            
            <strat.icon size={15} className={cn("transition-transform duration-300 group-hover:scale-110", isSelected ? "text-accent-cyan" : "text-text-muted group-hover:text-white")} />
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">{strat.label}</span>
            
            {isSelected && (
              <div className="absolute -bottom-[1px] left-1/4 w-1/2 h-[2px] bg-accent-cyan shadow-[0_0_15px_rgba(0,255,255,1)] rounded-full" />
            )}
          </button>
        )
      })}
    </div>
  )
}
