import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2, Activity, Pause, RefreshCw, ChevronDown, Plus, Edit2, Check, Eye } from 'lucide-react'
import { Bot, setMonitorBotId } from '@/features/bots/botsSlice'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/app/hooks'

interface ActiveBotsModalProps {
  isOpen: boolean
  onClose: () => void
  bots: Bot[]
  onDelete: (id: string) => void
  onPause: (id: string, currentStatus: string) => void
  onCreateNew: () => void
}

export const ActiveBotsModal = ({ isOpen, onClose, bots = [], onDelete, onPause, onCreateNew }: ActiveBotsModalProps) => {
  const dispatch = useAppDispatch()
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active')
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null)
  const [editingBotId, setEditingBotId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  
  const activeBots = useMemo(() => bots.filter(b => b && b.status === 'active'), [bots])
  const inactiveBots = useMemo(() => bots.filter(b => b && (b.status === 'paused' || b.status === 'completed' || b.status === 'deleted')), [bots])
  
  const displayedBots = activeTab === 'active' ? activeBots : inactiveBots

  if (!isOpen) return null

  const toggleExpand = (id: string, botType?: string) => {
    const type = botType?.toLowerCase()
    if (type !== 'grid' && type !== 'twap') return
    setExpandedBotId(prev => prev === id ? null : id)
  }

  const handleMonitor = (botId: string) => {
    dispatch(setMonitorBotId(botId))
    onClose()
  }

  const handleUpdateConfig = async (id: string, updates: any) => {
    try {
      await fetch('/api/dca/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates })
      })
    } catch (e) {
      console.error("Failed to update bot config", e)
    }
  }

  const handleRename = async (id: string) => {
    try {
      await fetch('/api/dca/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, alias: editValue })
      })
      setEditingBotId(null)
    } catch (e) {
      console.error("Failed to rename bot", e)
    }
  }

  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-background-card border border-white/15 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink z-20" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 shrink-0 bg-background-card relative z-10">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
              <div className="p-2 bg-accent-cyan/10 rounded-xl text-accent-cyan">
                <Activity size={28} />
              </div>
              Bot Strategies
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <button 
                onClick={() => setActiveTab('active')}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors",
                  activeTab === 'active' 
                      ? "bg-accent-green text-black shadow-glow-green" 
                      : "text-text-muted hover:text-white"
                )}
              >
                Active ({activeBots.length})
              </button>
              <button 
                onClick={() => setActiveTab('inactive')}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors",
                  activeTab === 'inactive' 
                      ? "bg-accent-red text-white shadow-glow-red" 
                      : "text-text-muted hover:text-white"
                )}
              >
                Inactive ({inactiveBots.length})
              </button>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-white/5 rounded-2xl text-text-muted hover:text-white transition-all"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto custom-scrollbar p-8 space-y-6">
          {displayedBots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-text-muted opacity-30 gap-4">
              <Activity size={48} strokeWidth={1} />
              <div className="text-center">
                <div className="font-black text-lg uppercase tracking-[0.3em]">
                  {activeTab === 'active' ? 'No Active Engines' : 'No Inactive Engines'}
                </div>
                <div className="text-xs mt-1 uppercase tracking-widest">
                  {activeTab === 'active' ? 'Awaiting tactical initialization' : 'All engines are active or deleted'}
                </div>
              </div>
            </div>
          ) : (
            displayedBots.map(bot => {
               const isExpanded = expandedBotId === bot.id
               const gridLevels = bot.grid_levels || []
               const isGrid = bot.type?.toLowerCase() === 'grid'
               
               return (
               <div 
                  key={bot.id} 
                  onClick={() => isGrid ? handleMonitor(bot.id) : toggleExpand(bot.id, bot.type)}
                  className={cn(
                    "bg-background-elevated/20 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 group transition-all duration-500",
                    isGrid ? "cursor-pointer hover:bg-background-elevated/40 hover:border-white/20 shadow-lg hover:shadow-accent-cyan/5" : "",
                    isExpanded ? "border-accent-purple/30 bg-background-elevated/50" : ""
                  )}
               >
                  <div className="flex items-start justify-between">
                     <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className={cn(
                            "w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]",
                            bot.status === 'active' ? "text-accent-green bg-accent-green animate-pulse" : bot.status === 'paused' ? "text-yellow-500 bg-yellow-500" : "text-text-muted bg-text-muted"
                          )} />
                        </div>
                        <div>
                           <div className="text-lg font-black text-white flex items-center gap-3 tracking-tight">
                             {editingBotId === bot.id ? (
                               <div className="flex items-center gap-2 bg-black/40 border border-accent-cyan/30 rounded-lg px-2 py-1">
                                 <input 
                                   autoFocus
                                   value={editValue}
                                   onChange={e => setEditValue(e.target.value)}
                                   onKeyDown={e => e.key === 'Enter' && handleRename(bot.id)}
                                   className="bg-transparent outline-none text-sm font-bold text-white w-48"
                                 />
                                 <button onClick={() => handleRename(bot.id)} className="text-accent-green hover:scale-110 transition-transform">
                                   <Check size={16} />
                                 </button>
                                 <button onClick={() => setEditingBotId(null)} className="text-accent-pink hover:scale-110 transition-transform">
                                   <X size={16} />
                                 </button>
                               </div>
                             ) : (
                               <div className="flex items-center gap-2 group/alias">
                                 {bot.alias ? bot.alias : (
                                   <>
                                     {bot.input_symbol} <span className="text-text-muted opacity-50">→</span> {bot.output_symbol}
                                   </>
                                 )}
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); setEditingBotId(bot.id); setEditValue(bot.alias || '') }}
                                   className="opacity-0 group-hover/alias:opacity-100 p-1 hover:bg-white/5 rounded transition-all text-text-muted hover:text-accent-cyan"
                                 >
                                   <Edit2 size={12} />
                                 </button>
                               </div>
                             )}
                             <span className={cn(
                               "text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border",
                               bot.status === 'active' ? "bg-accent-green/10 text-accent-green border-accent-green/20" : "bg-white/5 text-text-muted border-white/10"
                             )}>
                               {bot.type || 'N/A'} | {bot.status}
                             </span>
                             {bot.phase === 'monitoring_profit' && (
                               <span className="text-[8px] px-1.5 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 font-bold animate-pulse">
                                 SNIPE MODE ACTIVE
                               </span>
                             )}
                             {(isGrid || bot.type?.toLowerCase() === 'twap') && (
                               <div className={cn("transition-transform duration-500", isExpanded && "rotate-180")}>
                                 <ChevronDown size={18} className="text-text-muted" />
                               </div>
                             )}
                           </div>
                           <div className="text-[10px] font-mono text-text-muted mt-1 uppercase tracking-widest flex items-center gap-2">
                             <span className="opacity-50 tracking-normal text-[8px]">ID:</span>
                             <span className="font-bold">{bot.id}</span>
                             {bot.alias && (
                               <>
                                 <span className="opacity-50 tracking-normal text-[8px] ml-2">PAIR:</span>
                                 <span className="font-bold">{bot.input_symbol}/{bot.output_symbol}</span>
                               </>
                             )}
                           </div>
                        </div>
                     </div>
                     <div className="flex items-center gap-6">
                        <div className="text-right">
                           <div className="text-lg font-black font-mono text-accent-cyan tracking-tighter flex items-center justify-end gap-1">
                              <span className="text-[10px] opacity-50">$</span>
                              {Number(bot.grid_yield || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                           </div>
                           <div className="text-[8px] text-accent-cyan font-black uppercase tracking-[0.2em] mt-0.5 opacity-80">
                             Actual Bot Yield
                           </div>
                        </div>
                        <div className="w-px h-8 bg-white/5" />
                        <div className="text-right">
                           <div className={cn(
                             "text-xl font-black font-mono tracking-tighter flex items-center justify-end gap-1",
                             Number(bot.profit_realized || 0) >= 0 ? "text-white" : "text-accent-red"
                           )}>
                              <span className="text-[10px] opacity-50">$</span>
                              {Number(bot.profit_realized || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                           </div>
                           <div className="text-[9px] text-text-muted font-black uppercase tracking-[0.2em] mt-0.5">
                             Overall PnL
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* TWAP Specific Details */}
                  {bot.type?.toLowerCase() === 'twap' && (
                     <div className="grid grid-cols-3 gap-4 py-3 border-y border-white/5 bg-black/30 rounded-xl px-4 text-left">
                        <div>
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50 text-left">Progress</div>
                           <div className="text-xs font-black font-mono text-white flex items-center gap-2">
                             <span className="text-accent-cyan">{bot.run_count}</span>
                             <span className="text-text-muted text-[10px]">/</span>
                             <span className="text-white">{bot.max_runs}</span>
                             <span className="text-[10px] text-text-muted">runs</span>
                           </div>
                        </div>
                         <div>
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50 text-left">Avg Entry</div>
                           <div className="text-xs font-black font-mono text-accent-purple">
                             ${Number(bot.avg_buy_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50">Accumulated</div>
                           <div className="text-xs font-black font-mono text-accent-green">
                             {Number(bot.total_bought || 0).toLocaleString(undefined, {maximumFractionDigits: 4})} {bot.output_symbol}
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Grid Specific Details */}
                  {isGrid && (
                     <div className="grid grid-cols-3 gap-4 py-3 border-y border-white/5 bg-black/30 rounded-xl px-4">
                        <div>
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50">Range Protocol</div>
                           <div className="text-xs font-black font-mono text-white flex items-center gap-2">
                             <span className="text-accent-cyan">${bot.lower_bound}</span>
                             <span className="text-text-muted text-[10px]">---</span>
                             <span className="text-accent-pink">${bot.upper_bound}</span>
                           </div>
                        </div>
                         <div>
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50">Density</div>
                           <div className="text-xs font-black font-mono text-white">
                             {bot.steps} <span className="text-[10px] text-text-muted">LVLS</span>
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 opacity-50">Execution Count</div>
                           <div className="text-xs font-black font-mono text-accent-green">
                             {bot.run_count || 0}
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
                                        ) : 'SCAN / BUY'}
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

                  {bot.status !== 'completed' && (
                    <div className="flex justify-end pt-2 gap-3" onClick={(e) => e.stopPropagation()}>
                       {isGrid && (
                         <>
                           <button 
                              onClick={() => handleUpdateConfig(bot.id, { trailing_enabled: !bot.trailing_enabled })}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                                bot.trailing_enabled 
                                  ? "bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan" 
                                  : "bg-white/5 border-white/10 text-text-muted hover:text-white"
                              )}
                              title={bot.trailing_enabled ? 'Disable Trailing' : 'Enable Trailing'}
                           >
                              <Activity size={12} className={cn(bot.trailing_enabled && "animate-pulse")} />
                              Trailing {bot.trailing_enabled ? 'ON' : 'OFF'}
                           </button>
                           <button 
                              onClick={() => handleMonitor(bot.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/20 rounded-lg text-accent-cyan text-[10px] font-bold uppercase tracking-wider transition-colors"
                           >
                              <Eye size={12} />
                              Monitor Engine
                           </button>
                         </>
                       )}
                       <button 
                          onClick={() => onPause(bot.id, bot.status)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-text-muted hover:text-white text-[10px] font-bold uppercase tracking-wider transition-colors"
                       >
                          {bot.status === 'active' ? <Pause size={12} /> : <RefreshCw size={12} />}
                          {bot.status === 'active' ? 'Pause' : 'Resume'}
                       </button>
                       
                       {confirmDeleteId === bot.id ? (
                         <div className="flex items-center gap-2 bg-accent-red/10 border border-accent-red/20 rounded-lg px-2 py-1 animate-in fade-in zoom-in-95">
                           <span className="text-[9px] font-black text-accent-red uppercase tracking-tighter">Confirm Termination?</span>
                           <button 
                             onClick={() => {
                               onDelete(bot.id)
                               setConfirmDeleteId(null)
                               dispatch(addNotification({
                                 title: 'Strategy Terminated',
                                 message: `Engine ${bot.alias || bot.id} has been decommissioned.`,
                                 type: 'info'
                               }))
                             }}
                             className="px-2 py-1 bg-accent-red text-white rounded text-[9px] font-black uppercase hover:bg-white hover:text-accent-red transition-all"
                           >
                             Yes, Stop
                           </button>
                           <button 
                             onClick={() => setConfirmDeleteId(null)}
                             className="px-2 py-1 bg-white/10 text-white rounded text-[9px] font-black uppercase hover:bg-white/20 transition-all"
                           >
                             Cancel
                           </button>
                         </div>
                       ) : (
                         <button 
                            onClick={() => setConfirmDeleteId(bot.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-red/10 hover:bg-accent-red/20 border border-accent-red/20 rounded-lg text-accent-red text-[10px] font-bold uppercase tracking-wider transition-colors"
                         >
                            <Trash2 size={12} />
                            Stop Engine
                         </button>
                       )}
                    </div>
                  )}
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