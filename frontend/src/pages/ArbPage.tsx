import { WidgetGrid } from '@/components/layout'
import { AlertsWidget } from '@/components/widgets'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector } from '@/app/hooks'
import { cn, formatUSD, formatPercent, formatTimestamp } from '@/lib/utils'
import { Zap, TrendingUp, Activity, Settings } from 'lucide-react'
import { Button, Badge, StatusDot, Tooltip } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'

function ArbScannerWidget() {
  const { opportunities, isMonitoring, autoStrike, minProfit } = useAppSelector(
    (state) => state.arb
  )

  return (
    <WidgetContainer
      id="arb-scanner"
      title="Arb Scanner"
      icon={<Zap className="w-4 h-4" />}
      badge={isMonitoring ? 'Scanning' : 'Paused'}
      badgeVariant={isMonitoring ? 'green' : 'yellow'}
      actions={
        <div className="flex items-center gap-2">
          <Tooltip content={autoStrike ? 'Auto-strike ON' : 'Auto-strike OFF'}>
            <Badge variant={autoStrike ? 'green' : 'default'}>
              {autoStrike ? 'AUTO' : 'MANUAL'}
            </Badge>
          </Tooltip>
          <Button variant="ghost" size="icon-sm">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      }
      noPadding
    >
      <div className="h-full flex flex-col">
        {/* Stats bar */}
        <div className="px-4 py-3 border-b border-white/[0.04] grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-white/50">Min Profit</p>
            <p className="text-sm font-mono-numbers">{formatUSD(minProfit)}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Opportunities</p>
            <p className="text-sm font-mono-numbers">{opportunities.length}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Status</p>
            <div className="flex items-center gap-2">
              <StatusDot status={isMonitoring ? 'active' : 'paused'} pulse={isMonitoring} />
              <span className="text-sm">{isMonitoring ? 'Active' : 'Paused'}</span>
            </div>
          </div>
        </div>

        {/* Opportunities list */}
        <div className="flex-1 overflow-auto glass-scrollbar">
          <AnimatePresence>
            {opportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
                <Zap className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">Scanning for arbitrage opportunities...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {opportunities.map((opp, index) => (
                  <motion.div
                    key={`${opp.input_symbol}-${opp.output_symbol}-${opp.timestamp}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    className="p-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {opp.input_symbol}/{opp.output_symbol}
                        </span>
                        <Badge variant="cyan" size="sm">
                          {formatPercent(opp.spread_pct)}
                        </Badge>
                      </div>
                      <span
                        className={cn(
                          'font-mono-numbers text-sm',
                          opp.net_profit_usd > 0
                            ? 'text-[var(--accent-green)]'
                            : 'text-[var(--accent-red)]'
                        )}
                      >
                        +{formatUSD(opp.net_profit_usd)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-white/40">Buy on</p>
                        <p className="text-white/70">{opp.best_venue}</p>
                      </div>
                      <div>
                        <p className="text-white/40">Sell on</p>
                        <p className="text-white/70">{opp.worst_venue}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-white/30">
                        {formatTimestamp(opp.timestamp)}
                      </span>
                      <Button
                        variant="primary"
                        size="xs"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Strike
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </WidgetContainer>
  )
}

function PriceMatrixWidget() {
  const { matrix } = useAppSelector((state) => state.arb)
  const pairs = Object.entries(matrix)

  return (
    <WidgetContainer
      id="price-matrix"
      title="Price Matrix"
      icon={<Activity className="w-4 h-4" />}
      badge={`${pairs.length} pairs`}
      noPadding
    >
      <div className="h-full overflow-auto glass-scrollbar">
        {pairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
            <Activity className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm">No price data available</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {pairs.map(([pair, data]) => {
              const venues = Object.entries(data.venues || {})
              const prices = venues.map(([, price]) => price)
              const maxPrice = Math.max(...prices)
              const minPrice = Math.min(...prices)
              const spread = maxPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0

              return (
                <div key={pair} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">{pair}</span>
                    <Badge variant={spread > 0.5 ? 'green' : 'default'} size="sm">
                      {spread.toFixed(2)}% spread
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {venues.map(([venue, price]) => {
                      const isMax = price === maxPrice
                      const isMin = price === minPrice
                      return (
                        <div key={venue} className="flex items-center justify-between text-sm">
                          <span className="text-white/60">{venue}</span>
                          <span
                            className={cn(
                              'font-mono-numbers',
                              isMax && 'text-[var(--accent-green)]',
                              isMin && 'text-[var(--accent-red)]'
                            )}
                          >
                            {formatUSD(price)}
                            {isMax && <TrendingUp className="w-3 h-3 inline ml-1" />}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </WidgetContainer>
  )
}

export default function ArbPage() {
  return (
    <WidgetGrid page="arb">
      <div key="arb-scanner">
        <ArbScannerWidget />
      </div>
      <div key="price-matrix">
        <PriceMatrixWidget />
      </div>
      <div key="alerts">
        <AlertsWidget />
      </div>
    </WidgetGrid>
  )
}
