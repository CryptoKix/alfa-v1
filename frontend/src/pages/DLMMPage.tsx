import { WidgetGrid, WidgetSelector } from '@/components/layout'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setSelectedPool, setFavorites, addFavorite, removeFavorite, setSelectedPoolBins, setSelectedPoolBinsLoading, type DLMMPool, type PoolBinLiquidity } from '@/features/dlmm/dlmmSlice'
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
  Star,
  Trash2,
  ExternalLink,
  Link,
  Loader2,
} from 'lucide-react'
import { Button, Badge, GlassCard, Input, Select } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useMemo, useEffect } from 'react'

const riskColors = {
  low: 'green',
  medium: 'yellow',
  high: 'red',
} as const

function DLMMPoolsWidget() {
  const dispatch = useAppDispatch()
  const { pools, filters, loading, selectedPool } = useAppSelector((state) => state.dlmm)
  const [search, setSearch] = useState('')

  const filteredPools = pools
    .filter((p) => {
      if (search) {
        const q = search.toLowerCase()
        return (
          p.name?.toLowerCase().includes(q) ||
          p.token_x_symbol?.toLowerCase().includes(q) ||
          p.token_y_symbol?.toLowerCase().includes(q)
        )
      }
      return true
    })
    .filter((p) => {
      if (filters.minLiquidity && p.liquidity < filters.minLiquidity) return false
      if (filters.minApr && p.apr < filters.minApr) return false
      return true
    })
    .sort((a, b) => b.apr - a.apr)

  const handleSelectPool = (pool: typeof pools[0]) => {
    dispatch(setSelectedPool(pool))
  }

  return (
    <WidgetContainer
      id="dlmm-pools"
      title="DLMM Pools"
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
          <Button variant="ghost" size="icon-sm">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </div>
      }
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_70px_70px_60px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div>Pool</div>
          <div>TVL</div>
          <div>Vol 24h</div>
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
            return (
              <div
                key={pool.address}
                onClick={() => handleSelectPool(pool)}
                className={cn(
                  'grid grid-cols-[1fr_70px_70px_60px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border rounded-xl',
                  isSelected
                    ? 'border-accent-purple/50 bg-accent-purple/10'
                    : 'border-white/[0.06] hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
              >
                {/* Pool */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("text-[12px] font-semibold text-white truncate", isSelected && "text-accent-purple")}>
                    {pool.token_x_symbol}/{pool.token_y_symbol}
                  </span>
                  <span className={cn(
                    "text-[9px] font-bold px-1 py-0.5 rounded shrink-0",
                    isSelected ? "bg-accent-purple/20 text-accent-purple" : "bg-white/10 text-white/50"
                  )}>
                    {pool.bin_step}bps
                  </span>
                </div>

                {/* TVL */}
                <div className="text-[12px] font-mono text-white/70 truncate">
                  {formatNumber(pool.liquidity)}
                </div>

                {/* Volume */}
                <div className="text-[12px] font-mono text-white/70 truncate">
                  {formatNumber(pool.volume_24h)}
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

function DLMMPositionsWidget() {
  const { positions } = useAppSelector((state) => state.dlmm)

  const activePositions = positions.filter((p) => p.status === 'active')
  const totalValue = activePositions.reduce((sum, p) => sum + (p.current_usd_value || 0), 0)
  const totalPnl = activePositions.reduce((sum, p) => sum + (p.roi?.pnl_usd || 0), 0)

  return (
    <WidgetContainer
      id="dlmm-positions"
      title="Your Positions"
      icon={<Wallet className="w-4 h-4" />}
      badge={activePositions.length > 0 ? `${activePositions.length} active` : undefined}
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
            <p className="text-xs text-white/50">Total Value</p>
            <p className="text-lg font-mono-numbers">{formatUSD(totalValue)}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">Total P/L</p>
            <p
              className={cn(
                'text-lg font-mono-numbers',
                totalPnl >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'
              )}
            >
              {totalPnl >= 0 ? '+' : ''}{formatUSD(totalPnl)}
            </p>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto glass-scrollbar">
          <AnimatePresence>
            {activePositions.length === 0 ? (
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
                {activePositions.map((position, index) => (
                  <motion.div
                    key={position.position_pubkey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    className="p-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {position.token_x_symbol}/{position.token_y_symbol}
                        </span>
                        <Badge
                          variant={riskColors[position.risk_profile] as 'green' | 'yellow' | 'red'}
                          size="sm"
                        >
                          {position.risk_profile}
                        </Badge>
                      </div>
                      {position.roi && (
                        <span
                          className={cn(
                            'font-mono-numbers text-sm',
                            position.roi.pnl_usd >= 0
                              ? 'text-[var(--accent-green)]'
                              : 'text-[var(--accent-red)]'
                          )}
                        >
                          {position.roi.pnl_usd >= 0 ? '+' : ''}
                          {formatPercent(position.roi.roi_pct)}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-white/50">Value:</span>{' '}
                        <span className="font-mono-numbers">{formatUSD(position.current_usd_value)}</span>
                      </div>
                      <div>
                        <span className="text-white/50">Strategy:</span>{' '}
                        <span>{position.strategy_type}</span>
                      </div>
                    </div>

                    {/* Unclaimed fees */}
                    {(position.unclaimed_fees_x > 0 || position.unclaimed_fees_y > 0) && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--accent-cyan)]">
                        <TrendingUp className="w-3 h-3" />
                        <span>
                          Unclaimed: {formatNumber(position.unclaimed_fees_x)} {position.token_x_symbol} + {formatNumber(position.unclaimed_fees_y)} {position.token_y_symbol}
                        </span>
                      </div>
                    )}
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

function DLMMFavoritesWidget() {
  const dispatch = useAppDispatch()
  const { favorites, pools } = useAppSelector((state) => state.dlmm)
  const [inputUrl, setInputUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load favorites on mount
  useEffect(() => {
    fetch('/api/dlmm/favorites')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          dispatch(setFavorites(data.favorites))
        }
      })
      .catch(console.error)
  }, [dispatch])

  // Refresh all favorites with latest data
  const handleRefreshFavorites = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/dlmm/favorites/refresh', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        dispatch(setFavorites(data.favorites))
      }
    } catch (err) {
      console.error('Failed to refresh favorites:', err)
    } finally {
      setRefreshing(false)
    }
  }

  // Parse pool address from Meteora URL
  const parsePoolAddress = (url: string): string | null => {
    try {
      // Handle full URL: https://www.meteora.ag/dlmm/5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6?referrer=home
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      const dlmmIndex = pathParts.indexOf('dlmm')
      if (dlmmIndex !== -1 && pathParts[dlmmIndex + 1]) {
        return pathParts[dlmmIndex + 1]
      }
    } catch {
      // Not a valid URL, check if it's a raw address (base58)
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(url.trim())) {
        return url.trim()
      }
    }
    return null
  }

  const handleAddFavorite = async () => {
    const poolAddress = parsePoolAddress(inputUrl)
    if (!poolAddress) {
      setError('Invalid Meteora URL or pool address')
      return
    }

    // Check if already in favorites
    if (favorites.some((f) => f.address === poolAddress)) {
      setError('Pool already in favorites')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/dlmm/favorites/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_address: poolAddress }),
      })
      const data = await res.json()

      if (data.success) {
        dispatch(addFavorite(data.favorite))
        setInputUrl('')
      } else {
        setError(data.error || 'Failed to add favorite')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveFavorite = async (address: string) => {
    try {
      const res = await fetch('/api/dlmm/favorites/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_address: address }),
      })
      const data = await res.json()
      if (data.success) {
        dispatch(removeFavorite(address))
      }
    } catch (err) {
      console.error('Failed to remove favorite:', err)
    }
  }

  const handleSelectFavorite = async (fav: typeof favorites[0]) => {
    // Try to find full pool data in loaded pools
    const fullPool = pools.find((p) => p.address === fav.address)
    if (fullPool) {
      dispatch(setSelectedPool(fullPool))
      return
    }

    // If favorite has incomplete data (? symbols), fetch from API
    if (fav.token_x_symbol === '?' || fav.token_y_symbol === '?' || !fav.bin_step) {
      try {
        const res = await fetch(`/api/dlmm/pools/${fav.address}`)
        const data = await res.json()
        if (data.success && data.pool) {
          dispatch(setSelectedPool(data.pool as DLMMPool))
          return
        }
      } catch (err) {
        console.error('Failed to fetch pool details:', err)
      }
    }

    // Fallback: use favorite data
    dispatch(
      setSelectedPool({
        address: fav.address,
        name: fav.name || `${fav.token_x_symbol}/${fav.token_y_symbol}`,
        token_x_symbol: fav.token_x_symbol || '?',
        token_y_symbol: fav.token_y_symbol || '?',
        token_x_mint: '',
        token_y_mint: '',
        bin_step: fav.bin_step || 0,
        base_fee_bps: 0,
        protocol_fee_bps: 0,
        liquidity: fav.liquidity || 0,
        volume_24h: 0,
        fees_24h: 0,
        apr: fav.apr || 0,
        price: 0,
      } as DLMMPool)
    )
  }

  return (
    <WidgetContainer
      id="dlmm-favorites"
      title="Favorite Pools"
      icon={<Star className="w-4 h-4" />}
      badge={favorites.length > 0 ? `${favorites.length}` : undefined}
      badgeVariant="yellow"
      noPadding
      actions={
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefreshFavorites}
          disabled={refreshing}
          title="Refresh favorites data"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </Button>
      }
    >
      <div className="h-full flex flex-col">
        {/* Add Pool Input */}
        <div className="px-4 py-3 border-b border-white/[0.04] space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                id="dlmm-pool-url"
                name="dlmm-pool-url"
                type="text"
                autoComplete="off"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFavorite()}
                placeholder="Paste Meteora pool URL..."
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent-cyan/50 focus:outline-none transition-colors"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddFavorite}
              disabled={loading || !inputUrl.trim()}
              className="shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
          {error && <p className="text-xs text-accent-red">{error}</p>}
        </div>

        {/* Favorites List */}
        <div className="flex-1 overflow-auto glass-scrollbar">
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-white/40">
              <Star className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No favorites yet</p>
              <p className="text-[10px] text-white/30 mt-1">Paste a Meteora pool URL above</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {favorites.map((fav) => (
                <div
                  key={fav.address}
                  className="px-4 py-3 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleSelectFavorite(fav)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">
                          {fav.token_x_symbol}/{fav.token_y_symbol}
                        </span>
                        <Badge variant="purple" size="sm">
                          {fav.bin_step}bps
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`https://www.meteora.ag/dlmm/${fav.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded text-white/40 hover:text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
                        title="Open in Meteora"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveFavorite(fav.address)
                        }}
                        className="p-1.5 rounded text-white/40 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {(fav.liquidity || fav.apr) && (
                    <div className="flex gap-4 mt-1 text-[10px] text-white/50">
                      {fav.liquidity && <span>TVL: {formatNumber(fav.liquidity)}</span>}
                      {fav.apr && (
                        <span className="text-accent-green">APR: {formatPercent((fav.apr || 0) * 100, 1)}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WidgetContainer>
  )
}

// Pool Liquidity Distribution Chart - Shows ACTUAL bin liquidity from the pool
function PoolLiquidityChart({ poolAddress }: { poolAddress: string }) {
  const dispatch = useAppDispatch()
  const { selectedPoolBins, selectedPoolBinsLoading } = useAppSelector((state) => state.dlmm)
  const [error, setError] = useState<string | null>(null)

  // Fetch bin liquidity data when pool changes
  useEffect(() => {
    if (!poolAddress) return

    const fetchBins = async () => {
      dispatch(setSelectedPoolBinsLoading(true))
      setError(null)

      try {
        const response = await fetch(`/api/dlmm/pools/${poolAddress}/bins?left=35&right=35`)
        const data = await response.json()

        if (data.success) {
          dispatch(setSelectedPoolBins({
            activeBinId: data.activeBinId,
            bins: data.bins,
            binStep: data.binStep
          }))
        } else {
          setError(data.error || 'Failed to load bin data')
          dispatch(setSelectedPoolBins(null))
        }
      } catch (err) {
        setError('Failed to fetch bin liquidity')
        dispatch(setSelectedPoolBins(null))
      }
    }

    fetchBins()
  }, [poolAddress, dispatch])

  if (selectedPoolBinsLoading) {
    return (
      <div className="flex items-center justify-center h-32 bg-black/30 rounded-xl border border-white/5">
        <Loader2 className="w-5 h-5 animate-spin text-accent-cyan" />
        <span className="ml-2 text-sm text-white/50">Loading liquidity distribution...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 bg-black/30 rounded-xl border border-white/5 text-white/40 text-sm">
        {error}
      </div>
    )
  }

  if (!selectedPoolBins || selectedPoolBins.bins.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 bg-black/30 rounded-xl border border-white/5 text-white/40 text-sm">
        No bin data available
      </div>
    )
  }

  const { bins, activeBinId } = selectedPoolBins
  const activeBinIndex = bins.findIndex(b => b.binId === activeBinId)
  const minPrice = bins[0]?.price || 0
  const maxPrice = bins[bins.length - 1]?.price || 0

  return (
    <div className="space-y-3">
      {/* Bin visualization */}
      <div className="relative h-32 bg-black/30 rounded-xl border border-white/5 p-3 overflow-hidden">
        {/* Price labels */}
        <div className="absolute top-1 left-2 text-[8px] text-white/40 font-mono">
          ${minPrice.toFixed(6)}
        </div>
        <div className="absolute top-1 right-2 text-[8px] text-white/40 font-mono">
          ${maxPrice.toFixed(6)}
        </div>

        {/* Current price line */}
        {activeBinIndex >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-accent-cyan/70"
            style={{
              left: `${(activeBinIndex / bins.length) * 100}%`,
              transform: 'translateX(-50%)'
            }}
          >
            <div
              className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent-cyan"
              style={{ boxShadow: '0 0 8px #00ffff' }}
            />
          </div>
        )}

        {/* Bins */}
        <div className="flex items-end justify-center gap-[1px] h-full pt-4">
          {bins.map((bin, i) => {
            const isActive = bin.binId === activeBinId
            const hasLiquidity = bin.normalizedHeight > 0.01

            return (
              <div
                key={bin.binId}
                className={cn(
                  "flex-1 max-w-3 rounded-t transition-all duration-300",
                  isActive
                    ? "bg-accent-cyan"
                    : hasLiquidity
                      ? "bg-accent-purple/70"
                      : "bg-white/10"
                )}
                style={{
                  height: `${Math.max(bin.normalizedHeight * 100, 2)}%`,
                  boxShadow: isActive ? '0 0 8px rgba(0,255,255,0.5)' : undefined,
                }}
                title={`Bin ${bin.binId}: $${bin.price.toFixed(6)}`}
              />
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-accent-cyan" />
            <span className="text-white/50">Active Bin</span>
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-accent-purple/70" />
            <span className="text-white/50">Liquidity</span>
          </span>
        </div>
        <span className="text-white/50">
          Bins: <span className="text-white font-mono">{bins.length}</span>
        </span>
      </div>
    </div>
  )
}

// Risk profile configurations
const riskProfiles = {
  low: { bins: 50, rangePct: 50, color: 'green', label: 'Wide Range', desc: 'Lower IL risk, lower fees' },
  medium: { bins: 25, rangePct: 25, color: 'yellow', label: 'Balanced', desc: 'Moderate risk/reward' },
  high: { bins: 10, rangePct: 10, color: 'red', label: 'Concentrated', desc: 'Higher fees, higher IL risk' },
}

// Strategy type configurations
const strategyTypes = {
  spot: { label: 'Spot', desc: 'Uniform distribution', icon: BarChart3 },
  curve: { label: 'Curve', desc: 'Bell curve around price', icon: Activity },
  bidask: { label: 'Bid-Ask', desc: 'Separate buy/sell zones', icon: Target },
}

// Bin Preview Component
function BinPreview({
  binCount,
  strategyType,
  riskProfile,
  currentPrice,
  binStep,
}: {
  binCount: number
  strategyType: 'spot' | 'curve' | 'bidask'
  riskProfile: 'low' | 'medium' | 'high'
  currentPrice: number
  binStep: number
}) {
  const bins = useMemo(() => {
    const result = []
    const centerBin = Math.floor(binCount / 2)

    for (let i = 0; i < binCount; i++) {
      let height = 0
      const distFromCenter = Math.abs(i - centerBin)
      const normalizedDist = distFromCenter / centerBin

      switch (strategyType) {
        case 'spot':
          // Uniform distribution
          height = 0.7
          break
        case 'curve':
          // Bell curve - highest at center
          height = Math.exp(-4 * normalizedDist * normalizedDist)
          break
        case 'bidask':
          // Two peaks on either side
          if (i < centerBin - 2) {
            height = 0.3 + 0.5 * (1 - (centerBin - i) / centerBin)
          } else if (i > centerBin + 2) {
            height = 0.3 + 0.5 * (1 - (i - centerBin) / centerBin)
          } else {
            height = 0.2
          }
          break
      }

      // Calculate price for this bin
      const binOffset = i - centerBin
      const priceMultiplier = Math.pow(1 + binStep / 10000, binOffset)
      const price = currentPrice * priceMultiplier

      result.push({
        index: i,
        height: Math.max(0.1, height),
        isCenter: i === centerBin,
        price,
      })
    }
    return result
  }, [binCount, strategyType, currentPrice, binStep])

  const riskConfig = riskProfiles[riskProfile]
  const minPrice = bins[0]?.price || 0
  const maxPrice = bins[bins.length - 1]?.price || 0

  return (
    <div className="space-y-3">
      {/* Bin visualization */}
      <div className="relative h-32 bg-black/30 rounded-xl border border-white/5 p-3 overflow-hidden">
        {/* Price labels */}
        <div className="absolute top-1 left-2 text-[8px] text-white/40 font-mono">
          ${minPrice.toFixed(4)}
        </div>
        <div className="absolute top-1 right-2 text-[8px] text-white/40 font-mono">
          ${maxPrice.toFixed(4)}
        </div>

        {/* Current price line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-accent-cyan/50" style={{ transform: 'translateX(-50%)' }}>
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent-cyan" style={{ boxShadow: '0 0 8px #00ffff' }} />
        </div>

        {/* Bins */}
        <div className="flex items-end justify-center gap-[1px] h-full pt-4">
          {bins.map((bin) => (
            <div
              key={bin.index}
              className={cn(
                "flex-1 max-w-3 rounded-t transition-all duration-300",
                bin.isCenter
                  ? "bg-accent-cyan"
                  : `bg-accent-${riskConfig.color}/60`
              )}
              style={{
                height: `${bin.height * 100}%`,
                boxShadow: bin.isCenter ? '0 0 8px rgba(0,255,255,0.5)' : undefined,
              }}
            />
          ))}
        </div>
      </div>

      {/* Range info */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/50">
          Range: <span className="text-white font-mono">±{riskConfig.rangePct}%</span>
        </span>
        <span className="text-white/50">
          Bins: <span className="text-white font-mono">{binCount}</span>
        </span>
        <span className="text-white/50">
          Step: <span className="text-white font-mono">{binStep}bps</span>
        </span>
      </div>
    </div>
  )
}

function DLMMStrategyWidget() {
  const { selectedPool } = useAppSelector((state) => state.dlmm)
  const [riskProfile, setRiskProfile] = useState<'low' | 'medium' | 'high'>('medium')
  const [strategyType, setStrategyType] = useState<'spot' | 'curve' | 'bidask'>('spot')
  const [depositAmountX, setDepositAmountX] = useState('1.0')
  const [depositAmountY, setDepositAmountY] = useState('100.0')
  const [depositMode, setDepositMode] = useState<'dual' | 'single-x' | 'single-y'>('dual')

  const riskConfig = riskProfiles[riskProfile]
  const binCount = riskConfig.bins

  // Calculate estimated metrics
  const estimatedMetrics = useMemo(() => {
    if (!selectedPool) return null

    // APR from Meteora is a decimal (0.2635 = 26.35%)
    const baseAprDecimal = selectedPool.apr
    const concentrationMultiplier = riskProfile === 'high' ? 3 : riskProfile === 'medium' ? 1.5 : 1
    const adjustedAprDecimal = baseAprDecimal * concentrationMultiplier

    // Estimate USD value based on deposit mode
    // For token X (often SOL), assume ~$150. For token Y (often USDC), assume $1
    const xUsd = parseFloat(depositAmountX || '0') * (selectedPool.price > 0 ? selectedPool.price : 150)
    const yUsd = parseFloat(depositAmountY || '0') * 1 // Assume stablecoin
    const depositUsd = depositMode === 'single-x' ? xUsd : depositMode === 'single-y' ? yUsd : xUsd + yUsd

    // Daily yield = deposit * (apr_decimal / 365)
    const dailyYield = (adjustedAprDecimal / 365) * depositUsd

    return {
      adjustedAprPct: adjustedAprDecimal * 100, // Convert to percentage for display
      dailyYield,
      weeklyYield: dailyYield * 7,
      depositUsd,
      ilRisk: riskProfile === 'high' ? 'High' : riskProfile === 'medium' ? 'Medium' : 'Low',
    }
  }, [selectedPool, riskProfile, depositAmountX, depositAmountY, depositMode])

  return (
    <WidgetContainer
      id="dlmm-strategy"
      title="Create Position"
      icon={<TrendingUp className="w-4 h-4" />}
    >
      {!selectedPool ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
          <Layers className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Select a pool to create position</p>
        </div>
      ) : (
        <div className="space-y-4 overflow-auto custom-scrollbar pr-1">
          {/* Selected Pool Info */}
          <GlassCard padding="sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
                  <Layers size={14} />
                </div>
                <div>
                  <div className="text-sm font-bold">{selectedPool.token_x_symbol}/{selectedPool.token_y_symbol}</div>
                  <div className="text-[10px] text-white/50">{selectedPool.bin_step}bps bin step</div>
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
                    "p-2 rounded-xl border text-center transition-all",
                    riskProfile === key
                      ? `bg-accent-${config.color}/10 border-accent-${config.color}/40`
                      : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]"
                  )}
                >
                  <Shield size={14} className={cn(
                    "mx-auto mb-1",
                    riskProfile === key ? `text-accent-${config.color}` : "text-white/40"
                  )} />
                  <div className={cn(
                    "text-[10px] font-bold uppercase",
                    riskProfile === key ? `text-accent-${config.color}` : "text-white/70"
                  )}>
                    {config.label}
                  </div>
                  <div className="text-[8px] text-white/40 mt-0.5">{config.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Strategy Type Selection */}
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 block">Strategy Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(strategyTypes) as [keyof typeof strategyTypes, typeof strategyTypes.spot][]).map(([key, config]) => {
                const Icon = config.icon
                return (
                  <button
                    key={key}
                    onClick={() => setStrategyType(key)}
                    className={cn(
                      "p-2 rounded-xl border text-center transition-all",
                      strategyType === key
                        ? "bg-accent-cyan/10 border-accent-cyan/40"
                        : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]"
                    )}
                  >
                    <Icon size={14} className={cn(
                      "mx-auto mb-1",
                      strategyType === key ? "text-accent-cyan" : "text-white/40"
                    )} />
                    <div className={cn(
                      "text-[10px] font-bold uppercase",
                      strategyType === key ? "text-accent-cyan" : "text-white/70"
                    )}>
                      {config.label}
                    </div>
                    <div className="text-[8px] text-white/40 mt-0.5">{config.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actual Pool Liquidity Distribution */}
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 block">Current Pool Liquidity</label>
            <PoolLiquidityChart poolAddress={selectedPool.address} />
          </div>

          {/* Your Strategy Preview */}
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 block">Your Strategy Preview</label>
            <BinPreview
              binCount={binCount}
              strategyType={strategyType}
              riskProfile={riskProfile}
              currentPrice={selectedPool.price}
              binStep={selectedPool.bin_step}
            />
          </div>

          {/* Deposit Mode Selection */}
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 block">Deposit Mode</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setDepositMode('dual')}
                className={cn(
                  "p-2 rounded-xl border text-center transition-all text-[10px]",
                  depositMode === 'dual'
                    ? "bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan"
                    : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04] text-white/70"
                )}
              >
                <Wallet size={12} className="mx-auto mb-1" />
                Dual-Sided
              </button>
              <button
                onClick={() => setDepositMode('single-x')}
                className={cn(
                  "p-2 rounded-xl border text-center transition-all text-[10px]",
                  depositMode === 'single-x'
                    ? "bg-accent-purple/10 border-accent-purple/40 text-accent-purple"
                    : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04] text-white/70"
                )}
              >
                {selectedPool?.token_x_symbol || 'Token X'} Only
              </button>
              <button
                onClick={() => setDepositMode('single-y')}
                className={cn(
                  "p-2 rounded-xl border text-center transition-all text-[10px]",
                  depositMode === 'single-y'
                    ? "bg-accent-green/10 border-accent-green/40 text-accent-green"
                    : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04] text-white/70"
                )}
              >
                {selectedPool?.token_y_symbol || 'Token Y'} Only
              </button>
            </div>
          </div>

          {/* Deposit Amounts */}
          <div className="space-y-3">
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold block">Deposit Amounts</label>

            {/* Token X Input */}
            {(depositMode === 'dual' || depositMode === 'single-x') && (
              <div className="relative">
                <Input
                  type="number"
                  value={depositAmountX}
                  onChange={(e) => setDepositAmountX(e.target.value)}
                  placeholder="0.0"
                  className="pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/50 font-mono">
                  {selectedPool?.token_x_symbol || 'X'}
                </span>
              </div>
            )}

            {/* Token Y Input */}
            {(depositMode === 'dual' || depositMode === 'single-y') && (
              <div className="relative">
                <Input
                  type="number"
                  value={depositAmountY}
                  onChange={(e) => setDepositAmountY(e.target.value)}
                  placeholder="0.0"
                  className="pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/50 font-mono">
                  {selectedPool?.token_y_symbol || 'Y'}
                </span>
              </div>
            )}

            {/* Estimated USD Value */}
            {estimatedMetrics && (
              <div className="text-[10px] text-white/40 text-right">
                ≈ {formatUSD(estimatedMetrics.depositUsd)} total deposit
              </div>
            )}
          </div>

          {/* Estimated Metrics */}
          {estimatedMetrics && (
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold">Estimated Returns</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-white/50">Adjusted APR:</span>
                  <span className="text-accent-green font-mono ml-1">{estimatedMetrics.adjustedAprPct.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-white/50">Daily Yield:</span>
                  <span className="text-accent-green font-mono ml-1">{formatUSD(estimatedMetrics.dailyYield)}</span>
                </div>
                <div>
                  <span className="text-white/50">Weekly Yield:</span>
                  <span className="text-accent-green font-mono ml-1">{formatUSD(estimatedMetrics.weeklyYield)}</span>
                </div>
                <div>
                  <span className="text-white/50">IL Risk:</span>
                  <Badge variant={riskColors[riskProfile]} size="sm" className="ml-1">{estimatedMetrics.ilRisk}</Badge>
                </div>
              </div>
            </GlassCard>
          )}

          {/* Create Button */}
          <button
            className={cn(
              "w-full relative overflow-hidden rounded-xl p-3 transition-all duration-300",
              "bg-gradient-to-r from-[var(--accent-purple)] via-[var(--accent-purple)]/90 to-[var(--accent-cyan)]",
              "hover:shadow-[0_0_30px_rgba(153,69,255,0.3)] hover:scale-[1.02]",
              "active:scale-[0.98]",
              "group"
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

export default function DLMMPage() {
  return (
    <WidgetGrid page="dlmm">
      <div key="dlmm-pools">
        <DLMMPoolsWidget />
      </div>
      <div key="dlmm-favorites">
        <DLMMFavoritesWidget />
      </div>
      <div key="dlmm-positions">
        <DLMMPositionsWidget />
      </div>
      <div key="dlmm-strategy">
        <DLMMStrategyWidget />
      </div>
    </WidgetGrid>
  )
}
