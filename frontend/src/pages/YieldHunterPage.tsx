import { useEffect, useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setOpportunities, setPositions, setFilters, setLoading } from '@/features/yield/yieldSlice'
import {
  Percent, Shield, TrendingUp, AlertTriangle, DollarSign,
  RefreshCw, Filter, ChevronDown, Wallet,
  ArrowUpRight, ArrowDownRight, Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axios from 'axios'

interface YieldOpportunity {
  protocol: string
  vault_address: string
  name: string
  deposit_token: string
  deposit_symbol: string
  apy: number
  tvl: number
  risk_level: 'low' | 'medium' | 'high'
  risk_factors: string[]
  min_deposit: number
  protocol_logo: string
  token_logo: string
}

const riskColors = {
  low: 'text-accent-cyan',
  medium: 'text-amber-400',
  high: 'text-accent-pink'
}

const riskBgColors = {
  low: 'bg-accent-cyan/10 border-accent-cyan/30',
  medium: 'bg-amber-400/10 border-amber-400/30',
  high: 'bg-accent-pink/10 border-accent-pink/30'
}

const protocolInfo: Record<string, { color: string; description: string }> = {
  kamino: { color: 'text-[#00D1FF]', description: 'Established lending & LP vaults' },
  jupiter_lend: { color: 'text-[#C7F284]', description: 'Jupiter ecosystem lending' },
  loopscale: { color: 'text-[#FF6B6B]', description: 'Leveraged yield loops' },
  hylo: { color: 'text-[#A78BFA]', description: 'Oracle-free LST protocol' }
}

export default function YieldHunterPage() {
  const dispatch = useAppDispatch()
  const { opportunities, positions, filters, loading, stats } = useAppSelector(state => state.yield)
  const wallet = useAppSelector(state => state.wallet.browserWalletAddress)

  const [localOpportunities, setLocalOpportunities] = useState<YieldOpportunity[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedOpp, setSelectedOpp] = useState<YieldOpportunity | null>(null)

  useEffect(() => {
    fetchOpportunities()
  }, [])

  useEffect(() => {
    if (wallet) {
      fetchPositions()
    }
  }, [wallet])

  const fetchOpportunities = async () => {
    dispatch(setLoading(true))
    try {
      const params = new URLSearchParams()
      if (filters.risk) params.append('risk', filters.risk)
      if (filters.protocol) params.append('protocol', filters.protocol)

      const res = await axios.get(`/api/yield/opportunities?${params}`)
      if (res.data.success) {
        dispatch(setOpportunities(res.data.opportunities))
        setLocalOpportunities(res.data.opportunities)
      }
    } catch (e) {
      console.error('Failed to fetch yield opportunities:', e)
    } finally {
      dispatch(setLoading(false))
    }
  }

  const fetchPositions = async () => {
    if (!wallet) return
    try {
      const res = await axios.get(`/api/yield/positions?wallet=${wallet}`)
      if (res.data.success) {
        dispatch(setPositions(res.data.positions))
      }
    } catch (e) {
      console.error('Failed to fetch positions:', e)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchOpportunities()
    if (wallet) await fetchPositions()
    setRefreshing(false)
  }

  const displayOpps = opportunities.length > 0 ? opportunities : localOpportunities

  // Apply local sorting
  const sortedOpps = [...displayOpps].sort((a, b) => {
    const multiplier = filters.sortOrder === 'desc' ? -1 : 1
    if (filters.sortBy === 'apy') return multiplier * (b.apy - a.apy)
    if (filters.sortBy === 'tvl') return multiplier * (b.tvl - a.tvl)
    if (filters.sortBy === 'risk') {
      const riskOrder = { low: 0, medium: 1, high: 2 }
      return multiplier * (riskOrder[b.risk_level] - riskOrder[a.risk_level])
    }
    return 0
  })

  // Apply risk filter locally if set
  const filteredOpps = filters.risk
    ? sortedOpps.filter(o => o.risk_level === filters.risk)
    : sortedOpps

  const formatTvl = (tvl: number) => {
    if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`
    if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`
    if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(0)}K`
    return `$${tvl.toFixed(0)}`
  }

  const formatApy = (apy: number) => {
    if (apy >= 100) return `${apy.toFixed(0)}%`
    if (apy >= 10) return `${apy.toFixed(1)}%`
    return `${apy.toFixed(2)}%`
  }

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Percent className="text-accent-purple" size={24} />
            YIELD HUNTER
          </h1>
          <p className="text-xs text-text-muted">Aggregated DeFi yields across Solana protocols</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-bold uppercase",
              showFilters
                ? "bg-accent-purple/20 border-accent-purple/40 text-accent-purple"
                : "bg-background-card border-white/10 text-text-secondary hover:text-text-primary"
            )}
          >
            <Filter size={14} />
            Filters
            <ChevronDown size={14} className={cn("transition-transform", showFilters && "rotate-180")} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan text-xs font-bold uppercase hover:bg-accent-cyan/20 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
        <div className="bg-background-card border border-accent-purple/20 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-purple/60 to-transparent" />
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Total Opportunities</p>
          <p className="text-2xl font-mono font-bold text-text-primary">{stats?.totalOpportunities || displayOpps.length}</p>
        </div>
        <div className="bg-background-card border border-accent-cyan/20 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 to-transparent" />
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Best APY</p>
          <p className="text-2xl font-mono font-bold text-accent-cyan">{formatApy(stats?.maxApy || 0)}</p>
        </div>
        <div className="bg-background-card border border-accent-pink/20 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-pink/60 to-transparent" />
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Total TVL</p>
          <p className="text-2xl font-mono font-bold text-text-primary">{formatTvl(stats?.totalTvl || 0)}</p>
        </div>
        <div className="bg-background-card border border-white/10 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-white/20 to-transparent" />
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Your Positions</p>
          <p className="text-2xl font-mono font-bold text-text-primary">{positions.length}</p>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-background-card border border-accent-purple/20 rounded-xl p-4 shrink-0">
          <div className="flex flex-wrap gap-4">
            {/* Risk Filter */}
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">Risk Level</p>
              <div className="flex gap-1">
                {(['all', 'low', 'medium', 'high'] as const).map(risk => (
                  <button
                    key={risk}
                    onClick={() => dispatch(setFilters({ risk: risk === 'all' ? null : risk }))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                      (filters.risk === risk || (risk === 'all' && !filters.risk))
                        ? risk === 'all'
                          ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple'
                          : `${riskBgColors[risk]} ${riskColors[risk]}`
                        : 'bg-background-dark border-white/5 text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {risk === 'low' && <Shield size={10} className="inline mr-1" />}
                    {risk === 'medium' && <TrendingUp size={10} className="inline mr-1" />}
                    {risk === 'high' && <AlertTriangle size={10} className="inline mr-1" />}
                    {risk}
                  </button>
                ))}
              </div>
            </div>

            {/* Protocol Filter */}
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">Protocol</p>
              <div className="flex gap-1">
                <button
                  onClick={() => dispatch(setFilters({ protocol: null }))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                    !filters.protocol
                      ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple'
                      : 'bg-background-dark border-white/5 text-text-secondary hover:text-text-primary'
                  )}
                >
                  All
                </button>
                {Object.keys(protocolInfo).map(protocol => (
                  <button
                    key={protocol}
                    onClick={() => dispatch(setFilters({ protocol: filters.protocol === protocol ? null : protocol }))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                      filters.protocol === protocol
                        ? 'bg-white/10 border-white/20 text-text-primary'
                        : 'bg-background-dark border-white/5 text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {protocol.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">Sort By</p>
              <div className="flex gap-1">
                {(['apy', 'tvl', 'risk'] as const).map(sort => (
                  <button
                    key={sort}
                    onClick={() => {
                      if (filters.sortBy === sort) {
                        dispatch(setFilters({ sortOrder: filters.sortOrder === 'desc' ? 'asc' : 'desc' }))
                      } else {
                        dispatch(setFilters({ sortBy: sort, sortOrder: 'desc' }))
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border flex items-center gap-1",
                      filters.sortBy === sort
                        ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan'
                        : 'bg-background-dark border-white/5 text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {sort.toUpperCase()}
                    {filters.sortBy === sort && (
                      filters.sortOrder === 'desc' ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
        {/* Opportunities Grid */}
        <div className="lg:col-span-9 h-full min-h-0 flex flex-col">
          <div className="bg-background-card border border-accent-purple/20 rounded-xl flex-1 min-h-0 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-purple/60 to-transparent" />

            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary">
                Yield Opportunities
              </h2>
              <span className="text-xs text-text-secondary">{filteredOpps.length} results</span>
            </div>

            {/* Grid */}
            <div className="p-4 overflow-y-auto h-[calc(100%-56px)] custom-scrollbar">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-40 bg-white/5 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredOpps.map((opp, i) => (
                    <div
                      key={`${opp.vault_address}-${i}`}
                      onClick={() => setSelectedOpp(selectedOpp?.vault_address === opp.vault_address ? null : opp)}
                      className={cn(
                        "group bg-background-dark/50 hover:bg-background-dark border rounded-xl p-4 transition-all cursor-pointer",
                        selectedOpp?.vault_address === opp.vault_address
                          ? "border-accent-purple/50 ring-1 ring-accent-purple/20"
                          : "border-white/5 hover:border-accent-purple/30"
                      )}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={opp.protocol_logo}
                            alt={opp.protocol}
                            className="w-8 h-8 rounded-lg bg-white/10 p-1"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <div>
                            <p className={cn("text-sm font-bold", protocolInfo[opp.protocol]?.color || 'text-text-primary')}>
                              {opp.name}
                            </p>
                            <p className="text-[10px] text-text-secondary capitalize">
                              {opp.protocol.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[9px] font-bold uppercase border",
                          riskBgColors[opp.risk_level],
                          riskColors[opp.risk_level]
                        )}>
                          {opp.risk_level}
                        </span>
                      </div>

                      {/* APY */}
                      <div className="mb-3">
                        <p className="text-3xl font-mono font-black text-accent-cyan">
                          {formatApy(opp.apy)}
                        </p>
                        <p className="text-[10px] text-text-secondary uppercase">Annual Yield</p>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between text-xs border-t border-white/5 pt-3">
                        <div>
                          <p className="text-text-secondary">TVL</p>
                          <p className="font-mono font-bold text-text-primary">{formatTvl(opp.tvl)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-text-secondary">Min Deposit</p>
                          <p className="font-mono font-bold text-text-primary">
                            {opp.min_deposit} {opp.deposit_symbol}
                          </p>
                        </div>
                      </div>

                      {/* Expanded Risk Factors */}
                      {selectedOpp?.vault_address === opp.vault_address && opp.risk_factors.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-[10px] text-text-secondary uppercase mb-2 flex items-center gap-1">
                            <Info size={10} /> Risk Factors
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {opp.risk_factors.map((factor, fi) => (
                              <span
                                key={fi}
                                className="px-2 py-1 bg-white/5 rounded text-[9px] text-text-secondary"
                              >
                                {factor.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!loading && filteredOpps.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary">
                  <Percent size={48} className="opacity-20 mb-4" />
                  <p className="text-lg font-bold">No Opportunities Found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-3 flex flex-col gap-2 h-full min-h-0">
          {/* Protocol Stats */}
          <div className="bg-background-card border border-accent-purple/20 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-purple/60 to-transparent" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-3">Protocols</h3>
            <div className="space-y-2">
              {Object.entries(protocolInfo).map(([protocol, info]) => {
                const count = displayOpps.filter(o => o.protocol === protocol).length
                const maxApy = Math.max(...displayOpps.filter(o => o.protocol === protocol).map(o => o.apy), 0)
                return (
                  <div key={protocol} className="flex items-center justify-between p-2 bg-background-dark/50 rounded-lg">
                    <div>
                      <p className={cn("text-xs font-bold capitalize", info.color)}>
                        {protocol.replace('_', ' ')}
                      </p>
                      <p className="text-[9px] text-text-secondary">{info.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono font-bold text-accent-cyan">{formatApy(maxApy)}</p>
                      <p className="text-[9px] text-text-secondary">{count} vaults</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Your Positions */}
          <div className="bg-background-card border border-accent-cyan/20 rounded-xl p-4 flex-1 min-h-0 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 to-transparent" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-3 flex items-center gap-2">
              <Wallet size={14} className="text-accent-cyan" />
              Your Positions
            </h3>

            {!wallet ? (
              <div className="flex flex-col items-center justify-center h-32 text-text-secondary">
                <Wallet size={24} className="opacity-20 mb-2" />
                <p className="text-xs">Connect wallet to view positions</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-text-secondary">
                <DollarSign size={24} className="opacity-20 mb-2" />
                <p className="text-xs">No active positions</p>
                <p className="text-[10px]">Deposit to start earning</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-[300px] custom-scrollbar">
                {positions.map((pos) => (
                  <div key={pos.id} className="p-3 bg-background-dark/50 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-text-primary">{pos.vault_name}</p>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                        pos.status === 'active' ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-white/10 text-text-secondary'
                      )}>
                        {pos.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-text-secondary">Deposited</span>
                      <span className="font-mono text-text-primary">{pos.deposit_amount} {pos.deposit_symbol}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-text-secondary">Entry APY</span>
                      <span className="font-mono text-accent-cyan">{pos.entry_apy?.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
