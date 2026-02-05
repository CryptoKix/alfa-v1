import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  Layers,
  Wallet,
  TrendingUp,
  Shield,
  Zap,
  RefreshCw,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { cn, formatUSD, formatNumber, formatPercent } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'
import type { UnifiedPool } from '@/features/liquidity/liquiditySlice'

interface PoolDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  pool: UnifiedPool | null
  onPositionCreated?: () => void
}

interface StrategyPreview {
  rangeMin: number
  rangeMax: number
  priceMin: number
  priceMax: number
  currentPrice?: number
  estimatedShare?: number
}

const protocolColors = {
  meteora: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  orca: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

const riskProfiles = {
  low: { label: 'Wide', desc: 'Lower IL, ~50% range', color: 'green', rangePct: 50 },
  medium: { label: 'Balanced', desc: 'Moderate, ~20% range', color: 'yellow', rangePct: 20 },
  high: { label: 'Concentrated', desc: 'Higher fees, ~7.5% range', color: 'red', rangePct: 7.5 },
}

export const PoolDetailsModal: React.FC<PoolDetailsModalProps> = ({
  isOpen,
  onClose,
  pool,
  onPositionCreated,
}) => {
  const { activeWallet } = useAppSelector((state) => state.wallet)

  // Pool data state (enriched from API)
  const [poolData, setPoolData] = useState<UnifiedPool | null>(null)
  const [loadingPool, setLoadingPool] = useState(false)

  // Form state
  const [amountX, setAmountX] = useState('')
  const [amountY, setAmountY] = useState('')
  const [riskProfile, setRiskProfile] = useState<'low' | 'medium' | 'high'>('medium')
  const [autoRebalance, setAutoRebalance] = useState(false)

  // Preview state
  const [preview, setPreview] = useState<StrategyPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch full pool data when modal opens
  useEffect(() => {
    if (isOpen && pool) {
      setLoadingPool(true)
      fetch(`/api/liquidity/pools/${pool.protocol}/${pool.address}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.pool) {
            setPoolData(data.pool)
          }
        })
        .catch((err) => console.error('Failed to fetch pool data:', err))
        .finally(() => setLoadingPool(false))
    }
  }, [isOpen, pool?.address, pool?.protocol])

  // Reset form when pool changes
  useEffect(() => {
    if (pool) {
      setAmountX('')
      setAmountY('')
      setRiskProfile('medium')
      setAutoRebalance(false)
      setPreview(null)
      setPoolData(null)
      setError(null)
    }
  }, [pool?.address])

  // Use enriched pool data or fall back to passed pool prop
  const displayPool = poolData || pool

  // Fetch strategy preview when risk profile changes
  const fetchPreview = useCallback(async () => {
    if (!pool) return

    setLoadingPreview(true)
    setError(null)

    try {
      const res = await fetch('/api/liquidity/strategy/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: pool.protocol,
          pool_address: pool.address,
          risk_profile: riskProfile,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setPreview({
          rangeMin: data.rangeMin,
          rangeMax: data.rangeMax,
          priceMin: data.priceMin,
          priceMax: data.priceMax,
          currentPrice: data.currentPrice,
          estimatedShare: data.estimatedShare,
        })
      } else {
        setError(data.error || 'Failed to calculate strategy')
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err)
      setError('Failed to calculate strategy')
    } finally {
      setLoadingPreview(false)
    }
  }, [pool, riskProfile])

  useEffect(() => {
    if (isOpen && pool) {
      fetchPreview()
    }
  }, [isOpen, pool, riskProfile, fetchPreview])

  // Create position
  const handleCreatePosition = async () => {
    if (!pool || !activeWallet || !amountX || !amountY) {
      setError('Please fill in all fields')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/liquidity/position/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: pool.protocol,
          pool_address: pool.address,
          user_wallet: activeWallet,
          amount_x: parseFloat(amountX),
          amount_y: parseFloat(amountY),
          risk_profile: riskProfile,
          auto_rebalance: autoRebalance,
          token_x_decimals: pool.tokenX.decimals || 9,
          token_y_decimals: pool.tokenY.decimals || 6,
        }),
      })

      const data = await res.json()
      if (data.success) {
        onPositionCreated?.()
        onClose()
      } else {
        setError(data.error || 'Failed to create position')
      }
    } catch (err) {
      console.error('Failed to create position:', err)
      setError('Failed to create position')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen || !pool) return null

  const pColors = protocolColors[pool.protocol]

  // Calculate range visualization position
  const rangeVisualization = preview
    ? {
        currentPosition: 50, // Current price is always at center for new positions
        rangeStart: 25,
        rangeEnd: 75,
      }
    : null

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="bg-background-card border border-accent-cyan/20 rounded-3xl w-full max-w-2xl relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto glass-scrollbar">
        {/* Accent line */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-purple/40 to-transparent z-20" />

        {/* Header */}
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Token pair icons */}
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-white/10 flex items-center justify-center">
                  <Layers className="w-6 h-6 text-accent-cyan" />
                </div>
                <span
                  className={cn(
                    'absolute -bottom-1 -right-1 text-[8px] px-1.5 py-0.5 rounded font-bold',
                    pColors.bg,
                    pColors.text
                  )}
                >
                  {pool.protocol === 'meteora' ? 'MET' : 'ORC'}
                </span>
              </div>

              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">
                  {pool.tokenX.symbol}/{pool.tokenY.symbol}
                </h2>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span>
                    {pool.priceSpacing}
                    {pool.protocol === 'meteora' ? 'bps' : ' tick spacing'}
                  </span>
                  <span>•</span>
                  <span className="font-mono">{pool.address.slice(0, 8)}...{pool.address.slice(-4)}</span>
                  <a
                    href={
                      pool.protocol === 'orca'
                        ? `https://www.orca.so/pools/${pool.address}`
                        : `https://app.meteora.ag/dlmm/${pool.address}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-cyan hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-2">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-6 border-b border-white/[0.06]">
          {loadingPool ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-accent-cyan" />
              <span className="ml-2 text-xs text-white/50">Loading pool data...</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              <div className="text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">TVL</p>
                <p className="text-sm font-mono font-bold text-white">{formatUSD(displayPool?.tvl || 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">24h Vol</p>
                <p className="text-sm font-mono font-bold text-white">{formatUSD(displayPool?.volume24h || 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">24h Fees</p>
                <p className="text-sm font-mono font-bold text-accent-green">{formatUSD(displayPool?.fees24h || 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">APR</p>
                <p className="text-sm font-mono font-bold text-accent-green">{formatPercent((displayPool?.apr || 0) * 100, 1)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Fee Rate</p>
                <p className="text-sm font-mono font-bold text-white">{((displayPool?.feeRate || 0) * 100).toFixed(2)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Price</p>
                <p className="text-sm font-mono font-bold text-white">{formatNumber(displayPool?.price || 0, 4)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Liquidity Form */}
        <div className="p-6 space-y-6">
          {/* Token Inputs */}
          <div className="grid grid-cols-2 gap-4">
            {/* Token X */}
            <div>
              <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 flex items-center justify-between">
                <span>{pool.tokenX.symbol} Amount</span>
                <button className="text-accent-cyan hover:text-white transition-colors text-[9px]">MAX</button>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amountX}
                  onChange={(e) => setAmountX(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-accent-cyan/40 focus:outline-none transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40">
                  {pool.tokenX.symbol}
                </span>
              </div>
            </div>

            {/* Token Y */}
            <div>
              <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 flex items-center justify-between">
                <span>{pool.tokenY.symbol} Amount</span>
                <button className="text-accent-cyan hover:text-white transition-colors text-[9px]">MAX</button>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amountY}
                  onChange={(e) => setAmountY(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-accent-cyan/40 focus:outline-none transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40">
                  {pool.tokenY.symbol}
                </span>
              </div>
            </div>
          </div>

          {/* Risk Profile Selector */}
          <div>
            <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-3 block">
              Risk Profile
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(Object.entries(riskProfiles) as [keyof typeof riskProfiles, (typeof riskProfiles)['low']][]).map(
                ([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setRiskProfile(key)}
                    className={cn(
                      'p-3 rounded-xl border text-center transition-all',
                      riskProfile === key
                        ? `bg-accent-${config.color}/10 border-accent-${config.color}/40`
                        : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]'
                    )}
                  >
                    <Shield
                      size={16}
                      className={cn('mx-auto mb-1.5', riskProfile === key ? `text-accent-${config.color}` : 'text-white/40')}
                    />
                    <div
                      className={cn(
                        'text-[11px] font-bold uppercase',
                        riskProfile === key ? `text-accent-${config.color}` : 'text-white/70'
                      )}
                    >
                      {config.label}
                    </div>
                    <div className="text-[9px] text-white/40 mt-0.5">{config.desc}</div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Auto-Rebalance Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
            <div>
              <div className="text-xs font-bold text-white">Auto-Rebalance</div>
              <div className="text-[10px] text-white/50">Automatically rebalance when position drifts out of range</div>
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

          {/* Position Preview Panel */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-bold">Position Preview</span>
              <button
                onClick={fetchPreview}
                disabled={loadingPreview}
                className="text-white/40 hover:text-white transition-colors"
              >
                <RefreshCw className={cn('w-3 h-3', loadingPreview && 'animate-spin')} />
              </button>
            </div>

            {loadingPreview ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-accent-cyan" />
              </div>
            ) : preview ? (
              <>
                {/* Price Range */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[9px] text-white/40 uppercase mb-1">Min Price</p>
                    <p className="text-sm font-mono font-bold text-white">{formatNumber(preview.priceMin, 2)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-accent-cyan uppercase mb-1">Current</p>
                    <p className="text-sm font-mono font-bold text-accent-cyan">{formatNumber(preview.currentPrice || displayPool?.price || 0, 2)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/40 uppercase mb-1">Max Price</p>
                    <p className="text-sm font-mono font-bold text-white">{formatNumber(preview.priceMax, 2)}</p>
                  </div>
                </div>

                {/* Range Visualization Bar */}
                {rangeVisualization && (
                  <div className="relative h-3 bg-white/[0.05] rounded-full overflow-hidden">
                    {/* Range area */}
                    <div
                      className="absolute h-full bg-gradient-to-r from-accent-cyan/30 to-accent-purple/30"
                      style={{
                        left: `${rangeVisualization.rangeStart}%`,
                        width: `${rangeVisualization.rangeEnd - rangeVisualization.rangeStart}%`,
                      }}
                    />
                    {/* Current price indicator */}
                    <div
                      className="absolute top-0 w-0.5 h-full bg-accent-cyan"
                      style={{ left: `${rangeVisualization.currentPosition}%` }}
                    />
                  </div>
                )}

                {/* Range indices (for dev reference) */}
                <div className="flex items-center justify-between text-[9px] text-white/30 font-mono">
                  <span>
                    {pool.protocol === 'meteora' ? 'Bin' : 'Tick'}: {preview.rangeMin}
                  </span>
                  <span>
                    {pool.protocol === 'meteora' ? 'Bin' : 'Tick'}: {preview.rangeMax}
                  </span>
                </div>

                {preview.estimatedShare && (
                  <div className="text-center text-[10px] text-white/50">
                    Estimated pool share: <span className="text-accent-cyan font-bold">{(preview.estimatedShare * 100).toFixed(4)}%</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-xs text-white/40 py-4">
                Select a risk profile to see position preview
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-xl bg-accent-pink/10 border border-accent-pink/30 text-accent-pink text-xs">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-black text-[10px] text-white uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePosition}
              disabled={submitting || !amountX || !amountY || !activeWallet}
              className={cn(
                'flex-[2] relative overflow-hidden rounded-xl py-3 transition-all duration-300',
                'bg-gradient-to-r from-[var(--accent-purple)] via-[var(--accent-purple)]/90 to-[var(--accent-cyan)]',
                'hover:shadow-[0_0_30px_rgba(153,69,255,0.3)] hover:scale-[1.02]',
                'active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
                'group'
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative flex items-center justify-center gap-2">
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Zap size={16} className="text-white" />
                )}
                <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white">
                  {submitting ? 'Creating...' : 'Create Position'}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
