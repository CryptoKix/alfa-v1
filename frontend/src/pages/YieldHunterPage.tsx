import { useEffect, useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setOpportunities, setPositions, setLoading } from '@/features/yield/yieldSlice'
import {
  Percent, Shield, TrendingUp, AlertTriangle, DollarSign,
  RefreshCw, Wallet, Info, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axios from 'axios'
import { YieldDepositModal } from '@/components/modals/YieldDepositModal'

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

type RiskTab = 'high' | 'medium' | 'low'

const riskTabConfig = {
  high: { icon: AlertTriangle, label: 'High Risk', color: 'text-accent-purple', bg: 'bg-accent-purple/10', border: 'border-accent-purple/30' },
  medium: { icon: TrendingUp, label: 'Medium Risk', color: 'text-accent-pink', bg: 'bg-accent-pink/10', border: 'border-accent-pink/30' },
  low: { icon: Shield, label: 'Low Risk', color: 'text-accent-cyan', bg: 'bg-accent-cyan/10', border: 'border-accent-cyan/30' }
}

const protocolInfo: Record<string, { description: string; logo: string }> = {
  kamino: { description: 'Lending & LP vaults', logo: 'https://app.kamino.finance/favicon.ico' },
  jupiter_lend: { description: 'Jupiter lending', logo: 'https://static.jup.ag/jup/icon.png' },
  loopscale: { description: 'Leveraged loops', logo: 'https://loopscale.com/favicon.ico' },
  hylo: { description: 'Oracle-free LST', logo: 'https://hylo.so/favicon.ico' }
}

export default function YieldHunterPage() {
  const dispatch = useAppDispatch()
  const { opportunities, positions, loading } = useAppSelector(state => state.yield)
  const wallet = useAppSelector(state => state.wallet.browserWalletAddress)

  const [localOpportunities, setLocalOpportunities] = useState<YieldOpportunity[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [selectedProtocol, setSelectedProtocol] = useState<string | null>(null)
  const [activeRiskTab, setActiveRiskTab] = useState<RiskTab>('medium')
  const [selectedOpp, setSelectedOpp] = useState<YieldOpportunity | null>(null)
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [depositOpp, setDepositOpp] = useState<YieldOpportunity | null>(null)

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
      const res = await axios.get('/api/yield/opportunities')
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

  // Filter by selected protocol, then by risk tab, then sort by APY desc
  const getFilteredOpps = () => {
    let filtered = displayOpps

    if (selectedProtocol) {
      filtered = filtered.filter(o => o.protocol === selectedProtocol)
    }

    filtered = filtered.filter(o => o.risk_level === activeRiskTab)

    // Sort by APY highest to lowest
    return [...filtered].sort((a, b) => b.apy - a.apy)
  }

  const filteredOpps = getFilteredOpps()

  // Get counts per risk level for selected protocol
  const getRiskCounts = () => {
    let opps = displayOpps
    if (selectedProtocol) {
      opps = opps.filter(o => o.protocol === selectedProtocol)
    }
    return {
      high: opps.filter(o => o.risk_level === 'high').length,
      medium: opps.filter(o => o.risk_level === 'medium').length,
      low: opps.filter(o => o.risk_level === 'low').length
    }
  }

  const riskCounts = getRiskCounts()

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

  const handleDepositClick = (e: React.MouseEvent, opp: YieldOpportunity) => {
    e.stopPropagation()
    setDepositOpp(opp)
    setDepositModalOpen(true)
  }

  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Percent className="text-accent-cyan" size={24} />
            YIELD HUNTER
          </h1>
          <p className="text-xs text-text-muted">Select a protocol to view yield opportunities</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-cyan/5 border border-accent-cyan/10 text-text-secondary text-xs font-bold uppercase hover:bg-accent-cyan/10 hover:text-text-primary transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2 overflow-hidden">
        {/* Left Sidebar - Protocol Selector */}
        <div className="lg:col-span-3 flex flex-col gap-2 h-full min-h-0 overflow-hidden">
          {/* Protocol Cards */}
          <div className="bg-background-card border border-accent-cyan/10 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-3">Select Protocol</h3>
            <div className="space-y-2">
              {Object.entries(protocolInfo).map(([protocol, info]) => {
                const count = displayOpps.filter(o => o.protocol === protocol).length
                const maxApy = Math.max(...displayOpps.filter(o => o.protocol === protocol).map(o => o.apy), 0)
                const isSelected = selectedProtocol === protocol

                return (
                  <button
                    key={protocol}
                    onClick={() => setSelectedProtocol(isSelected ? null : protocol)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                      isSelected
                        ? "bg-accent-cyan/10 border-accent-cyan/30"
                        : "bg-background-dark/50 border-accent-cyan/10 hover:border-accent-cyan/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={info.logo}
                        alt={protocol}
                        className="w-8 h-8 rounded-lg bg-accent-cyan/10 p-1"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <div>
                        <p className={cn(
                          "text-sm font-bold capitalize",
                          isSelected ? "text-accent-cyan" : "text-text-primary"
                        )}>
                          {protocol.replace('_', ' ')}
                        </p>
                        <p className="text-[10px] text-text-muted">{info.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold text-accent-cyan">{formatApy(maxApy)}</p>
                      <p className="text-[10px] text-text-muted">{count} vaults</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Your Positions */}
          <div className="bg-background-card border border-accent-cyan/10 rounded-xl p-4 flex-1 min-h-0 overflow-hidden flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-3 flex items-center gap-2 shrink-0">
              <Wallet size={14} className="text-accent-cyan" />
              Your Positions
            </h3>

            {!wallet ? (
              <div className="flex flex-col items-center justify-center flex-1 text-text-secondary">
                <Wallet size={20} className="opacity-20 mb-2" />
                <p className="text-[10px]">Connect wallet to view</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-text-secondary">
                <DollarSign size={20} className="opacity-20 mb-2" />
                <p className="text-[10px]">No active positions</p>
              </div>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto glass-scrollbar">
                {positions.map((pos) => (
                  <div key={pos.id} className="p-2 bg-background-dark/50 rounded-lg border border-accent-cyan/10">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-text-primary truncate">{pos.vault_name}</p>
                      <span className="text-xs font-mono text-accent-cyan">{pos.entry_apy?.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Widget - Opportunities with Risk Tabs */}
        <div className="lg:col-span-9 h-full min-h-0 flex flex-col overflow-hidden">
          <div className="bg-background-card border border-accent-cyan/10 rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Header with Tabs */}
            <div className="border-b border-accent-cyan/10 shrink-0">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary flex items-center gap-2">
                  {selectedProtocol ? (
                    <>
                      <span className="capitalize">{selectedProtocol.replace('_', ' ')}</span>
                      <ChevronRight size={14} className="text-text-muted" />
                      <span className="text-text-secondary">Vaults</span>
                    </>
                  ) : (
                    'All Protocols'
                  )}
                </h2>
                <span className="text-xs text-text-secondary">{filteredOpps.length} vaults</span>
              </div>

              {/* Risk Tabs */}
              <div className="flex px-4 gap-1">
                {(['high', 'medium', 'low'] as const).map(risk => {
                  const config = riskTabConfig[risk]
                  const Icon = config.icon
                  const isActive = activeRiskTab === risk
                  const count = riskCounts[risk]

                  return (
                    <button
                      key={risk}
                      onClick={() => setActiveRiskTab(risk)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-t-lg border-x border-t transition-all text-xs font-bold",
                        isActive
                          ? `${config.bg} ${config.border} ${config.color} -mb-px`
                          : "bg-transparent border-transparent text-text-secondary hover:text-text-primary"
                      )}
                    >
                      <Icon size={14} />
                      {config.label}
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px]",
                        isActive ? "bg-black/20" : "bg-white/5"
                      )}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Vault Grid */}
            <div className="flex-1 min-h-0 overflow-auto glass-scrollbar p-4">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-40 bg-accent-cyan/5 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : filteredOpps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary">
                  <Percent size={48} className="opacity-20 mb-4" />
                  <p className="text-lg font-bold">No {riskTabConfig[activeRiskTab].label} Vaults</p>
                  <p className="text-sm">
                    {selectedProtocol
                      ? `Try selecting a different risk level or protocol`
                      : 'Select a protocol to view opportunities'}
                  </p>
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
                          ? "border-accent-cyan/50 ring-1 ring-accent-cyan/10"
                          : "border-accent-cyan/10 hover:border-accent-cyan/30"
                      )}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={opp.protocol_logo}
                            alt={opp.protocol}
                            className="w-8 h-8 rounded-lg bg-accent-cyan/10 p-1"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <div>
                            <p className="text-sm font-bold text-text-primary">
                              {opp.name}
                            </p>
                            <p className="text-[10px] text-text-muted capitalize">
                              {opp.deposit_symbol}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* APY */}
                      <div className="mb-3">
                        <p className="text-3xl font-mono font-black text-accent-cyan">
                          {formatApy(opp.apy)}
                        </p>
                        <p className="text-[10px] text-text-secondary uppercase">Annual Yield</p>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between text-xs border-t border-accent-cyan/10 pt-3">
                        <div>
                          <p className="text-text-secondary">TVL</p>
                          <p className="font-mono font-bold text-text-primary">{formatTvl(opp.tvl)}</p>
                        </div>
                        <button
                          onClick={(e) => handleDepositClick(e, opp)}
                          className="px-4 py-1.5 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 rounded-lg text-[10px] font-bold uppercase text-accent-cyan transition-all hover:shadow-[0_0_10px_rgba(0,255,255,0.2)]"
                        >
                          Deposit
                        </button>
                      </div>

                      {/* Expanded Risk Factors */}
                      {selectedOpp?.vault_address === opp.vault_address && opp.risk_factors.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-accent-cyan/10">
                          <p className="text-[10px] text-text-secondary uppercase mb-2 flex items-center gap-1">
                            <Info size={10} /> Risk Factors
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {opp.risk_factors.map((factor, fi) => (
                              <span
                                key={fi}
                                className="px-2 py-1 bg-accent-cyan/5 rounded text-[9px] text-text-secondary"
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
            </div>
          </div>
        </div>
      </div>

      {/* Deposit Modal */}
      <YieldDepositModal
        isOpen={depositModalOpen}
        onClose={() => { setDepositModalOpen(false); setDepositOpp(null); }}
        opportunity={depositOpp}
      />
    </div>
  )
}
