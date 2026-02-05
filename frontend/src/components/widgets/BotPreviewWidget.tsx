import { useMemo } from 'react'
import { Eye, TrendingUp, TrendingDown, DollarSign, Layers, Shield, AlertTriangle, Target, Users, Clock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetContainer } from './base/WidgetContainer'

interface BotPreviewWidgetProps {
  strategy: 'grid' | 'dca' | 'twap' | 'vwap' | 'wolfpack'
  config: {
    // Grid config
    lowerPrice?: number
    upperPrice?: number
    gridLevels?: number
    investment?: number
    // Grid - Advanced
    floorPrice?: number | null
    floorAction?: 'sell_all' | 'pause'
    trailingEnabled?: boolean
    trailingMaxCycles?: number
    hysteresis?: number
    slippageBps?: number
    stopLossPct?: number | null
    takeProfit?: number | null
    // DCA config
    amountPerBuy?: number
    interval?: string
    maxBuys?: number
    // TWAP/VWAP config
    totalAmount?: number
    duration?: number
    maxDeviation?: number
    // Wolfpack config
    consensusThreshold?: number
    timeWindow?: number
    buyAmount?: number
    wolfpackSlippage?: number
    priorityFee?: number
  }
  inputToken?: string
  outputToken?: string
  currentPrice?: number
}

export function BotPreviewWidget({
  strategy,
  config,
  inputToken = 'USDC',
  outputToken = 'SOL',
  currentPrice
}: BotPreviewWidgetProps) {

  // Calculate grid intervals with buy floor and sell ceiling
  const gridIntervals = useMemo(() => {
    if (strategy !== 'grid') return []

    const { lowerPrice = 100, upperPrice = 200, gridLevels: levels = 10, investment = 1000 } = config
    if (!lowerPrice || !upperPrice || lowerPrice >= upperPrice || !levels || levels < 2) return []

    const priceStep = (upperPrice - lowerPrice) / (levels - 1)
    const amountPerLevel = investment / levels

    // Create intervals (there are levels-1 intervals between levels)
    return Array.from({ length: levels - 1 }, (_, i) => {
      const buyFloor = lowerPrice + (priceStep * i)
      const sellCeiling = lowerPrice + (priceStep * (i + 1))
      const tokensAtLevel = amountPerLevel / buyFloor
      // Profit factor: % gain when buying at floor and selling at ceiling
      const profitPct = ((sellCeiling - buyFloor) / buyFloor) * 100
      return {
        interval: i + 1,
        buyFloor,
        sellCeiling,
        allocation: amountPerLevel,
        tokens: tokensAtLevel,
        profitPct
      }
    })
  }, [strategy, config])

  // Also keep raw levels for the visual grid
  const gridLevels = useMemo(() => {
    if (strategy !== 'grid') return []

    const { lowerPrice = 100, upperPrice = 200, gridLevels: levels = 10 } = config
    if (!lowerPrice || !upperPrice || lowerPrice >= upperPrice || !levels) return []

    const priceStep = (upperPrice - lowerPrice) / (levels - 1)

    return Array.from({ length: levels }, (_, i) => {
      const price = lowerPrice + (priceStep * i)
      return {
        level: i + 1,
        price,
        type: i < levels / 2 ? 'buy' : 'sell'
      }
    })
  }, [strategy, config])

  // Find which interval contains the current price
  const currentIntervalIndex = useMemo(() => {
    if (!currentPrice || gridIntervals.length === 0) return -1
    return gridIntervals.findIndex(
      interval => currentPrice >= interval.buyFloor && currentPrice < interval.sellCeiling
    )
  }, [currentPrice, gridIntervals])

  // Calculate current price position as percentage for visual indicator
  const currentPricePosition = useMemo(() => {
    if (!currentPrice || strategy !== 'grid') return null
    const { lowerPrice = 100, upperPrice = 200 } = config
    if (currentPrice < lowerPrice || currentPrice > upperPrice) return null
    return ((currentPrice - lowerPrice) / (upperPrice - lowerPrice)) * 100
  }, [currentPrice, strategy, config])

  // Calculate total profit per full grid cycle
  const gridProfitStats = useMemo(() => {
    if (strategy !== 'grid' || gridIntervals.length === 0) return null

    const { lowerPrice = 100, upperPrice = 200, gridLevels: levels = 10 } = config
    const priceStep = (upperPrice - lowerPrice) / (levels - 1)

    // Average profit per interval
    const avgProfitPct = gridIntervals.reduce((sum, l) => sum + l.profitPct, 0) / gridIntervals.length

    // Total profit if all buy levels fill and sell at top
    const totalRangePct = ((upperPrice - lowerPrice) / lowerPrice) * 100

    return {
      avgProfitPerLevel: avgProfitPct,
      totalRangePct,
      priceStep
    }
  }, [strategy, gridIntervals, config])

  // Calculate DCA schedule
  const dcaSchedule = useMemo(() => {
    if (strategy !== 'dca') return []

    const { amountPerBuy = 100, maxBuys = 10, interval = '1d' } = config
    const intervalLabels: Record<string, string> = {
      '1h': 'hour',
      '4h': '4 hours',
      '1d': 'day',
      '1w': 'week'
    }

    return Array.from({ length: Math.min(maxBuys, 12) }, (_, i) => ({
      execution: i + 1,
      amount: amountPerBuy,
      cumulative: amountPerBuy * (i + 1),
      timing: `${intervalLabels[interval] || interval} ${i + 1}`
    }))
  }, [strategy, config])

  // Calculate TWAP/VWAP slices
  const twapSlices = useMemo(() => {
    if (strategy !== 'twap' && strategy !== 'vwap') return []

    const { totalAmount = 1000, duration = 24 } = config
    const sliceCount = Math.min(duration, 24)
    const amountPerSlice = totalAmount / sliceCount

    return Array.from({ length: sliceCount }, (_, i) => ({
      slice: i + 1,
      hour: i + 1,
      amount: amountPerSlice,
      cumulative: amountPerSlice * (i + 1),
      percentage: ((i + 1) / sliceCount) * 100
    }))
  }, [strategy, config])

  const totalInvestment = strategy === 'grid'
    ? config.investment || 1000
    : strategy === 'dca'
    ? (config.amountPerBuy || 100) * (config.maxBuys || 10)
    : config.totalAmount || 1000

  return (
    <WidgetContainer
      id="bot-preview"
      title="Strategy Preview"
      icon={<Eye className="w-4 h-4" />}
      badge={strategy.toUpperCase()}
      badgeVariant="cyan"
      actions={
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {outputToken}/{inputToken}
        </span>
      }
      noPadding
    >
      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col p-4">
        {/* Summary Stats - Hide for wolfpack which has its own layout */}
        {strategy !== 'wolfpack' && (
          <div className={cn("grid gap-3 mb-4 shrink-0", strategy === 'grid' ? "grid-cols-4" : "grid-cols-3")}>
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
              <div className="text-[9px] text-white uppercase tracking-wider mb-1">Investment</div>
              <div className="text-lg font-bold text-white font-mono">
                ${totalInvestment.toLocaleString()}
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
              <div className="text-[9px] text-white uppercase tracking-wider mb-1">
                {strategy === 'grid' ? 'Grid Levels' : strategy === 'dca' ? 'Total Buys' : 'Time Slices'}
              </div>
              <div className="text-lg font-bold text-white font-mono">
                {strategy === 'grid' ? config.gridLevels || 10 :
                 strategy === 'dca' ? config.maxBuys || 10 :
                 config.duration || 24}
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
              <div className="text-[9px] text-white uppercase tracking-wider mb-1">Per Execution</div>
              <div className="text-lg font-bold text-white font-mono">
                ${(totalInvestment / (strategy === 'grid' ? (config.gridLevels || 10) :
                   strategy === 'dca' ? (config.maxBuys || 10) :
                   (config.duration || 24))).toFixed(2)}
              </div>
            </div>
            {strategy === 'grid' && gridProfitStats && (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <div className="text-[9px] text-white uppercase tracking-wider mb-1">Profit/Level</div>
                <div className="text-lg font-bold text-white font-mono">
                  +{gridProfitStats.avgProfitPerLevel.toFixed(2)}%
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grid Preview */}
        {strategy === 'grid' && gridIntervals.length > 0 && (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <Layers size={12} />
              Price Levels & Allocation
            </div>

            {/* Visual Grid */}
            <div className="relative mb-4">
              <div className="flex justify-between text-[9px] text-text-muted mb-1">
                <span>${config.lowerPrice?.toFixed(2) || '100.00'}</span>
                {currentPrice && (
                  <span className="text-white font-bold">
                    Current: ${currentPrice.toFixed(2)}
                  </span>
                )}
                <span>${config.upperPrice?.toFixed(2) || '200.00'}</span>
              </div>
              <div className="h-8 bg-white/[0.02] rounded-lg border border-white/5 relative overflow-hidden">
                {gridLevels.map((level, i) => {
                  const position = ((level.price - (config.lowerPrice || 100)) /
                    ((config.upperPrice || 200) - (config.lowerPrice || 100))) * 100
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 bottom-0 w-[2px]",
                        level.type === 'buy' ? 'bg-accent-cyan' : 'bg-accent-pink'
                      )}
                      style={{ left: `${position}%` }}
                    />
                  )
                })}
                {/* Current price indicator */}
                {currentPricePosition !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-[3px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10"
                    style={{ left: `${currentPricePosition}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between text-[8px] mt-1">
                <span className="text-accent-cyan">BUY ZONE</span>
                <span className="text-accent-pink">SELL ZONE</span>
              </div>
            </div>

            {/* Interval Table - Shows Buy Floor & Sell Ceiling */}
            <div className="space-y-1 mb-3">
              <div className="grid grid-cols-[32px_1fr_1fr_60px_60px] gap-2 text-[9px] text-text-muted uppercase tracking-wider pb-1 border-b border-white/5">
                <div>#</div>
                <div className="text-accent-cyan">Buy Floor</div>
                <div className="text-accent-pink">Sell Ceiling</div>
                <div className="text-right">Alloc</div>
                <div className="text-right">Profit</div>
              </div>
              {gridIntervals.map((interval, idx) => {
                const isCurrent = idx === currentIntervalIndex
                return (
                <div
                  key={interval.interval}
                  className={cn(
                    "grid grid-cols-[32px_1fr_1fr_60px_60px] gap-2 py-1.5 text-[11px] font-mono border-b transition-colors",
                    isCurrent
                      ? "bg-white/10 border-white/30 rounded-lg -mx-1 px-1"
                      : "border-white/[0.02] hover:bg-white/[0.02]"
                  )}
                >
                  <div className={cn("text-text-muted", isCurrent && "text-white font-bold")}>
                    {isCurrent ? "▸" : ""}{interval.interval}
                  </div>
                  <div className="text-accent-cyan font-bold">${interval.buyFloor.toFixed(2)}</div>
                  <div className="text-accent-pink font-bold">${interval.sellCeiling.toFixed(2)}</div>
                  <div className="text-right text-text-secondary">${interval.allocation.toFixed(0)}</div>
                  <div className="text-right text-accent-cyan font-bold">
                    +{interval.profitPct.toFixed(2)}%
                  </div>
                </div>
              )})}
            </div>

            {/* Risk & Settings Summary */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              {/* Floor Price Warning */}
              {config.floorPrice && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent-red/5 border border-accent-red/20">
                  <AlertTriangle size={12} className="text-accent-red" />
                  <span className="text-[10px] text-accent-red">
                    Floor @ ${config.floorPrice.toFixed(2)} → {config.floorAction === 'sell_all' ? 'Sell All' : 'Pause'}
                  </span>
                </div>
              )}

              {/* Stop Loss / Take Profit */}
              {(config.stopLossPct || config.takeProfit) && (
                <div className="flex gap-2">
                  {config.stopLossPct && (
                    <div className="flex-1 flex items-center gap-1 p-2 rounded-lg bg-accent-red/5 border border-accent-red/10">
                      <Shield size={10} className="text-accent-red" />
                      <span className="text-[9px] text-accent-red">SL: -{config.stopLossPct}%</span>
                    </div>
                  )}
                  {config.takeProfit && (
                    <div className="flex-1 flex items-center gap-1 p-2 rounded-lg bg-accent-cyan/5 border border-accent-cyan/10">
                      <Target size={10} className="text-accent-cyan" />
                      <span className="text-[9px] text-accent-cyan">TP: +{config.takeProfit}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Trailing Mode */}
              {config.trailingEnabled && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent-purple/5 border border-accent-purple/20">
                  <TrendingUp size={12} className="text-accent-purple" />
                  <span className="text-[10px] text-accent-purple">
                    Trailing Mode {config.trailingMaxCycles ? `(${config.trailingMaxCycles} cycles)` : '(unlimited)'}
                  </span>
                </div>
              )}

              {/* Execution Settings */}
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-text-muted">Hysteresis:</span>
                  <span className="text-white ml-1">{((config.hysteresis || 0.01) * 100).toFixed(2)}%</span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-text-muted">Slippage:</span>
                  <span className="text-white ml-1">{((config.slippageBps || 50) / 100).toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DCA Preview */}
        {strategy === 'dca' && dcaSchedule.length > 0 && (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <TrendingDown size={12} />
              DCA Schedule
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="h-6 bg-white/[0.02] rounded-lg border border-white/5 relative overflow-hidden flex">
                {dcaSchedule.map((entry, i) => (
                  <div
                    key={i}
                    className="flex-1 border-r border-white/5 last:border-r-0 flex items-center justify-center hover:bg-accent-cyan/10 transition-colors cursor-default"
                    title={`Buy ${i + 1}: $${entry.amount}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-accent-cyan/50" />
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule Table */}
            <div className="space-y-1">
              <div className="grid grid-cols-[60px_1fr_100px_100px] gap-2 text-[9px] text-text-muted uppercase tracking-wider pb-1 border-b border-white/5">
                <div>Buy #</div>
                <div>Timing</div>
                <div className="text-right">Amount</div>
                <div className="text-right">Cumulative</div>
              </div>
              {dcaSchedule.map((entry) => (
                <div
                  key={entry.execution}
                  className="grid grid-cols-[60px_1fr_100px_100px] gap-2 py-1.5 text-[11px] font-mono border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors"
                >
                  <div className="text-accent-cyan font-bold">#{entry.execution}</div>
                  <div className="text-text-secondary capitalize">{entry.timing}</div>
                  <div className="text-right text-white">${entry.amount.toFixed(2)}</div>
                  <div className="text-right text-accent-cyan">${entry.cumulative.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TWAP/VWAP Preview */}
        {(strategy === 'twap' || strategy === 'vwap') && twapSlices.length > 0 && (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <TrendingUp size={12} />
              {strategy.toUpperCase()} Execution Plan
            </div>

            {/* Progress visualization */}
            <div className="mb-4 h-20 bg-white/[0.02] rounded-lg border border-white/5 p-2 relative">
              <div className="h-full flex items-end gap-[2px]">
                {twapSlices.map((slice, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-accent-purple/30 hover:bg-accent-purple/50 transition-colors rounded-t"
                    style={{ height: `${slice.percentage}%` }}
                    title={`Hour ${slice.hour}: $${slice.amount.toFixed(2)}`}
                  />
                ))}
              </div>
              <div className="absolute bottom-1 left-2 text-[8px] text-text-muted">0h</div>
              <div className="absolute bottom-1 right-2 text-[8px] text-text-muted">{config.duration || 24}h</div>
            </div>

            {strategy === 'vwap' && config.maxDeviation && (
              <div className="mb-3 p-2 bg-white/5 border border-white/20 rounded-lg">
                <div className="text-[9px] text-white flex items-center gap-1">
                  <DollarSign size={10} />
                  Max deviation: {config.maxDeviation}% from VWAP
                </div>
              </div>
            )}

            {/* Slice summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
                <div className="text-[9px] text-text-muted uppercase">Avg per hour</div>
                <div className="text-sm font-bold text-white font-mono">
                  ${((config.totalAmount || 1000) / (config.duration || 24)).toFixed(2)}
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
                <div className="text-[9px] text-text-muted uppercase">Completion</div>
                <div className="text-sm font-bold text-accent-purple font-mono">
                  {config.duration || 24} hours
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wolfpack Preview */}
        {strategy === 'wolfpack' && (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users size={12} />
              Whale Consensus Strategy
            </div>

            {/* Visual representation */}
            <div className="mb-4 p-4 bg-white/[0.02] rounded-lg border border-white/5 relative">
              <div className="flex items-center justify-center gap-3">
                {Array.from({ length: config.consensusThreshold || 2 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-accent-cyan/20 border border-accent-cyan/40 flex items-center justify-center">
                      <Users size={16} className="text-accent-cyan" />
                    </div>
                    <span className="text-[8px] text-text-muted mt-1">Whale {i + 1}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center">
                  <div className="text-accent-cyan text-lg font-bold">=</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-accent-cyan/20 border border-accent-cyan/40 flex items-center justify-center">
                    <Zap size={16} className="text-accent-cyan" />
                  </div>
                  <span className="text-[8px] text-accent-cyan mt-1">AUTO BUY</span>
                </div>
              </div>
            </div>

            {/* Config Summary */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                  <div className="text-[9px] text-text-muted uppercase mb-1 flex items-center gap-1">
                    <Users size={10} />
                    Consensus
                  </div>
                  <div className="text-lg font-bold text-accent-cyan font-mono">
                    {config.consensusThreshold || 2} Whales
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                  <div className="text-[9px] text-text-muted uppercase mb-1 flex items-center gap-1">
                    <Clock size={10} />
                    Time Window
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {config.timeWindow || 60}s
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
                  <div className="text-[8px] text-text-muted uppercase">Buy Amount</div>
                  <div className="text-sm font-bold text-accent-cyan font-mono">
                    {config.buyAmount || 0.1} SOL
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
                  <div className="text-[8px] text-text-muted uppercase">Slippage</div>
                  <div className="text-sm font-bold text-white font-mono">
                    {config.wolfpackSlippage || 15}%
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
                  <div className="text-[8px] text-text-muted uppercase">Priority</div>
                  <div className="text-sm font-bold text-white font-mono">
                    {config.priorityFee || 0.005} SOL
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="mt-3 p-3 bg-accent-cyan/5 border border-accent-cyan/20 rounded-lg">
                <div className="text-[9px] text-accent-cyan font-bold uppercase mb-2">How It Works</div>
                <ol className="text-[10px] text-text-secondary space-y-1 list-decimal list-inside">
                  <li>Copy Trader detects whale buys</li>
                  <li>Wolfpack tracks unique wallets per token</li>
                  <li>When {config.consensusThreshold || 2}+ whales buy same token within {config.timeWindow || 60}s</li>
                  <li>Auto-executes buy with {config.buyAmount || 0.1} SOL</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {((strategy === 'grid' && gridIntervals.length === 0) ||
          (strategy === 'dca' && dcaSchedule.length === 0) ||
          ((strategy === 'twap' || strategy === 'vwap') && twapSlices.length === 0)) && (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
            <Eye size={32} strokeWidth={1} className="mb-2 opacity-30" />
            <div className="text-xs">Configure parameters to see preview</div>
          </div>
        )}
      </div>
    </WidgetContainer>
  )
}
