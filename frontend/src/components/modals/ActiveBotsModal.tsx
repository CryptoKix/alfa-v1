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
        className="bg-background-card border border-accent-cyan/20 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient top line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-pink/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-accent-cyan/10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <Activity size={20} className="text-accent-cyan" />
              Bot Strategies
            </h2>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setActiveTab('active')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  activeTab === 'active'
                    ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30"
                    : "text-white/40 hover:text-white/70 border border-transparent"
                )}
              >
                Active ({activeBots.length})
              </button>
              <button
                onClick={() => setActiveTab('inactive')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  activeTab === 'inactive'
                    ? "bg-accent-pink/10 text-accent-pink border border-accent-pink/30"
                    : "text-white/40 hover:text-white/70 border border-transparent"
                )}
              >
                Inactive ({inactiveBots.length})
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent-cyan/10 rounded-lg text-white/40 hover:text-accent-cyan transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,255,0.2) transparent' }}>
          {displayedBots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/30 gap-4">
              <Activity size={40} strokeWidth={1} className="text-accent-cyan/30" />
              <div className="text-center">
                <div className="font-medium text-sm text-white/50">
                  {activeTab === 'active' ? 'No Active Bots' : 'No Inactive Bots'}
                </div>
                <div className="text-xs mt-1 text-white/30">
                  {activeTab === 'active' ? 'Create a new strategy to get started' : 'All bots are currently active'}
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
                    "bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-5 flex flex-col gap-4 transition-all",
                    isGrid ? "cursor-pointer hover:bg-accent-cyan/[0.05] hover:border-accent-cyan/20" : "",
                    isExpanded ? "border-accent-cyan/20 bg-accent-cyan/[0.04]" : ""
                  )}
               >
                  <div className="flex items-start justify-between">
                     <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            bot.status === 'active' ? "bg-accent-cyan shadow-[0_0_8px_rgba(0,255,255,0.5)]" : bot.status === 'paused' ? "bg-accent-pink" : "bg-white/20"
                          )} />
                        </div>
                        <div>
                           <div className="text-base font-semibold text-white flex items-center gap-3">
                             {editingBotId === bot.id ? (
                               <div className="flex items-center gap-2 bg-accent-cyan/5 border border-accent-cyan/20 rounded-lg px-2 py-1">
                                 <input
                                   autoFocus
                                   value={editValue}
                                   onChange={e => setEditValue(e.target.value)}
                                   onKeyDown={e => e.key === 'Enter' && handleRename(bot.id)}
                                   className="bg-transparent outline-none text-sm text-white w-48"
                                 />
                                 <button onClick={() => handleRename(bot.id)} className="text-accent-cyan/70 hover:text-accent-cyan transition-colors">
                                   <Check size={14} />
                                 </button>
                                 <button onClick={() => setEditingBotId(null)} className="text-white/70 hover:text-white transition-colors">
                                   <X size={14} />
                                 </button>
                               </div>
                             ) : (
                               <div className="flex items-center gap-2 group/alias">
                                 {bot.alias ? bot.alias : (
                                   <>
                                     {bot.input_symbol} <span className="text-accent-cyan/50">→</span> {bot.output_symbol}
                                   </>
                                 )}
                                 <button
                                   onClick={(e) => { e.stopPropagation(); setEditingBotId(bot.id); setEditValue(bot.alias || '') }}
                                   className="opacity-0 group-hover/alias:opacity-100 p-1 hover:bg-accent-cyan/10 rounded transition-all text-white/30 hover:text-accent-cyan"
                                 >
                                   <Edit2 size={12} />
                                 </button>
                               </div>
                             )}
                             <span className="text-[10px] px-2 py-0.5 rounded bg-accent-purple/10 text-accent-purple font-medium border border-accent-purple/20">
                               {bot.type || 'N/A'}
                             </span>
                             {(isGrid || bot.type?.toLowerCase() === 'twap') && (
                               <div className={cn("transition-transform duration-300", isExpanded && "rotate-180")}>
                                 <ChevronDown size={16} className="text-accent-cyan/50" />
                               </div>
                             )}
                           </div>
                           <div className="text-[11px] text-white/30 mt-1 flex items-center gap-2 font-mono">
                             <span>ID: {bot.id}</span>
                             {bot.alias && (
                               <>
                                 <span className="text-white/10">•</span>
                                 <span>{bot.input_symbol}/{bot.output_symbol}</span>
                               </>
                             )}
                           </div>
                        </div>
                     </div>
                     <div className="flex items-center gap-6">
                        <div className="text-right">
                           <div className="text-lg font-semibold font-mono text-accent-cyan">
                              ${Number(bot.grid_yield || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                           </div>
                           <div className="text-[10px] text-white/40 mt-0.5">
                             Bot Yield
                           </div>
                        </div>
                        <div className="w-px h-8 bg-accent-cyan/10" />
                        <div className="text-right">
                           <div className={cn(
                             "text-xl font-semibold font-mono",
                             Number(bot.profit_realized || 0) >= 0 ? "text-accent-cyan" : "text-accent-pink"
                           )}>
                              ${Number(bot.profit_realized || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                           </div>
                           <div className="text-[10px] text-white/40 mt-0.5">
                             Overall PnL
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* TWAP Specific Details */}
                  {bot.type?.toLowerCase() === 'twap' && (
                     <div className="grid grid-cols-3 gap-4 py-3 border-t border-accent-cyan/10 mt-2">
                        <div>
                           <div className="text-[10px] text-accent-cyan/50 mb-1">Progress</div>
                           <div className="text-sm font-mono text-white">
                             {bot.run_count} / {bot.max_runs} <span className="text-white/30">runs</span>
                           </div>
                        </div>
                         <div>
                           <div className="text-[10px] text-accent-cyan/50 mb-1">Avg Entry</div>
                           <div className="text-sm font-mono text-white">
                             ${Number(bot.avg_buy_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] text-accent-cyan/50 mb-1">Accumulated</div>
                           <div className="text-sm font-mono text-accent-cyan">
                             {Number(bot.total_bought || 0).toLocaleString(undefined, {maximumFractionDigits: 4})} {bot.output_symbol}
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Grid Specific Details */}
                  {isGrid && (
                     <div className="grid grid-cols-4 gap-4 py-3 border-t border-accent-cyan/10 mt-2">
                        <div>
                           <div className="text-[10px] text-accent-cyan/50 mb-1">Price Range</div>
                           <div className="text-sm font-mono text-white">
                             ${bot.lower_bound} <span className="text-accent-pink">–</span> ${bot.upper_bound}
                           </div>
                        </div>
                        <div>
                           <div className="text-[10px] text-accent-cyan/50 mb-1">Hysteresis</div>
                           <div className="text-sm font-mono text-accent-purple">
                             {bot.hysteresis || 0}%
                           </div>
                        </div>
                         <div>
                           <div className="text-[10px] text-accent-cyan/50 mb-1">Grid Levels</div>
                           <div className="text-sm font-mono text-white">
                             {bot.steps}
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] text-accent-cyan/50 mb-1">Executions</div>
                           <div className="text-sm font-mono text-accent-cyan">
                             {bot.run_count || 0}
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Expanded Grid Levels Visualization */}
                  {isExpanded && gridLevels.length > 0 && (
                    <div className="mt-2 pt-4 border-t border-accent-cyan/10 animate-in slide-in-from-top-4 duration-300">
                        <div className="grid grid-cols-3 gap-4 px-3 pb-2 text-[10px] text-accent-cyan/50">
                            <div>Price Level</div>
                            <div>Status</div>
                            <div className="text-right">Amount</div>
                        </div>
                        <div className="max-h-64 overflow-auto space-y-1 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,255,0.2) transparent' }}>
                            {[...gridLevels].reverse().map((level, i) => (
                                <div key={i} className={cn(
                                    "grid grid-cols-3 gap-4 px-3 py-2 rounded-lg text-sm items-center font-mono",
                                    level.has_position ? "bg-accent-cyan/[0.05] border border-accent-cyan/10" : "bg-transparent"
                                )}>
                                    <div className="text-white">${level.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                    <div className="text-[11px] text-white/50">
                                        {level.has_position ? (
                                          <span className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,255,255,0.5)]" />
                                            <span className="text-accent-cyan">Holding</span>
                                          </span>
                                        ) : 'Waiting'}
                                    </div>
                                    <div className="text-right text-white/70">
                                        {level.has_position && level.token_amount !== undefined && level.token_amount !== null ? (
                                            <span className="text-accent-cyan">
                                              {level.token_amount.toLocaleString(undefined, {maximumFractionDigits: 4})} {bot.output_symbol}
                                            </span>
                                        ) : <span className="text-white/20">—</span>
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}

                  {bot.status !== 'completed' && (
                    <div className="flex justify-end pt-2 gap-2" onClick={(e) => e.stopPropagation()}>
                       {isGrid && (
                         <>
                           <button
                              onClick={() => handleUpdateConfig(bot.id, { trailing_enabled: !bot.trailing_enabled })}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
                                bot.trailing_enabled
                                  ? "bg-accent-purple/10 border-accent-purple/30 text-accent-purple"
                                  : "bg-transparent border-accent-cyan/10 text-white/50 hover:text-accent-cyan hover:border-accent-cyan/30"
                              )}
                           >
                              <Activity size={12} />
                              Trailing {bot.trailing_enabled ? 'On' : 'Off'}
                           </button>
                           <button
                              onClick={() => handleMonitor(bot.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cyan/5 hover:bg-accent-cyan/10 border border-accent-cyan/20 rounded-lg text-accent-cyan/70 hover:text-accent-cyan text-[11px] font-medium transition-colors"
                           >
                              <Eye size={12} />
                              Monitor
                           </button>
                         </>
                       )}
                       <button
                          onClick={() => onPause(bot.id, bot.status)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[11px] font-medium transition-colors",
                            bot.status === 'active'
                              ? "bg-accent-pink/5 hover:bg-accent-pink/10 border-accent-pink/20 text-accent-pink/70 hover:text-accent-pink"
                              : "bg-accent-cyan/5 hover:bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan/70 hover:text-accent-cyan"
                          )}
                       >
                          {bot.status === 'active' ? <Pause size={12} /> : <RefreshCw size={12} />}
                          {bot.status === 'active' ? 'Pause' : 'Resume'}
                       </button>

                       {confirmDeleteId === bot.id ? (
                         <div className="flex items-center gap-2 bg-accent-pink/5 border border-accent-pink/20 rounded-lg px-3 py-1.5 animate-in fade-in">
                           <span className="text-[11px] text-white/70">Confirm?</span>
                           <button
                             onClick={() => {
                               onDelete(bot.id)
                               setConfirmDeleteId(null)
                               dispatch(addNotification({
                                 title: 'Bot Stopped',
                                 message: `${bot.alias || bot.id} has been stopped.`,
                                 type: 'info'
                               }))
                             }}
                             className="px-2 py-0.5 bg-accent-pink text-black rounded text-[11px] font-medium hover:bg-accent-pink/80 transition-all"
                           >
                             Yes
                           </button>
                           <button
                             onClick={() => setConfirmDeleteId(null)}
                             className="px-2 py-0.5 bg-white/10 text-white rounded text-[11px] font-medium hover:bg-white/20 transition-all"
                           >
                             No
                           </button>
                         </div>
                       ) : (
                         <button
                            onClick={() => setConfirmDeleteId(bot.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-pink/5 hover:bg-accent-pink/10 border border-accent-pink/20 rounded-lg text-accent-pink/70 hover:text-accent-pink text-[11px] font-medium transition-colors"
                         >
                            <Trash2 size={12} />
                            Stop
                         </button>
                       )}
                    </div>
                  )}
               </div>
            )})
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-accent-cyan/10 flex justify-between items-center shrink-0">
           <div className="text-[11px] text-accent-cyan/50 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,255,255,0.5)] animate-pulse" />
              Live
           </div>
           <button
              onClick={onCreateNew}
              className="px-5 py-2.5 bg-gradient-to-r from-accent-cyan to-accent-purple text-black hover:opacity-90 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,255,255,0.2)]"
           >
              <Plus size={16} />
              New Strategy
           </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
