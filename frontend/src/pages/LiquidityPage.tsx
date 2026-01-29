import { WidgetGrid } from '@/components/layout'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import {
  setSelectedProtocol,
  setPools,
  setSelectedPool,
  setSelectedPoolPriceData,
  setSelectedPoolPriceDataLoading,
  setPositions,
  addRebalanceSuggestion,
  removeRebalanceSuggestion,
  setRebalanceSettings,
  setSidecarHealth,
  addFavorite,
  removeFavorite,
  type UnifiedPool,
  type LiquidityProtocol,
  type FavoritePool,
} from '@/features/liquidity/liquiditySlice'
import { cn, formatUSD, formatNumber, formatPercent, shortenAddress } from '@/lib/utils'
import {
  Layers,
  Search,
  RefreshCw,
  Wallet,
  TrendingUp,
  Plus,
  Target,
  Shield,
  Zap,
  BarChart3,
  Activity,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RotateCcw,
  Settings,
  Bell,
  Star,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { Button, Badge, GlassCard, Input, Select } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useMemo, useEffect } from 'react'

// Protocol badge colors
const protocolColors = {
  meteora: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  orca: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

const riskColors = {
  low: 'green',
  medium: 'yellow',
  high: 'red',
} as const

// Protocol Selector Widget
function ProtocolSelectorWidget() {
  const dispatch = useAppDispatch()
  const { selectedProtocol, sidecarHealth } = useAppSelector((state) => state.liquidity)

  const protocols: { value: LiquidityProtocol; label: string; icon: string }[] = [
    { value: 'all', label: 'All Protocols', icon: '🔄' },
    { value: 'meteora', label: 'Meteora DLMM', icon: '⚡' },
    { value: 'orca', label: 'Orca Whirlpools', icon: '🐋' },
  ]

  return (
    <WidgetContainer
      id="protocol-selector"
      title="Protocol"
      icon={<Layers className="w-4 h-4" />}
      noPadding
    >
      <div className="p-3 space-y-3">
        {/* Protocol Toggle */}
        <div className="flex gap-2">
          {protocols.map((p) => (
            <button
              key={p.value}
              onClick={() => dispatch(setSelectedProtocol(p.value))}
              className={cn(
                'flex-1 px-3 py-2 rounded-xl border text-xs font-medium transition-all',
                selectedProtocol === p.value
                  ? 'bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan'
                  : 'bg-white/[0.02] border-white/[0.08] text-white/60 hover:bg-white/[0.04]'
              )}
            >
              <span className="mr-1">{p.icon}</span>
              {p.value === 'all' ? 'All' : p.label.split(' ')[0]}
            </button>
          ))}
        </div>

        {/* Sidecar Health */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2">
            <span className="text-white/50">Sidecar:</span>
            <span className={cn('flex items-center gap-1', sidecarHealth.meteora ? 'text-green-400' : 'text-red-400')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', sidecarHealth.meteora ? 'bg-green-400' : 'bg-red-400')} />
              Meteora
            </span>
            <span className={cn('flex items-center gap-1', sidecarHealth.orca ? 'text-green-400' : 'text-red-400')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', sidecarHealth.orca ? 'bg-green-400' : 'bg-red-400')} />
              Orca
            </span>
          </div>
        </div>
      </div>
    </WidgetContainer>
  )
}

// Favorites Widget
function FavoritesWidget() {
  const dispatch = useAppDispatch()
  const { favorites, pools, selectedPool } = useAppSelector((state) => state.liquidity)

  const handleSelectFavorite = (fav: FavoritePool) => {
    // Find the pool in the pools list and select it
    const pool = pools.find((p) => p.address === fav.address)
    if (pool) {
      dispatch(setSelectedPool(pool))
    }
  }

  const handleRemoveFavorite = (address: string) => {
    dispatch(removeFavorite(address))
  }

  const handleAddFromPool = (pool: UnifiedPool) => {
    const fav: FavoritePool = {
      protocol: pool.protocol,
      address: pool.address,
      name: pool.name,
      tokenXSymbol: pool.tokenX.symbol,
      tokenYSymbol: pool.tokenY.symbol,
      priceSpacing: pool.priceSpacing,
      tvl: pool.tvl,
      apr: pool.apr,
      addedAt: Date.now(),
    }
    dispatch(addFavorite(fav))
  }

  // Check if selected pool is favorited
  const isSelectedPoolFavorited = selectedPool ? favorites.some((f) => f.address === selectedPool.address) : false

  return (
    <WidgetContainer
      id="liquidity-favorites"
      title="Favorites"
      icon={<Star className="w-4 h-4" />}
      badge={favorites.length > 0 ? `${favorites.length}` : undefined}
      badgeVariant="yellow"
      actions={
        selectedPool && !isSelectedPoolFavorited ? (
          <Button variant="ghost" size="sm" onClick={() => handleAddFromPool(selectedPool)}>
            <Star className="w-3 h-3 mr-1" />
            Add
          </Button>
        ) : undefined
      }
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-white/40">
            <Star className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No favorites yet</p>
            <p className="text-[10px] text-white/30 mt-1">Select a pool and add it</p>
          </div>
        ) : (
          favorites.map((fav) => {
            const pColors = protocolColors[fav.protocol]
            const isSelected = selectedPool?.address === fav.address

            return (
              <div
                key={fav.address}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all group',
                  isSelected
                    ? 'border-accent-yellow/50 bg-accent-yellow/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
                onClick={() => handleSelectFavorite(fav)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Star className={cn('w-4 h-4', isSelected ? 'text-accent-yellow fill-accent-yellow' : 'text-accent-yellow/50')} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-white truncate">
                        {fav.tokenXSymbol}/{fav.tokenYSymbol}
                      </span>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', pColors.bg, pColors.text)}>
                        {fav.protocol === 'meteora' ? 'MET' : 'ORC'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-white/50">
                      <span>{fav.priceSpacing}{fav.protocol === 'meteora' ? 'bps' : 'ts'}</span>
                      {fav.apr !== undefined && (
                        <span className="text-accent-green">{(fav.apr * 100).toFixed(1)}% APR</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <a
                    href={fav.protocol === 'orca'
                      ? `https://www.orca.so/pools/${fav.address}`
                      : `https://app.meteora.ag/dlmm/${fav.address}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFavorite(fav.address)
                    }}
                    className="p-1 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </WidgetContainer>
  )
}

// Unified Pools Widget
function LiquidityPoolsWidget() {
  const dispatch = useAppDispatch()
  const { pools, selectedProtocol, loading, selectedPool } = useAppSelector((state) => state.liquidity)
  const [search, setSearch] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch pools
  const fetchPools = async () => {
    setIsRefreshing(true)
    try {
      const protocol = selectedProtocol === 'all' ? '' : `?protocol=${selectedProtocol}`
      const res = await fetch(`/api/liquidity/pools${protocol}`)
      const data = await res.json()
      if (data.success) {
        dispatch(setPools(data.pools))
      }
    } catch (err) {
      console.error('Failed to fetch pools:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchPools()
  }, [selectedProtocol])

  // Filter pools
  const filteredPools = useMemo(() => {
    return pools
      .filter((p) => {
        if (search) {
          const q = search.toLowerCase()
          return p.name?.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => b.tvl - a.tvl)
  }, [pools, search])

  const handleSelectPool = (pool: UnifiedPool) => {
    dispatch(setSelectedPool(pool))
  }

  return (
    <WidgetContainer
      id="liquidity-pools"
      title="Liquidity Pools"
      icon={<Layers className="w-4 h-4" />}
      badge={`${pools.length} pools`}
      badgeVariant="purple"
      actions={
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-28"
            icon={<Search className="w-3 h-3" />}
          />
          <Button variant="ghost" size="icon-sm" onClick={fetchPools}>
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      }
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_50px_70px_60px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold">
          <div>Pool</div>
          <div>Proto</div>
          <div>TVL</div>
          <div>APR</div>
        </div>

        {filteredPools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <Layers size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">No pools found</span>
          </div>
        ) : (
          filteredPools.slice(0, 50).map((pool) => {
            const isSelected = selectedPool?.address === pool.address
            const pColors = protocolColors[pool.protocol]

            return (
              <div
                key={`${pool.protocol}-${pool.address}`}
                onClick={() => handleSelectPool(pool)}
                className={cn(
                  'grid grid-cols-[1fr_50px_70px_60px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border rounded-xl',
                  isSelected
                    ? 'border-accent-purple/50 bg-accent-purple/10'
                    : 'border-white/[0.06] hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
              >
                {/* Pool */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('text-[12px] font-semibold text-white truncate', isSelected && 'text-accent-purple')}>
                    {pool.tokenX.symbol}/{pool.tokenY.symbol}
                  </span>
                  <span className={cn(
                    'text-[9px] font-bold px-1 py-0.5 rounded shrink-0',
                    isSelected ? 'bg-accent-purple/20 text-accent-purple' : 'bg-white/10 text-white/50'
                  )}>
                    {pool.priceSpacing}{pool.protocol === 'meteora' ? 'bps' : 'ts'}
                  </span>
                </div>

                {/* Protocol Badge */}
                <div>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', pColors.bg, pColors.text)}>
                    {pool.protocol === 'meteora' ? 'MET' : 'ORC'}
                  </span>
                </div>

                {/* TVL */}
                <div className="text-[12px] font-mono text-white/70 truncate">
                  {formatNumber(pool.tvl)}
                </div>

                {/* APR */}
                <div className="text-[12px] font-mono text-accent-green">
                  {formatPercent(pool.apr * 100, 1)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </WidgetContainer>
  )
}

// Unified Positions Widget
function LiquidityPositionsWidget() {
  const dispatch = useAppDispatch()
  const { positions, selectedProtocol } = useAppSelector((state) => state.liquidity)
  const { activeWallet } = useAppSelector((state) => state.wallet)

  // Filter positions by protocol
  const filteredPositions = useMemo(() => {
    return positions.filter((p) => {
      if (selectedProtocol !== 'all' && p.protocol !== selectedProtocol) return false
      return true
    })
  }, [positions, selectedProtocol])

  const totalValue = filteredPositions.reduce((sum, p) => sum + parseFloat(p.tokenXAmount || '0'), 0)

  return (
    <WidgetContainer
      id="liquidity-positions"
      title="Your Positions"
      icon={<Wallet className="w-4 h-4" />}
      badge={filteredPositions.length > 0 ? `${filteredPositions.length} active` : undefined}
      badgeVariant="cyan"
      actions={
        <Button variant="primary" size="icon-sm">
          <Plus className="w-4 h-4" />
        </Button>
      }
      noPadding
    >
      <div className="h-full flex flex-col">
        {/* Stats */}
        <div className="px-4 py-3 border-b border-white/[0.04] grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-white/50">Total Positions</p>
            <p className="text-lg font-mono-numbers">{filteredPositions.length}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">In Range</p>
            <p className="text-lg font-mono-numbers text-accent-green">
              {filteredPositions.filter((p) => p.inRange).length}
            </p>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto glass-scrollbar">
          <AnimatePresence>
            {filteredPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
                <Wallet className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm mb-3">No active positions</p>
                <Button variant="primary" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Create Position
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {filteredPositions.map((position, index) => {
                  const pColors = protocolColors[position.protocol]

                  return (
                    <motion.div
                      key={position.positionPubkey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.03 }}
                      className="p-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', pColors.bg, pColors.text)}>
                            {position.protocol === 'meteora' ? 'MET' : 'ORC'}
                          </span>
                          <span className="font-medium text-sm">{shortenAddress(position.poolAddress)}</span>
                          <Badge variant={riskColors[position.riskProfile]} size="sm">
                            {position.riskProfile}
                          </Badge>
                        </div>
                        <span className={cn(
                          'flex items-center gap-1 text-xs',
                          position.inRange ? 'text-accent-green' : 'text-accent-red'
                        )}>
                          {position.inRange ? (
                            <><CheckCircle size={12} /> In Range</>
                          ) : (
                            <><AlertTriangle size={12} /> Out of Range</>
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-white/50">Range:</span>{' '}
                          <span className="font-mono">{position.rangeMin} - {position.rangeMax}</span>
                        </div>
                        <div>
                          <span className="text-white/50">Auto-Rebalance:</span>{' '}
                          <span className={position.autoRebalance ? 'text-accent-cyan' : 'text-white/50'}>
                            {position.autoRebalance ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </div>

                      {!position.inRange && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-accent-yellow">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Consider rebalancing - {(position.distanceFromEdge * 100).toFixed(1)}% from edge</span>
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

// Rebalance Widget
function RebalanceWidget() {
  const dispatch = useAppDispatch()
  const { rebalanceSuggestions, rebalanceSettings } = useAppSelector((state) => state.liquidity)

  const [isEngineRunning, setIsEngineRunning] = useState(false)

  // Fetch settings
  useEffect(() => {
    fetch('/api/liquidity/rebalance/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          dispatch(setRebalanceSettings(data.settings))
          setIsEngineRunning(data.settings.running)
        }
      })
      .catch(console.error)
  }, [dispatch])

  const handleToggleEngine = async () => {
    const endpoint = isEngineRunning ? '/api/liquidity/rebalance/stop' : '/api/liquidity/rebalance/start'
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setIsEngineRunning(data.running)
      }
    } catch (err) {
      console.error('Failed to toggle rebalance engine:', err)
    }
  }

  const handleDismiss = async (positionPubkey: string) => {
    try {
      await fetch('/api/liquidity/rebalance/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_pubkey: positionPubkey }),
      })
      dispatch(removeRebalanceSuggestion(positionPubkey))
    } catch (err) {
      console.error('Failed to dismiss suggestion:', err)
    }
  }

  const urgencyColors = {
    high: 'text-red-400 bg-red-500/10 border-red-500/30',
    medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    low: 'text-green-400 bg-green-500/10 border-green-500/30',
  }

  return (
    <WidgetContainer
      id="rebalance-manager"
      title="Rebalance Manager"
      icon={<RotateCcw className="w-4 h-4" />}
      badge={rebalanceSuggestions.length > 0 ? `${rebalanceSuggestions.length}` : undefined}
      badgeVariant="yellow"
      actions={
        <Button
          variant={isEngineRunning ? 'success' : 'ghost'}
          size="sm"
          onClick={handleToggleEngine}
        >
          {isEngineRunning ? (
            <><Activity className="w-3 h-3 mr-1" /> Running</>
          ) : (
            <><Settings className="w-3 h-3 mr-1" /> Start</>
          )}
        </Button>
      }
      noPadding
    >
      <div className="h-full flex flex-col">
        {/* Settings Summary */}
        <div className="px-4 py-3 border-b border-white/[0.04] text-xs">
          <div className="flex items-center justify-between">
            <span className="text-white/50">Check Interval:</span>
            <span className="font-mono">{rebalanceSettings?.checkInterval || 30}s</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-white/50">Thresholds:</span>
            <div className="flex gap-2">
              <span className="text-red-400">H:{((rebalanceSettings?.thresholds?.high || 0.1) * 100).toFixed(0)}%</span>
              <span className="text-yellow-400">M:{((rebalanceSettings?.thresholds?.medium || 0.15) * 100).toFixed(0)}%</span>
              <span className="text-green-400">L:{((rebalanceSettings?.thresholds?.low || 0.2) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex-1 overflow-auto glass-scrollbar">
          {rebalanceSuggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-white/40">
              <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">All positions healthy</p>
              <p className="text-[10px] text-white/30 mt-1">
                {isEngineRunning ? 'Monitoring active' : 'Start engine to monitor'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {rebalanceSuggestions.map((suggestion) => (
                <div key={suggestion.positionPubkey} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bell className={cn('w-4 h-4', urgencyColors[suggestion.urgency].split(' ')[0])} />
                      <span className={cn('text-[10px] px-2 py-0.5 rounded border', urgencyColors[suggestion.urgency])}>
                        {suggestion.urgency.toUpperCase()}
                      </span>
                      <span className="text-xs text-white/70">{shortenAddress(suggestion.positionPubkey)}</span>
                    </div>
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded',
                      protocolColors[suggestion.protocol].bg,
                      protocolColors[suggestion.protocol].text
                    )}>
                      {suggestion.protocol === 'meteora' ? 'MET' : 'ORC'}
                    </span>
                  </div>

                  <div className="text-xs text-white/50 mb-2">
                    {suggestion.reason === 'out_of_range' ? 'Position is out of range' : 'Position near range edge'}
                    <span className="text-white/70 ml-1">
                      ({(suggestion.distanceFromEdge * 100).toFixed(1)}% from edge)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" className="flex-1">
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Rebalance
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDismiss(suggestion.positionPubkey)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WidgetContainer>
  )
}

// Strategy Preview Widget (simplified)
function CreatePositionWidget() {
  const { selectedPool, selectedProtocol } = useAppSelector((state) => state.liquidity)
  const [riskProfile, setRiskProfile] = useState<'low' | 'medium' | 'high'>('medium')
  const [autoRebalance, setAutoRebalance] = useState(false)

  const riskProfiles = {
    low: { label: 'Wide', desc: 'Lower IL', color: 'green', rangePct: 50 },
    medium: { label: 'Balanced', desc: 'Moderate', color: 'yellow', rangePct: 20 },
    high: { label: 'Concentrated', desc: 'Higher fees', color: 'red', rangePct: 7.5 },
  }

  return (
    <WidgetContainer
      id="create-position"
      title="Create Position"
      icon={<TrendingUp className="w-4 h-4" />}
    >
      {!selectedPool ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
          <Layers className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Select a pool to create position</p>
        </div>
      ) : (
        <div className="space-y-4 overflow-auto">
          {/* Selected Pool Info */}
          <GlassCard padding="sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded font-medium',
                  protocolColors[selectedPool.protocol].bg,
                  protocolColors[selectedPool.protocol].text
                )}>
                  {selectedPool.protocol === 'meteora' ? 'Meteora' : 'Orca'}
                </span>
                <div>
                  <div className="text-sm font-bold">{selectedPool.tokenX.symbol}/{selectedPool.tokenY.symbol}</div>
                  <div className="text-[10px] text-white/50">
                    {selectedPool.priceSpacing}{selectedPool.protocol === 'meteora' ? 'bps' : ' tick spacing'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono">{formatUSD(selectedPool.price)}</div>
                <div className="text-[10px] text-accent-green">{formatPercent(selectedPool.apr * 100)} APR</div>
              </div>
            </div>
          </GlassCard>

          {/* Risk Profile Selection */}
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 block">Risk Profile</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(riskProfiles) as [keyof typeof riskProfiles, typeof riskProfiles.low][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setRiskProfile(key)}
                  className={cn(
                    'p-2 rounded-xl border text-center transition-all',
                    riskProfile === key
                      ? `bg-accent-${config.color}/10 border-accent-${config.color}/40`
                      : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]'
                  )}
                >
                  <Shield size={14} className={cn(
                    'mx-auto mb-1',
                    riskProfile === key ? `text-accent-${config.color}` : 'text-white/40'
                  )} />
                  <div className={cn(
                    'text-[10px] font-bold uppercase',
                    riskProfile === key ? `text-accent-${config.color}` : 'text-white/70'
                  )}>
                    {config.label}
                  </div>
                  <div className="text-[8px] text-white/40 mt-0.5">{config.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Rebalance Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]">
            <div>
              <div className="text-xs font-medium">Auto-Rebalance</div>
              <div className="text-[10px] text-white/50">Automatically rebalance when out of range</div>
            </div>
            <button
              onClick={() => setAutoRebalance(!autoRebalance)}
              className={cn(
                'w-12 h-6 rounded-full transition-all relative',
                autoRebalance ? 'bg-accent-cyan' : 'bg-white/20'
              )}
            >
              <div
                className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                  autoRebalance ? 'left-7' : 'left-1'
                )}
              />
            </button>
          </div>

          {/* Create Button */}
          <button
            className={cn(
              'w-full relative overflow-hidden rounded-xl p-3 transition-all duration-300',
              'bg-gradient-to-r from-[var(--accent-purple)] via-[var(--accent-purple)]/90 to-[var(--accent-cyan)]',
              'hover:shadow-[0_0_30px_rgba(153,69,255,0.3)] hover:scale-[1.02]',
              'active:scale-[0.98]',
              'group'
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="relative flex items-center justify-center gap-2">
              <Zap size={18} className="text-white" />
              <span className="text-sm font-black uppercase tracking-wider text-white">
                Create Position
              </span>
            </div>
          </button>
        </div>
      )}
    </WidgetContainer>
  )
}

export default function LiquidityPage() {
  return (
    <WidgetGrid page="liquidity">
      <div key="protocol-selector">
        <ProtocolSelectorWidget />
      </div>
      <div key="liquidity-favorites">
        <FavoritesWidget />
      </div>
      <div key="liquidity-pools">
        <LiquidityPoolsWidget />
      </div>
      <div key="liquidity-positions">
        <LiquidityPositionsWidget />
      </div>
      <div key="rebalance-manager">
        <RebalanceWidget />
      </div>
      <div key="create-position">
        <CreatePositionWidget />
      </div>
    </WidgetGrid>
  )
}
