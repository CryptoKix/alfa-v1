import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, Trash2, Activity, Pause, RefreshCw, ChevronDown, ChevronUp, Plus } from 'lucide-react'
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

export const ActiveBotsModal = ({ isOpen, onClose, bots = [], type, onDelete, onPause, onCreateNew }: ActiveBotsModalProps) => {
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null)
  
  if (!isOpen) return null
  
  const safeType = type || 'all'
  const isAll = safeType.toLowerCase() === 'all'
  const filteredBots = bots.filter(b => b && (isAll || (b.type?.toLowerCase() === safeType.toLowerCase())) && b.status !== 'deleted')
  const activeBots = filteredBots.filter(b => b.status === 'active')
  const completedBots = filteredBots.filter(b => b.status === 'completed')

  const toggleExpand = (id: string, botType?: string) => {
    if (botType?.toLowerCase() !== 'grid') return
    setExpandedBotId(prev => prev === id ? null : id)
  }

  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-background-card border border-white/15 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink shadow-[0_0_15px_rgba(0,255,255,0.3)] z-20" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 shrink-0 bg-background-card/50 backdrop-blur-xl relative z-10">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
              <div className="p-2 bg-accent-cyan/10 rounded-xl text-accent-cyan shadow-[0_0_15px_rgba(0,255,255,0.1)]">
                <Activity size={28} />
              </div>
              {isAll ? 'Master Engine Controller' : `${safeType.toUpperCase()} Engine Deployment`}
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent-green/10 border border-accent-green/20 rounded text-[10px] font-bold text-accent-green tracking-widest uppercase">
                {activeBots.length} Online
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-bold text-text-muted tracking-widest uppercase">
                {completedBots.length} Fulfilled
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-white/5 rounded-2xl text-text-muted hover:text-white transition-all transform hover:rotate-90"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto custom-scrollbar p-8 space-y-6">
          {filteredBots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-text-muted opacity-30 gap-4">
              <Activity size={48} strokeWidth={1} />
              <div className="text-center">
                <div className="font-black text-lg uppercase tracking-[0.3em]">No Active Engines</div>
                <div className="text-xs mt-1 uppercase tracking-widest">Awaiting tactical initialization</div>
              </div>
            </div>
          ) : (
            filteredBots.map(bot => {
               const isExpanded = expandedBotId === bot.id
               const gridLevels = bot.grid_levels || []
               const isGrid = bot.type?.toLowerCase() === 'grid'
               
               return (
               <div 
                  key={bot.id} 
                  onClick={() => toggleExpand(bot.id, bot.type)}
                  className={cn(
                    "bg-background-elevated/20 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 group transition-all duration-500",
                    isGrid ? "cursor-pointer hover:bg-background-elevated/40 hover:border-white/20 shadow-lg" : "",
                    isExpanded ? "border-accent-purple/30 bg-background-elevated/50 ring-1 ring-accent-purple/20" : ""
                  )}
               >
                  <div className="flex items-start justify-between">
                     <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className={cn(
                            "w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]",
                            bot.status === 'active' ? "text-accent-green bg-accent-green animate-pulse" : bot.status === 'paused' ? "text-yellow-500 bg-yellow-500" : "text-text-muted bg-text-muted"
                          )} />
                          {bot.status === 'active' && <div className="absolute inset-0 rounded-full bg-accent-green animate-ping opacity-20" />}
                        </div>
                        <div>
                           <div className="text-lg font-black text-white flex items-center gap-3 tracking-tight">
                             {bot.input_symbol} <span className="text-text-muted opacity-50">→</span> {bot.output_symbol}
                             <span className={cn(
                               "text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border",
                               bot.status === 'active' ? "bg-accent-green/10 text-accent-green border-accent-green/20" : "bg-white/5 text-text-muted border-white/10"
                             )}>
                               {bot.type || 'N/A'} | {bot.status}
                             </span>
                             {isGrid && (
                               <div className={cn("transition-transform duration-500", isExpanded && "rotate-180")}>
                                 <ChevronDown size={18} className="text-text-muted" />
                               </div>
                             )}
                           </div>
                           <div className="text-[10px] font-mono text-text-muted mt-1 uppercase tracking-widest flex items-center gap-2">
                             <span className="opacity-50 tracking-normal text-[8px]">ID:</span>
                             <span className="font-bold">{bot.id}</span>
                           </div>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="text-xl font-black font-mono text-accent-cyan tracking-tighter flex items-center justify-end gap-1">
                           <span className="text-[10px] opacity-50">$</span>
                           {((bot as any).profit_realized || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                        <div className="text-[9px] text-text-muted font-black uppercase tracking-[0.2em] mt-0.5">Tactical Yield</div>
                     </div>
                  </div>

                  {/* Grid Specific Details */}
                  {isGrid && (
                     <div className="grid grid-cols-3 gap-4 py-3 border-y border-white/5 bg-black/30 rounded-xl px-4">
                        <div>
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50">Range Protocol</div>
                           <div className="text-xs font-black font-mono text-white flex items-center gap-2">
                             <span className="text-accent-cyan">${(bot as any).lower_bound}</span>
                             <span className="text-text-muted text-[10px]">---</span>
                             <span className="text-accent-pink">${(bot as any).upper_bound}</span>
                           </div>
                        </div>
                         <div>
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50">Density</div>
                           <div className="text-xs font-black font-mono text-white">
                             {(bot as any).steps} <span className="text-[10px] text-text-muted">LVLS</span>
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50">Execution Count</div>
                           <div className="text-xs font-black font-mono text-accent-green">
                             {(bot as any).run_count || 0}
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Expanded Grid Levels Visualization */}
                  {isExpanded && gridLevels.length > 0 && (
                    <div className="mt-2 pt-4 border-t border-white/5 animate-in slide-in-from-top-4 duration-500">
                        <div className="grid grid-cols-3 gap-4 px-4 pb-3 text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">
                            <div>Level Calibration</div>
                            <div>Status</div>
                            <div className="text-right">Position Mass</div>
                        </div>
                        <div className="max-h-64 overflow-auto custom-scrollbar space-y-1.5 pr-2">
                            {[...gridLevels].reverse().map((level, i) => (
                                <div key={i} className={cn(
                                    "grid grid-cols-3 gap-4 px-4 py-2.5 rounded-xl text-xs items-center transition-all duration-300 border font-mono",
                                    level.has_position ? "bg-accent-green/5 text-accent-green border-accent-green/20 shadow-[inset_0_0_15px_rgba(0,255,157,0.05)]" : "bg-black/40 text-text-secondary border-white/5"
                                )}>
                                    <div className="font-black tracking-tight">${level.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                    <div className="uppercase text-[9px] font-black tracking-widest">
                                        {level.has_position ? (
                                          <span className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                                            HOLD / SELL
                                          </span>
                                        ) : (
                                          <span className="opacity-40 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-white opacity-20" />
                                            SCAN / BUY
                                          </span>
                                        )}
                                    </div>
                                    <div className="text-right font-black tracking-tighter">
                                        {level.has_position && level.token_amount !== undefined && level.token_amount !== null ? (
                                            <span className="flex items-center justify-end gap-1.5">
                                              {level.token_amount.toLocaleString(undefined, {maximumFractionDigits: 4})}
                                              <span className="text-[10px] opacity-50 uppercase font-bold">{bot.output_symbol}</span>
                                            </span>
                                        ) : <span className="opacity-20">EMPTY</span>
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 gap-3" onClick={(e) => e.stopPropagation()}>
                     <button 
                        onClick={() => onPause(bot.id, bot.status)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-text-muted hover:text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                     >
                        {bot.status === 'active' ? <Pause size={14} /> : <RefreshCw size={14} />}
                        {bot.status === 'active' ? 'Pause Engine' : 'Resume Sync'}
                     </button>
                     <button 
                        onClick={() => onDelete(bot.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-accent-red/10 hover:bg-accent-red/20 border border-accent-red/30 rounded-xl text-accent-red text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                     >
                        <Trash2 size={14} />
                        Decommission
                     </button>
                  </div>
               </div>
            )})
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/5 bg-background-elevated/30 flex justify-between items-center shrink-0">
           <div className="text-[10px] font-mono text-text-muted tracking-widest uppercase flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-accent-cyan animate-pulse" />
              Tactical Sync Active
           </div>
           <button 
              onClick={onCreateNew}
              className="px-8 py-3 bg-accent-cyan text-black hover:bg-white border border-accent-cyan rounded-2xl font-black text-xs uppercase tracking-[0.25em] transition-all duration-500 shadow-[0_0_25px_rgba(0,255,255,0.2)] hover:shadow-[0_0_45px_rgba(0,255,255,0.4)] flex items-center gap-3 transform hover:-translate-y-0.5 active:scale-95"
           >
              <Plus size={18} strokeWidth={4} />
              Deploy New Strategy
           </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
