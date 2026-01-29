import { useMemo, useState } from 'react'
import { X, TrendingUp, TrendingDown, Activity, Grid3X3, Clock, Repeat, BarChart3, DollarSign, Zap, Pause, Play, Square } from 'lucide-react'
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
  trades?: Array<{
    timestamp: string
    side: 'buy' | 'sell'
    price: number
    amount: number
    level?: number
  }>
}

interface BotDetailsModalProps {
  bot: BotData
  onClose: () => void
}

export function BotDetailsModal({ bot, onClose }: BotDetailsModalProps) {
  const prices = useAppSelector(state => state.prices.prices)
  const currentPrice = prices[bot.output_mint] || 0
  const [actionLoading, setActionLoading] = useState<'pause' | 'stop' | null>(null)

  const isActive = bot.status === 'active'
  const isGrid = bot.type?.toUpperCase() === 'GRID'

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
    if (!confirm('Are you sure you want to stop this bot? This will mark it as completed.')) return
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
  const isProfit = profit >= 0

  // Find current level index
  const currentLevelIndex = useMemo(() => {
    if (!currentPrice || gridLevels.length === 0) return -1
    // Find the level just below current price
    for (let i = gridLevels.length - 1; i >= 0; i--) {
      if (gridLevels[i].price <= currentPrice) {
        return i
      }
    }
    return 0
  }, [currentPrice, gridLevels])

  // Calculate stats
  const stats = useMemo(() => {
    if (!isGrid || gridLevels.length === 0) return null

    const filledLevels = gridLevels.filter(l => l.has_position).length
    const totalLevels = gridLevels.length
    const totalTokens = gridLevels.reduce((sum, l) => sum + (l.token_amount || 0), 0)
    const totalCost = gridLevels.reduce((sum, l) => sum + (l.cost_usd || 0), 0)
    const currentValue = totalTokens * currentPrice
    const unrealizedPnl = currentValue - totalCost

    return {
      filledLevels,
      totalLevels,
      fillRate: (filledLevels / totalLevels) * 100,
      totalTokens,
      totalCost,
      currentValue,
      unrealizedPnl,
    }
  }, [isGrid, gridLevels, currentPrice])

  const getTypeIcon = () => {
    switch (bot.type?.toUpperCase()) {
      case 'GRID': return <Grid3X3 size={16} />
      case 'DCA': return <Repeat size={16} />
      case 'TWAP': return <Clock size={16} />
      case 'VWAP': return <BarChart3 size={16} />
      default: return <Activity size={16} />
    }
  }

  const getTypeColor = () => {
    switch (bot.type?.toUpperCase()) {
      case 'GRID': return 'text-accent-purple'
      case 'DCA': return 'text-accent-cyan'
      case 'TWAP': return 'text-accent-pink'
      case 'VWAP': return 'text-accent-green'
      default: return 'text-white'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-background-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-white/5", getTypeColor())}>
              {getTypeIcon()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {bot.alias || `${bot.input_symbol}/${bot.output_symbol}`}
              </h2>
              <p className="text-xs text-white/50">
                {bot.type} Strategy • ID: {bot.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Status</div>
              <div className={cn(
                "text-sm font-bold",
                bot.status === 'active' ? 'text-accent-green' : 'text-yellow-500'
              )}>
                {bot.status === 'active' ? 'Running' : 'Paused'}
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Executions</div>
              <div className="text-sm font-bold text-white font-mono">
                {bot.run_count || 0}
                {bot.max_runs && <span className="text-white/30">/{bot.max_runs}</span>}
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Realized P&L</div>
              <div className={cn(
                "text-sm font-bold font-mono",
                isProfit ? 'text-accent-green' : 'text-accent-red'
              )}>
                {isProfit ? '+' : ''}{profit.toFixed(2)} USD
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Current Price</div>
              <div className="text-sm font-bold text-accent-cyan font-mono">
                ${currentPrice.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Grid-specific content */}
          {isGrid && stats && (
            <>
              {/* Grid Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-accent-purple/5 border border-accent-purple/20 rounded-xl p-4">
                  <div className="text-[10px] text-accent-purple uppercase tracking-wider mb-1">Grid Fill Rate</div>
                  <div className="text-lg font-bold text-white font-mono">
                    {stats.filledLevels}/{stats.totalLevels}
                    <span className="text-sm text-white/50 ml-2">({stats.fillRate.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Holdings</div>
                  <div className="text-lg font-bold text-white font-mono">
                    {stats.totalTokens.toFixed(4)} <span className="text-sm text-white/50">{bot.output_symbol}</span>
                  </div>
                </div>
                <div className={cn(
                  "border rounded-xl p-4",
                  stats.unrealizedPnl >= 0
                    ? "bg-accent-green/5 border-accent-green/20"
                    : "bg-accent-red/5 border-accent-red/20"
                )}>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Unrealized P&L</div>
                  <div className={cn(
                    "text-lg font-bold font-mono",
                    stats.unrealizedPnl >= 0 ? 'text-accent-green' : 'text-accent-red'
                  )}>
                    {stats.unrealizedPnl >= 0 ? '+' : ''}{stats.unrealizedPnl.toFixed(2)} USD
                  </div>
                </div>
              </div>

              {/* Price Range Visualization */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <div className="text-xs text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Zap size={12} className="text-accent-yellow" />
                  Price Range
                </div>
                <div className="flex justify-between text-xs text-white/50 mb-2">
                  <span>${bot.lower_bound?.toFixed(2)}</span>
                  <span className="text-accent-yellow font-bold">Current: ${currentPrice.toFixed(2)}</span>
                  <span>${bot.upper_bound?.toFixed(2)}</span>
                </div>
                <div className="h-3 bg-white/5 rounded-full relative overflow-hidden">
                  {/* Grid level markers */}
                  {gridLevels.map((level, i) => {
                    const pos = ((level.price - (bot.lower_bound || 0)) / ((bot.upper_bound || 1) - (bot.lower_bound || 0))) * 100
                    return (
                      <div
                        key={i}
                        className={cn(
                          "absolute top-0 bottom-0 w-[2px]",
                          level.has_position ? 'bg-accent-green' : 'bg-white/20'
                        )}
                        style={{ left: `${pos}%` }}
                      />
                    )
                  })}
                  {/* Current price indicator */}
                  {currentPrice >= (bot.lower_bound || 0) && currentPrice <= (bot.upper_bound || 0) && (
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-accent-yellow shadow-[0_0_8px_rgba(255,200,0,0.8)]"
                      style={{
                        left: `${((currentPrice - (bot.lower_bound || 0)) / ((bot.upper_bound || 1) - (bot.lower_bound || 0))) * 100}%`
                      }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[10px] mt-2">
                  <span className="text-accent-green">BUY ZONE</span>
                  <span className="text-accent-pink">SELL ZONE</span>
                </div>
              </div>

              {/* Grid Levels Table */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <div className="text-xs text-white/50 uppercase tracking-wider flex items-center gap-2">
                    <Grid3X3 size={12} />
                    Grid Levels
                  </div>
                  <div className="text-[10px] text-white/30">
                    {stats.filledLevels} positions held
                  </div>
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background-card">
                      <tr className="text-[10px] text-white/40 uppercase tracking-wider">
                        <th className="text-left px-4 py-2 font-medium">#</th>
                        <th className="text-left px-4 py-2 font-medium">Buy Floor</th>
                        <th className="text-left px-4 py-2 font-medium">Sell Ceiling</th>
                        <th className="text-center px-4 py-2 font-medium">Status</th>
                        <th className="text-right px-4 py-2 font-medium">Amount</th>
                        <th className="text-right px-4 py-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gridLevels.map((level, i) => {
                        const isCurrent = i === currentLevelIndex
                        const nextLevel = gridLevels[i + 1]
                        return (
                          <tr
                            key={i}
                            className={cn(
                              "text-[11px] font-mono transition-colors",
                              isCurrent
                                ? "bg-accent-yellow/10 border-l-2 border-l-accent-yellow"
                                : level.has_position
                                  ? "bg-accent-green/5"
                                  : "hover:bg-white/[0.02]"
                            )}
                          >
                            <td className={cn(
                              "px-4 py-2",
                              isCurrent ? "text-accent-yellow font-bold" : "text-white/40"
                            )}>
                              {isCurrent && "▸"}{i + 1}
                            </td>
                            <td className="px-4 py-2 text-accent-green">
                              ${level.price.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-accent-pink">
                              {nextLevel ? `$${nextLevel.price.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[9px] font-semibold",
                                level.has_position
                                  ? "bg-accent-green/20 text-accent-green"
                                  : "bg-white/5 text-white/40"
                              )}>
                                {level.has_position ? 'HOLDING' : 'WAITING'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-white/70">
                              {level.has_position && level.token_amount > 0
                                ? `${level.token_amount.toFixed(4)} ${bot.output_symbol}`
                                : '-'}
                            </td>
                            <td className="px-4 py-2 text-right text-white/50">
                              {level.cost_usd > 0 ? `$${level.cost_usd.toFixed(2)}` : '-'}
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
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6 text-center">
              <Activity size={32} className="mx-auto mb-3 text-white/30" />
              <p className="text-sm text-white/50">
                {bot.type} strategy running
              </p>
              <p className="text-xs text-white/30 mt-1">
                {bot.run_count || 0} executions completed
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-between shrink-0">
          <div className="flex gap-2">
            <button
              onClick={handlePauseResume}
              disabled={actionLoading !== null}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
                isActive
                  ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                  : "bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {actionLoading === 'stop' ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Square size={16} />
              )}
              Stop
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
