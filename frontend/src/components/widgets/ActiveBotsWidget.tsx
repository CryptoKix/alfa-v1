import { useState } from 'react'
import { Activity, Pause, Play, Trash2, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

export const ActiveBotsWidget = ({ onViewAll }: { onViewAll?: () => void }) => {
  const { bots } = useAppSelector(state => state.bots)
  const runningBots = bots.filter(b => b && b.status !== 'deleted' && b.status !== 'completed')
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null)

  const handlePauseBot = async (e: React.MouseEvent, id: string, currentStatus: string) => {
    e.stopPropagation()
    try {
        const newStatus = currentStatus === 'active' ? 'paused' : 'active'
        await fetch('/api/dca/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: newStatus })
        })
    } catch (e) {
        console.error("Failed to toggle bot status", e)
    }
  }

  const handleDeleteBot = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to terminate this strategy?')) return
    try {
        await fetch('/api/dca/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        })
    } catch (e) {
        console.error("Failed to delete bot", e)
    }
  }

  const toggleExpand = (id: string, type: string) => {
    if (type.toUpperCase() !== 'GRID') return
    setExpandedBotId(prev => prev === id ? null : id)
  }

  return (
    <div className="bg-background-card border border-white/5 rounded-2xl p-6 shadow-xl h-full flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-green via-accent-cyan to-accent-purple opacity-50" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2 border-b border-white/5 shrink-0 h-[55px]">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Activity className="text-accent-green" size={18} />
          Active Bots
        </h3>
        <div className="flex items-center gap-3">
           <button 
             onClick={onViewAll}
             className="text-[9px] uppercase tracking-[0.2em] text-text-muted hover:text-accent-green transition-colors font-bold"
           >
             View All
           </button>
           <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-mono text-text-muted">
             {runningBots.length} RUNNING
           </div>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[30px_60px_1fr_120px_80px_80px_80px] gap-2 px-2 pb-2 mr-[6px] text-[9px] font-bold text-text-muted uppercase tracking-wider shrink-0 mt-2">
        <div className="pl-1">St</div>
        <div>Type</div>
        <div>Pair</div>
        <div>Range</div>
        <div className="text-right">PnL</div>
        <div className="text-right">Trades</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto custom-scrollbar pr-2 space-y-1 pb-2">
        {runningBots.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
             <Zap size={24} strokeWidth={1} />
             <div className="text-center mt-2">
               <div className="font-bold text-[10px] uppercase tracking-widest mb-0.5">System Idle</div>
               <div className="text-[9px]">Launch a strategy to begin</div>
             </div>
           </div>
        ) : (
          runningBots.map(bot => {
            const isExpanded = expandedBotId === bot.id
            const isGrid = bot.type.toUpperCase() === 'GRID'
            const gridLevels = bot.grid_levels || []

            return (
            <div 
                key={bot.id} 
                onClick={() => toggleExpand(bot.id, bot.type)}
                className={cn(
                    "flex flex-col p-2 rounded-lg bg-background-elevated/30 border border-white/5 transition-colors group text-[11px] font-mono",
                    isGrid ? "hover:border-white/20 cursor-pointer" : ""
                )}
            >
                <div className="grid grid-cols-[30px_60px_1fr_120px_80px_80px_80px] gap-2 items-center">
                    {/* Status Icon */}
                    <div className="flex justify-start pl-1">
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            bot.status === 'active' ? "bg-accent-green animate-pulse" : "bg-yellow-500"
                        )} />
                    </div>

                    {/* Type */}
                    <div className="text-accent-cyan font-bold uppercase text-[9px] flex items-center gap-1">
                        {bot.type}
                        {isGrid && (
                            isExpanded ? <ChevronUp size={10} className="text-text-muted" /> : <ChevronDown size={10} className="text-text-muted" />
                        )}
                    </div>

                    {/* Pair */}
                    <div className="text-white font-bold truncate">
                        {bot.input_symbol} <span className="text-text-muted">→</span> {bot.output_symbol}
                    </div>

                    {/* Range / Amount */}
                    <div className="text-text-secondary text-[10px]">
                        {isGrid && bot.lower_bound && bot.upper_bound
                            ? `${bot.lower_bound} - ${bot.upper_bound}`
                            : (bot.type === 'TWAP' || bot.type === 'DCA') && bot.amount
                                ? `${bot.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${bot.input_symbol}`
                                : '-'
                        }
                    </div>

                    {/* PnL */}
                    <div className="text-accent-cyan font-bold text-right">
                        ${bot.profit_realized?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}
                    </div>

                    {/* Trades Progress */}
                    <div className="text-white text-right">
                        {bot.run_count || 0}
                        {(bot.type === 'TWAP' || bot.type === 'DCA') && bot.max_runs && (
                            <span className="text-text-muted ml-1">/ {bot.max_runs}</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-1.5">
                        <button 
                            onClick={(e) => handlePauseBot(e, bot.id, bot.status)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-text-secondary hover:text-white transition-colors"
                            title={bot.status === 'active' ? 'Pause' : 'Resume'}
                        >
                            {bot.status === 'active' ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                        <button 
                            onClick={(e) => handleDeleteBot(e, bot.id)}
                            className="p-1.5 bg-accent-red/10 hover:bg-accent-red/20 text-accent-red rounded-lg transition-colors"
                            title="Stop"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>

                {/* Expanded Grid Levels */}
                {isExpanded && gridLevels.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/5 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-3 gap-2 px-2 pb-1 text-[9px] font-bold text-text-muted uppercase tracking-wider">
                            <div>Level Price</div>
                            <div>Status</div>
                            <div className="text-right">Held Amount</div>
                        </div>
                        <div className="max-h-32 overflow-auto custom-scrollbar space-y-0.5">
                            {[...gridLevels].reverse().map((level, i) => (
                                <div key={i} className={cn(
                                    "grid grid-cols-3 gap-2 px-2 py-1 rounded text-[10px] items-center transition-colors",
                                    level.has_position ? "bg-accent-green/5 text-accent-green" : "text-text-secondary"
                                )}>
                                    <div>${level.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                    <div className="uppercase text-[9px] font-bold">
                                        {level.has_position ? 'Holding (Sell)' : 'Waiting (Buy)'}
                                    </div>
                                    <div className="text-right font-mono">
                                        {level.has_position && level.token_amount > 0 
                                            ? `${level.token_amount.toLocaleString(undefined, {maximumFractionDigits: 4})} ${bot.output_symbol}`
                                            : '-'
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
          )
        })
      )}
      </div>
    </div>
  )
}