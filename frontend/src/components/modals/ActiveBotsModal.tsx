import { useState } from 'react'
import { X, Play, Trash2, Activity, Pause, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { Bot } from '@/features/bots/botsSlice'
import { cn } from '@/lib/utils'

interface ActiveBotsModalProps {
  isOpen: boolean
  onClose: () => void
  bots: Bot[]
  type: string
  onDelete: (id: string) => void
  onPause: (id: string, currentStatus: string) => void
  onCreateNew: () => void
}

export const ActiveBotsModal = ({ isOpen, onClose, bots, type, onDelete, onPause, onCreateNew }: ActiveBotsModalProps) => {
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null)
  
  if (!isOpen) return null
  
  const isAll = type.toLowerCase() === 'all'
  const filteredBots = bots.filter(b => b && (isAll || b.type.toLowerCase() === type.toLowerCase()) && b.status !== 'deleted')
  const activeBots = filteredBots.filter(b => b.status === 'active')
  const completedBots = filteredBots.filter(b => b.status === 'completed')

  const toggleExpand = (id: string, botType: string) => {
    if (botType.toLowerCase() !== 'grid') return
    setExpandedBotId(prev => prev === id ? null : id)
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-background-card border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="text-accent-cyan" size={24} />
              {isAll ? 'All Active Strategies' : `Active ${type.toUpperCase()} Bots`}
            </h2>
            <div className="text-xs text-text-muted mt-1 uppercase tracking-widest">
              {activeBots.length} Running · {completedBots.length} Completed
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full text-text-muted hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-4">
          {filteredBots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-text-muted opacity-50">
              <div className="font-bold text-sm uppercase tracking-widest mb-2">No Active Bots</div>
              <div className="text-xs">Start a new strategy to see it here</div>
            </div>
          ) : (
            filteredBots.map(bot => {
               const isExpanded = expandedBotId === bot.id
               const gridLevels = bot.grid_levels || []
               const isGrid = bot.type.toLowerCase() === 'grid'
               
               return (
               <div 
                  key={bot.id} 
                  onClick={() => toggleExpand(bot.id, bot.type)}
                  className={cn(
                    "bg-background-elevated/30 border border-white/5 rounded-xl p-4 flex flex-col gap-3 group hover:border-white/10 transition-colors",
                    isGrid ? "cursor-pointer" : ""
                  )}
               >
                  <div className="flex items-start justify-between">
                     <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          bot.status === 'active' ? "bg-accent-green animate-pulse" : bot.status === 'paused' ? "bg-yellow-500" : "bg-text-muted"
                        )} />
                        <div>
                           <div className="text-sm font-bold text-white flex items-center gap-2">
                             {bot.input_symbol} <span className="text-text-muted">→</span> {bot.output_symbol}
                             <span className={cn(
                               "text-[10px] px-1.5 py-0.5 rounded text-text-muted uppercase tracking-wider font-mono",
                               bot.status === 'active' ? "bg-accent-green/10 text-accent-green" : "bg-white/5"
                             )}>{bot.type} | {bot.status}</span>
                             {isGrid && (
                               isExpanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />
                             )}
                           </div>
                           <div className="text-[10px] font-mono text-text-muted mt-0.5">ID: {bot.id}</div>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="text-xs font-mono font-bold text-accent-cyan">
                           ${(bot as any).profit_realized?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}
                        </div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider">PnL</div>
                     </div>
                  </div>

                  {/* Grid Specific Details */}
                  {isGrid && (
                     <div className="grid grid-cols-3 gap-2 py-2 border-y border-white/5 bg-black/20 rounded-lg px-3">
                        <div>
                           <div className="text-[8px] text-text-muted uppercase tracking-wider mb-0.5">Range</div>
                           <div className="text-[10px] font-mono text-white">
                             ${(bot as any).lower_bound} - ${(bot as any).upper_bound}
                           </div>
                        </div>
                         <div>
                           <div className="text-[8px] text-text-muted uppercase tracking-wider mb-0.5">Grids</div>
                           <div className="text-[10px] font-mono text-white">
                             {(bot as any).steps} Levels
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[8px] text-text-muted uppercase tracking-wider mb-0.5">Trades</div>
                           <div className="text-[10px] font-mono text-white">
                             {(bot as any).run_count || 0}
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Expanded Grid Levels Visualization */}
                  {isExpanded && gridLevels.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-3 gap-2 px-3 pb-2 text-[9px] font-bold text-text-muted uppercase tracking-wider">
                            <div>Level Price</div>
                            <div>Status</div>
                            <div className="text-right">Held Amount</div>
                        </div>
                        <div className="max-h-48 overflow-auto custom-scrollbar space-y-1">
                            {[...gridLevels].reverse().map((level, i) => (
                                <div key={i} className={cn(
                                    "grid grid-cols-3 gap-2 px-3 py-2 rounded-lg text-[10px] items-center transition-colors font-mono",
                                    level.has_position ? "bg-accent-green/5 text-accent-green border border-accent-green/10" : "bg-black/20 text-text-secondary border border-white/5"
                                )}>
                                    <div className="font-bold">${level.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                    <div className="uppercase text-[9px] font-black">
                                        {level.has_position ? (
                                          <span className="flex items-center gap-1.5">
                                            <div className="w-1 h-1 rounded-full bg-accent-green animate-pulse" />
                                            Holding (Sell)
                                          </span>
                                        ) : 'Waiting (Buy)'}
                                    </div>
                                    <div className="text-right font-black">
                                        {level.has_position && level.token_amount !== undefined && level.token_amount !== null ? (
                                            `${level.token_amount.toLocaleString(undefined, {maximumFractionDigits: 4})} ${bot.output_symbol}`
                                        ) : '-'
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 gap-2" onClick={(e) => e.stopPropagation()}>
                     <button 
                        onClick={() => onPause(bot.id, bot.status)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-text-muted hover:text-white text-[10px] font-bold uppercase tracking-wider transition-colors"
                     >
                        {bot.status === 'active' ? <Pause size={12} /> : <RefreshCw size={12} />}
                        {bot.status === 'active' ? 'Pause' : 'Resume'}
                     </button>
                     <button 
                        onClick={() => onDelete(bot.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-red/10 hover:bg-accent-red/20 border border-accent-red/20 rounded-lg text-accent-red text-[10px] font-bold uppercase tracking-wider transition-colors"
                     >
                        <Trash2 size={12} />
                        Terminate
                     </button>
                  </div>
               </div>
            )})
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-background-elevated/50 flex justify-end gap-3 shrink-0">
           <button 
              onClick={onCreateNew}
              className="px-6 py-3 bg-accent-cyan text-black hover:bg-white border border-accent-cyan rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-[0_0_20px_rgba(0,255,255,0.2)] hover:shadow-[0_0_40px_rgba(0,255,255,0.4)] flex items-center gap-3 transform hover:-translate-y-0.5 active:scale-95"
           >
              <Plus size={16} strokeWidth={3} />
              Initialize New Engine
           </button>
        </div>
      </div>
    </div>
  )
}
