import { WidgetGrid } from '@/components/layout'
import { AlertsWidget, PortfolioWidget } from '@/components/widgets'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector } from '@/app/hooks'
import { formatUSD, formatNumber, formatPercent } from '@/lib/utils'
import {
  Sprout,
  TrendingUp,
  Shield,
  AlertTriangle,
  Plus,
  ExternalLink,
} from 'lucide-react'
import { Button, Badge, Input, Select } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useMemo } from 'react'

const riskColors = {
  low: 'green',
  medium: 'yellow',
  high: 'red',
} as const

const riskIcons = {
  low: Shield,
  medium: AlertTriangle,
  high: AlertTriangle,
}

function YieldOpportunitiesWidget() {
  const { opportunities, filters, stats } = useAppSelector((state) => state.yield)
  const [search, setSearch] = useState('')

  const filteredOpportunities = useMemo(() => {
    let result = opportunities

    // Search filter
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.protocol.toLowerCase().includes(q) ||
          o.deposit_symbol.toLowerCase().includes(q)
      )
    }

    // Risk filter
    if (filters.risk) {
      result = result.filter((o) => o.risk_level === filters.risk)
    }

    // Protocol filter
    if (filters.protocol) {
      result = result.filter((o) => o.protocol === filters.protocol)
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: number = 0
      let bVal: number = 0

      if (filters.sortBy === 'apy') {
        aVal = a.apy
        bVal = b.apy
      } else if (filters.sortBy === 'tvl') {
        aVal = a.tvl
        bVal = b.tvl
      }

      return filters.sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })

    return result
  }, [opportunities, search, filters])

  return (
    <WidgetContainer
      id="yield-opportunities"
      title="Yield Opportunities"
      icon={<Sprout className="w-4 h-4" />}
      badge={stats ? `${stats.totalOpportunities} vaults` : undefined}
      badgeVariant="green"
      actions={
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-28"
          />
          <Select
            size="sm"
            options={[
              { value: '', label: 'All Risks' },
              { value: 'low', label: 'Low Risk' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High Risk' },
            ]}
            className="w-24"
          />
        </div>
      }
      noPadding
    >
      <div className="h-full flex flex-col">
        {/* Stats bar */}
        {stats && (
          <div className="px-4 py-3 border-b border-white/[0.04] grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-white/50">Avg APY</p>
              <p className="text-sm font-mono-numbers text-[var(--accent-green)]">
                {formatPercent(stats.avgApy)}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/50">Max APY</p>
              <p className="text-sm font-mono-numbers text-[var(--accent-cyan)]">
                {formatPercent(stats.maxApy)}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/50">Total TVL</p>
              <p className="text-sm font-mono-numbers">{formatNumber(stats.totalTvl)}</p>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-auto glass-scrollbar">
          <AnimatePresence>
            {filteredOpportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
                <Sprout className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">No yield opportunities found</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {filteredOpportunities.map((opp, index) => {
                  const RiskIcon = riskIcons[opp.risk_level]
                  return (
                    <motion.div
                      key={opp.vault_address}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.02 }}
                      className="p-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        {/* Protocol logo */}
                        <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center overflow-hidden">
                          {opp.protocol_logo ? (
                            <img
                              src={opp.protocol_logo}
                              alt={opp.protocol}
                              className="w-6 h-6"
                            />
                          ) : (
                            <Sprout className="w-5 h-5 text-[var(--accent-green)]" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">{opp.name}</span>
                            <Badge
                              variant={riskColors[opp.risk_level]}
                              size="sm"
                            >
                              <RiskIcon className="w-3 h-3 mr-1" />
                              {opp.risk_level}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-white/50">
                            <span>{opp.protocol}</span>
                            <span>TVL: {formatNumber(opp.tvl)}</span>
                            <span>Min: {formatNumber(opp.min_deposit)} {opp.deposit_symbol}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-mono-numbers text-[var(--accent-green)]">
                            {formatPercent(opp.apy)}
                          </p>
                          <p className="text-xs text-white/50">APY</p>
                        </div>

                        <Button
                          variant="primary"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Deposit
                        </Button>
                      </div>

                      {/* Risk factors */}
                      {opp.risk_factors && opp.risk_factors.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {opp.risk_factors.slice(0, 3).map((factor) => (
                            <Badge key={factor} variant="default" size="sm">
                              {factor}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </WidgetContainer>
  )
}

function YieldPositionsWidget() {
  const { positions } = useAppSelector((state) => state.yield)

  const activePositions = positions.filter((p) => p.status === 'active')
  const totalDeposited = activePositions.reduce((sum, p) => sum + (p.deposit_amount || 0), 0)

  return (
    <WidgetContainer
      id="yield-positions"
      title="Your Positions"
      icon={<TrendingUp className="w-4 h-4" />}
      badge={activePositions.length > 0 ? `${activePositions.length} active` : undefined}
      badgeVariant="cyan"
      noPadding
    >
      <div className="h-full flex flex-col">
        {/* Stats */}
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <p className="text-xs text-white/50">Total Deposited</p>
          <p className="text-xl font-mono-numbers">{formatUSD(totalDeposited)}</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto glass-scrollbar">
          <AnimatePresence>
            {activePositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
                <TrendingUp className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm mb-3">No active yield positions</p>
                <Button variant="primary" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Find Opportunities
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {activePositions.map((position, index) => (
                  <motion.div
                    key={position.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    className="p-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium">{position.vault_name}</span>
                        <p className="text-xs text-white/50">{position.protocol}</p>
                      </div>
                      <Badge variant="green" size="sm">
                        {formatPercent(position.entry_apy)} APY
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-white/50">Deposited</p>
                        <p className="font-mono-numbers">
                          {formatNumber(position.deposit_amount)} {position.deposit_symbol}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/50">Shares</p>
                        <p className="font-mono-numbers">{formatNumber(position.shares_received)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="xs">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View
                      </Button>
                      <Button variant="danger" size="xs">
                        Withdraw
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

export default function YieldPage() {
  return (
    <WidgetGrid page="yield">
      <div key="yield-opportunities">
        <YieldOpportunitiesWidget />
      </div>
      <div key="yield-positions">
        <YieldPositionsWidget />
      </div>
      <div key="portfolio">
        <PortfolioWidget />
      </div>
      <div key="alerts">
        <AlertsWidget />
      </div>
    </WidgetGrid>
  )
}
