import { useMemo, useState } from 'react'
import { X, Activity, Grid3X3, Clock, Repeat, BarChart3, Pause, Play, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'

interface GridLevel {
  price: number
  has_position: boolean
  token_amount: number
  cost_usd: number
}

interface BotData {
  id: string
  type: string
  alias?: string
  status: string
  input_symbol: string
  output_symbol: string
  input_mint: string
  output_mint: string
  lower_bound?: number
  upper_bound?: number
  grid_levels?: GridLevel[]
  run_count?: number
  max_runs?: number
  profit_realized?: number
  amount?: number
  created_at?: string
}

interface BotDetailsModalProps {
  bot: BotData
  onClose: () => void
}

export function BotDetailsModal({ bot, onClose }: BotDetailsModalProps) {
  const prices = useAppSelector(state => state.prices.prices)
  const [actionLoading, setActionLoading] = useState<'pause' | 'stop' | null>(null)

  const isActive = bot.status === 'active'
  const isPaused = bot.status === 'paused'
  const isStopped = bot.status === 'deleted' || bot.status === 'completed' || bot.status === 'stopped'
  const isGrid = bot.type?.toUpperCase() === 'GRID'

  // Only show live price for active/paused bots
  const currentPrice = isStopped ? 0 : (prices[bot.output_mint] || 0)

  const handlePauseResume = async () => {
    setActionLoading('pause')
    try {
      const newStatus = isActive ? 'paused' : 'active'
      await fetch('/api/dca/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bot.id, status: newStatus }),
      })
    } catch (err) {
      console.error('Failed to toggle bot status:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleStop = async () => {
    if (!confirm('Are you sure you want to stop this bot?')) return
    setActionLoading('stop')
    try {
      await fetch('/api/dca/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bot.id }),
      })
      onClose()
    } catch (err) {
      console.error('Failed to stop bot:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const gridLevels = bot.grid_levels || []
  const profit = bot.profit_realized || 0

  const currentLevelIndex = useMemo(() => {
    if (!currentPrice || gridLevels.length === 0) return -1
    for (let i = gridLevels.length - 1; i >= 0; i--) {
      if (gridLevels[i].price <= currentPrice) {
        return i
      }
    }
    return 0
  }, [currentPrice, gridLevels])

  const stats = useMemo(() => {
    if (!isGrid || gridLevels.length === 0) return null

    const filledLevels = gridLevels.filter(l => l.has_position).length
    const totalLevels = gridLevels.length
    const totalTokens = gridLevels.reduce((sum, l) => sum + (l.token_amount || 0), 0)
    const totalCost = gridLevels.reduce((sum, l) => sum + (l.cost_usd || 0), 0)

    // For stopped bots, don't calculate live values
    const currentValue = isStopped ? 0 : totalTokens * currentPrice
    const unrealizedPnl = isStopped ? 0 : currentValue - totalCost

    return {
      filledLevels,
      totalLevels,
      fillRate: (filledLevels / totalLevels) * 100,
      totalTokens,
      totalCost,
      currentValue,
      unrealizedPnl,
    }
  }, [isGrid, gridLevels, currentPrice, isStopped])

  const getTypeIcon = () => {
    switch (bot.type?.toUpperCase()) {
      case 'GRID': return <Grid3X3 size={16} />
      case 'DCA': return <Repeat size={16} />
      case 'TWAP': return <Clock size={16} />
      case 'VWAP': return <BarChart3 size={16} />
      default: return <Activity size={16} />
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl max-h-[85vh] bg-background-card border border-accent-cyan/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Gradient top line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-pink/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-accent-cyan/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-cyan/10 text-accent-cyan">
              {getTypeIcon()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {bot.alias || `${bot.input_symbol}/${bot.output_symbol}`}
              </h2>
              <p className="text-xs text-white/40">
                <span className="text-accent-purple">{bot.type}</span> Strategy • ID: {bot.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/40 hover:text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,255,0.2) transparent' }}>
          {/* Stopped Banner */}
          {isStopped && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <div className="text-sm text-white/50">This bot has been stopped</div>
              <div className="text-xs text-white/30 mt-1">Final realized P&L: <span className={profit >= 0 ? "text-accent-cyan" : "text-accent-pink"}>{profit >= 0 ? '+' : ''}{profit.toFixed(2)} USD</span></div>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
              <div className="text-[10px] text-accent-cyan/50 mb-1">Status</div>
              <div className={cn(
                "text-sm font-medium",
                isActive ? "text-accent-cyan" : isPaused ? "text-accent-pink" : "text-white/40"
              )}>
                {isActive ? 'Running' : isPaused ? 'Paused' : 'Stopped'}
              </div>
            </div>
            <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
              <div className="text-[10px] text-accent-cyan/50 mb-1">Executions</div>
              <div className="text-sm font-medium text-white font-mono">
                <span className="text-accent-cyan">{bot.run_count || 0}</span>
                {bot.max_runs && <span className="text-white/30">/{bot.max_runs}</span>}
              </div>
            </div>
            <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
              <div className="text-[10px] text-accent-cyan/50 mb-1">Realized P&L</div>
              <div className={cn(
                "text-sm font-medium font-mono",
                profit >= 0 ? "text-accent-cyan" : "text-accent-pink"
              )}>
                {profit >= 0 ? '+' : ''}{profit.toFixed(2)} USD
              </div>
            </div>
            <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
              <div className="text-[10px] text-accent-cyan/50 mb-1">{isStopped ? 'Final Price' : 'Current Price'}</div>
              <div className="text-sm font-medium text-white font-mono">
                {isStopped ? <span className="text-white/40">—</span> : `$${currentPrice.toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Grid-specific content */}
          {isGrid && stats && (
            <>
              {/* Grid Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-accent-purple/[0.03] border border-accent-purple/10 rounded-xl p-4">
                  <div className="text-[10px] text-accent-purple/60 mb-1">{isStopped ? 'Final Fill Rate' : 'Grid Fill Rate'}</div>
                  <div className="text-lg font-medium font-mono">
                    <span className={isStopped ? "text-white/40" : "text-accent-purple"}>{stats.filledLevels}</span>
                    <span className="text-white/30">/{stats.totalLevels}</span>
                    <span className="text-sm text-white/40 ml-2">({stats.fillRate.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                  <div className="text-[10px] text-accent-cyan/50 mb-1">{isStopped ? 'Final Holdings' : 'Holdings'}</div>
                  <div className="text-lg font-medium font-mono">
                    {isStopped ? (
                      <span className="text-white/40">Closed</span>
                    ) : (
                      <>
                        <span className="text-accent-cyan">{stats.totalTokens.toFixed(4)}</span>
                        <span className="text-sm text-white/40 ml-1">{bot.output_symbol}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                  <div className="text-[10px] text-accent-cyan/50 mb-1">{isStopped ? 'Final P&L' : 'Unrealized P&L'}</div>
                  {isStopped ? (
                    <div className="text-lg font-medium font-mono text-white/40">—</div>
                  ) : (
                    <div className={cn(
                      "text-lg font-medium font-mono",
                      stats.unrealizedPnl >= 0 ? "text-accent-cyan" : "text-accent-pink"
                    )}>
                      {stats.unrealizedPnl >= 0 ? '+' : ''}{stats.unrealizedPnl.toFixed(2)} USD
                    </div>
                  )}
                </div>
              </div>

              {/* Price Range */}
              <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                <div className="text-[10px] text-accent-cyan/50 mb-3">Price Range</div>
                <div className="flex justify-between text-xs text-white/50 mb-2">
                  <span className={isStopped ? "text-white/40" : "text-accent-pink"}>${bot.lower_bound?.toFixed(2)}</span>
                  {isStopped ? (
                    <span className="text-white/40">Bot Stopped</span>
                  ) : (
                    <span className="text-accent-cyan font-medium">Current: ${currentPrice.toFixed(2)}</span>
                  )}
                  <span className={isStopped ? "text-white/40" : "text-accent-purple"}>${bot.upper_bound?.toFixed(2)}</span>
                </div>
                <div className={cn("h-2 rounded-full relative overflow-hidden", isStopped ? "bg-white/5" : "bg-accent-cyan/5")}>
                  {gridLevels.map((level, i) => {
                    const pos = ((level.price - (bot.lower_bound || 0)) / ((bot.upper_bound || 1) - (bot.lower_bound || 0))) * 100
                    return (
                      <div
                        key={i}
                        className={cn(
                          "absolute top-0 bottom-0 w-[2px]",
                          isStopped
                            ? 'bg-white/20'
                            : level.has_position ? 'bg-accent-cyan shadow-[0_0_4px_rgba(0,255,255,0.5)]' : 'bg-accent-cyan/20'
                        )}
                        style={{ left: `${pos}%` }}
                      />
                    )
                  })}
                  {!isStopped && currentPrice >= (bot.lower_bound || 0) && currentPrice <= (bot.upper_bound || 0) && (
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-accent-pink shadow-[0_0_6px_rgba(255,0,255,0.6)]"
                      style={{
                        left: `${((currentPrice - (bot.lower_bound || 0)) / ((bot.upper_bound || 1) - (bot.lower_bound || 0))) * 100}%`
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Grid Levels Table */}
              <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-accent-cyan/10 flex items-center justify-between">
                  <div className="text-xs text-accent-cyan/70">Grid Levels</div>
                  <div className="text-[10px] text-accent-cyan/50">
                    <span className="text-accent-cyan">{stats.filledLevels}</span> positions held
                  </div>
                </div>
                <div className="max-h-64 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,255,0.2) transparent' }}>
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background-card">
                      <tr className="text-[10px] text-accent-cyan/40">
                        <th className="text-left px-4 py-2 font-medium">#</th>
                        <th className="text-left px-4 py-2 font-medium">Price</th>
                        <th className="text-center px-4 py-2 font-medium">Status</th>
                        <th className="text-right px-4 py-2 font-medium">Amount</th>
                        <th className="text-right px-4 py-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gridLevels.map((level, i) => {
                        const isCurrent = i === currentLevelIndex
                        return (
                          <tr
                            key={i}
                            className={cn(
                              "text-[11px] font-mono transition-colors",
                              isCurrent ? "bg-accent-pink/[0.08] border-l-2 border-l-accent-pink" : level.has_position ? "bg-accent-cyan/[0.03]" : ""
                            )}
                          >
                            <td className="px-4 py-2 text-white/40">
                              {i + 1}
                            </td>
                            <td className="px-4 py-2 text-white">
                              ${level.price.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[9px]",
                                level.has_position
                                  ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                                  : "bg-white/5 text-white/40"
                              )}>
                                {level.has_position ? 'Holding' : 'Waiting'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              {level.has_position && level.token_amount > 0
                                ? <span className="text-accent-cyan">{level.token_amount.toFixed(4)} {bot.output_symbol}</span>
                                : <span className="text-white/20">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right text-white/50">
                              {level.cost_usd > 0 ? `$${level.cost_usd.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Non-grid content */}
          {!isGrid && (
            <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-6 text-center">
              <Activity size={32} className="mx-auto mb-3 text-accent-cyan/30" />
              <p className="text-sm text-white/50">
                <span className="text-accent-purple">{bot.type}</span> strategy {isStopped ? 'was stopped' : 'running'}
              </p>
              <p className="text-xs text-white/30 mt-1">
                <span className="text-accent-cyan">{bot.run_count || 0}</span> executions completed
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-accent-cyan/10 flex justify-between shrink-0">
          {isStopped ? (
            <div className="text-sm text-white/40">Bot has been stopped</div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handlePauseResume}
                disabled={actionLoading !== null}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border",
                  isActive
                    ? "bg-accent-pink/5 border-accent-pink/20 text-accent-pink/70 hover:bg-accent-pink/10 hover:text-accent-pink"
                    : "bg-accent-cyan/5 border-accent-cyan/20 text-accent-cyan/70 hover:bg-accent-cyan/10 hover:text-accent-cyan"
                )}
              >
                {actionLoading === 'pause' ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isActive ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} />
                )}
                {isActive ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={handleStop}
                disabled={actionLoading !== null}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-pink/5 border border-accent-pink/20 text-accent-pink/70 hover:bg-accent-pink/10 hover:text-accent-pink transition-colors text-sm font-medium disabled:opacity-50"
              >
                {actionLoading === 'stop' ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Square size={16} />
                )}
                Stop
              </button>
            </div>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-purple text-black hover:opacity-90 transition-colors text-sm font-medium shadow-[0_0_15px_rgba(0,255,255,0.2)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
