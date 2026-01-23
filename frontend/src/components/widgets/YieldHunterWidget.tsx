import { useEffect, useState } from 'react'
import { useAppSelector } from '@/app/hooks'
import { Percent, Shield, TrendingUp, AlertTriangle, DollarSign, ExternalLink } from 'lucide-react'
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
  medium: 'text-accent-amber',
  high: 'text-accent-pink'
}

const riskBgColors = {
  low: 'bg-accent-cyan/10 border-accent-cyan/20',
  medium: 'bg-accent-amber/10 border-accent-amber/20',
  high: 'bg-accent-pink/10 border-accent-pink/20'
}

const protocolColors: Record<string, string> = {
  kamino: 'text-[#00D1FF]',
  jupiter_lend: 'text-[#C7F284]',
  loopscale: 'text-[#FF6B6B]',
  hylo: 'text-[#A78BFA]'
}

export const YieldHunterWidget = () => {
  const yieldState = useAppSelector(state => state.yield)
  const [opportunities, setOpportunities] = useState<YieldOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')

  useEffect(() => {
    fetchOpportunities()
    const interval = setInterval(fetchOpportunities, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  const fetchOpportunities = async () => {
    try {
      const res = await axios.get('/api/yield/opportunities')
      if (res.data.success) {
        setOpportunities(res.data.opportunities)
      }
    } catch (e) {
      console.error('Failed to fetch yield opportunities:', e)
    } finally {
      setLoading(false)
    }
  }

  // Use Redux state if available, otherwise local state
  const displayOpps = yieldState.opportunities.length > 0 ? yieldState.opportunities : opportunities

  const filteredOpps = filter === 'all'
    ? displayOpps
    : displayOpps.filter(o => o.risk_level === filter)

  const stats = {
    count: displayOpps.length,
    maxApy: displayOpps.length > 0 ? Math.max(...displayOpps.map(o => o.apy)) : 0,
    totalTvl: displayOpps.reduce((sum, o) => sum + o.tvl, 0)
  }

  const formatTvl = (tvl: number) => {
    if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`
    if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(0)}K`
    return `$${tvl.toFixed(0)}`
  }

  if (loading) {
    return (
      <div className="bg-background-card border border-accent-purple/20 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-accent-purple/10">
            <Percent className="text-accent-purple" size={20} />
          </div>
          <h3 className="text-sm font-black uppercase tracking-wider text-text-primary">Yield Hunter</h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background-card border border-accent-purple/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Top Accent Line */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple via-accent-cyan to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-purple/10 border border-accent-purple/20">
            <Percent className="text-accent-purple" size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-text-primary">Yield Hunter</h3>
            <p className="text-[10px] text-text-secondary">{stats.count} opportunities across 4 protocols</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-secondary">Best APY</p>
          <p className="text-lg font-mono font-bold text-accent-cyan">{stats.maxApy.toFixed(1)}%</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-background-dark/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-text-secondary uppercase">TVL</p>
          <p className="text-sm font-mono font-bold text-text-primary">{formatTvl(stats.totalTvl)}</p>
        </div>
        <div className="bg-background-dark/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-text-secondary uppercase">Low Risk</p>
          <p className="text-sm font-mono font-bold text-accent-cyan">
            {displayOpps.filter(o => o.risk_level === 'low').length}
          </p>
        </div>
        <div className="bg-background-dark/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-text-secondary uppercase">High APY</p>
          <p className="text-sm font-mono font-bold text-accent-purple">
            {displayOpps.filter(o => o.apy > 15).length}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-3 p-1 bg-background-dark/50 rounded-lg">
        {(['all', 'low', 'medium', 'high'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
              filter === f
                ? f === 'all'
                  ? 'bg-accent-purple/20 text-accent-purple'
                  : `${riskBgColors[f]} ${riskColors[f]}`
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Opportunities List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
        {filteredOpps.slice(0, 10).map((opp, i) => (
          <div
            key={`${opp.vault_address}-${i}`}
            className="group bg-background-dark/30 hover:bg-background-dark/50 border border-white/5 hover:border-accent-purple/30 rounded-lg p-3 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <img
                  src={opp.protocol_logo}
                  alt={opp.protocol}
                  className="w-5 h-5 rounded-full bg-white/10"
                  onError={(e) => (e.currentTarget.src = '/placeholder.png')}
                />
                <div>
                  <p className={cn("text-xs font-bold", protocolColors[opp.protocol] || 'text-text-primary')}>
                    {opp.name}
                  </p>
                  <p className="text-[10px] text-text-secondary capitalize">{opp.protocol.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-bold text-accent-cyan">{opp.apy.toFixed(1)}%</p>
                <p className="text-[10px] text-text-secondary">APY</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-3">
                <span className="text-text-secondary">
                  <DollarSign size={10} className="inline mr-0.5" />
                  {formatTvl(opp.tvl)}
                </span>
                <span className="text-text-secondary">
                  Min: {opp.min_deposit} {opp.deposit_symbol}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border",
                  riskBgColors[opp.risk_level],
                  riskColors[opp.risk_level]
                )}>
                  {opp.risk_level === 'low' && <Shield size={8} className="inline mr-0.5" />}
                  {opp.risk_level === 'medium' && <TrendingUp size={8} className="inline mr-0.5" />}
                  {opp.risk_level === 'high' && <AlertTriangle size={8} className="inline mr-0.5" />}
                  {opp.risk_level}
                </span>
                <ExternalLink size={12} className="text-text-secondary group-hover:text-accent-purple transition-colors" />
              </div>
            </div>

            {/* Risk Factors (shown on hover) */}
            {opp.risk_factors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/5 hidden group-hover:block">
                <p className="text-[9px] text-text-secondary mb-1">Risk Factors:</p>
                <div className="flex flex-wrap gap-1">
                  {opp.risk_factors.map((factor, fi) => (
                    <span
                      key={fi}
                      className="px-1.5 py-0.5 bg-white/5 rounded text-[8px] text-text-secondary"
                    >
                      {factor.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredOpps.length === 0 && (
          <div className="text-center py-8 text-text-secondary">
            <Percent size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No opportunities found</p>
            <p className="text-xs">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}
