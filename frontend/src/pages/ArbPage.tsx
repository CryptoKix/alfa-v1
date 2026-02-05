import { useState, useEffect, useRef } from 'react'
import { WidgetGrid } from '@/components/layout'
import { AlertsWidget } from '@/components/widgets'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setArbConfig } from '@/features/arb/arbSlice'
import { cn, formatUSD, formatPercent, formatTimestamp } from '@/lib/utils'
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Plus,
  Trash2,
  X,
  Search,
  ArrowRight,
  BarChart3,
  RefreshCw,
  ChevronDown
} from 'lucide-react'
import { Button, Badge, StatusDot, Tooltip } from '@/components/ui'

interface Token {
  mint: string
  symbol: string
  name?: string
  logo_uri?: string
  decimals?: number
  market_cap?: number
}

interface MonitoredPair {
  id: number
  input_mint: string
  output_mint: string
  input_symbol: string
  output_symbol: string
  amount: number
}

// Custom event for pair updates
const ARB_PAIR_UPDATED = 'arb-pair-updated'

// Fallback tokens if API fails
const FALLBACK_TOKENS: Token[] = [
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', name: 'Solana' },
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USD Coin' },
  { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', name: 'Tether' },
]

// Token Selector Dropdown Component
function TokenSelector({
  tokens,
  selected,
  onSelect,
  disabledMint,
  label,
  accentColor = 'cyan'
}: {
  tokens: Token[]
  selected: Token | null
  onSelect: (token: Token) => void
  disabledMint?: string
  label: string
  accentColor?: 'cyan' | 'pink'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredTokens = tokens.filter(t =>
    t.symbol.toLowerCase().includes(search.toLowerCase()) ||
    (t.name && t.name.toLowerCase().includes(search.toLowerCase()))
  )

  const accent = accentColor === 'cyan' ? 'accent-cyan' : 'accent-pink'

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-[10px] text-white/50 mb-1.5 block uppercase tracking-wider">{label}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left',
          isOpen
            ? `bg-${accent}/10 border-${accent}/50`
            : 'bg-white/5 border-white/10 hover:border-white/20'
        )}
      >
        {selected?.logo_uri && (
          <img src={selected.logo_uri} alt="" className="w-6 h-6 rounded-full" />
        )}
        <div className="flex-1 min-w-0">
          <div className={cn('text-sm font-semibold', selected ? 'text-white' : 'text-white/50')}>
            {selected?.symbol || 'Select token'}
          </div>
          {selected?.name && (
            <div className="text-[10px] text-white/40 truncate">{selected.name}</div>
          )}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-white/40 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-[#0a0a0f] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
              <Search className="w-4 h-4 text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tokens..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Token List */}
          <div className="max-h-60 overflow-auto">
            {filteredTokens.length === 0 ? (
              <div className="p-4 text-center text-white/40 text-sm">No tokens found</div>
            ) : (
              filteredTokens.map((token) => {
                const isDisabled = token.mint === disabledMint
                const isSelected = selected?.mint === token.mint
                return (
                  <button
                    key={token.mint}
                    onClick={() => {
                      if (!isDisabled) {
                        onSelect(token)
                        setIsOpen(false)
                        setSearch('')
                      }
                    }}
                    disabled={isDisabled}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 transition-all text-left',
                      isDisabled
                        ? 'opacity-30 cursor-not-allowed'
                        : isSelected
                          ? `bg-${accent}/10`
                          : 'hover:bg-white/5'
                    )}
                  >
                    {token.logo_uri ? (
                      <img src={token.logo_uri} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/50">
                        {token.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">{token.symbol}</div>
                      {token.name && (
                        <div className="text-[10px] text-white/40 truncate">{token.name}</div>
                      )}
                    </div>
                    {token.market_cap && token.market_cap > 0 && (
                      <div className="text-[10px] text-white/30 font-mono">
                        ${token.market_cap >= 1e9 ? `${(token.market_cap / 1e9).toFixed(1)}B` : `${(token.market_cap / 1e6).toFixed(0)}M`}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AddPairWidget() {
  const [tokens, setTokens] = useState<Token[]>(FALLBACK_TOKENS)
  const [inputToken, setInputToken] = useState<Token | null>(null)
  const [outputToken, setOutputToken] = useState<Token | null>(null)
  const [amount, setAmount] = useState('100')
  const [loading, setLoading] = useState(false)

  // Fetch top tokens on mount
  useEffect(() => {
    fetch('/api/tokens/top')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setTokens(data)
          // Set defaults
          const sol = data.find((t: Token) => t.symbol === 'SOL')
          const usdc = data.find((t: Token) => t.symbol === 'USDC')
          if (sol) setInputToken(sol)
          if (usdc) setOutputToken(usdc)
        }
      })
      .catch(console.error)
  }, [])

  const handleAddPair = async () => {
    if (!inputToken || !outputToken || inputToken.mint === outputToken.mint) return
    setLoading(true)
    try {
      const res = await fetch('/api/arb/pairs/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: inputToken.mint,
          outputMint: outputToken.mint,
          amount: parseFloat(amount) || 100
        })
      })
      if (res.ok) {
        window.dispatchEvent(new Event(ARB_PAIR_UPDATED))
      }
    } catch (e) {
      console.error('Failed to add pair:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <WidgetContainer
      id="add-pair"
      title="Add Pair"
      icon={<Plus className="w-4 h-4" />}
      noPadding
    >
      <div className="p-4 space-y-4">
        {/* Token Selection */}
        <TokenSelector
          tokens={tokens}
          selected={inputToken}
          onSelect={setInputToken}
          disabledMint={outputToken?.mint}
          label="Buy Token"
          accentColor="cyan"
        />

        <div className="flex justify-center">
          <div className="p-2 rounded-full bg-white/5 border border-white/10">
            <ArrowRight className="w-4 h-4 text-accent-cyan" />
          </div>
        </div>

        <TokenSelector
          tokens={tokens}
          selected={outputToken}
          onSelect={setOutputToken}
          disabledMint={inputToken?.mint}
          label="Sell Token"
          accentColor="pink"
        />

        {/* Selected Pair Preview */}
        {inputToken && outputToken && (
          <div className="flex items-center justify-center gap-3 py-2 px-4 bg-white/[0.03] rounded-lg border border-white/[0.06]">
            <span className="text-sm font-bold text-white">{inputToken.symbol}</span>
            <ArrowRight className="w-4 h-4 text-white/30" />
            <span className="text-sm font-bold text-accent-cyan">{outputToken.symbol}</span>
          </div>
        )}

        <div>
          <label className="text-[10px] text-white/50 mb-1 block uppercase tracking-wider">
            Trade Amount ({outputToken?.symbol || 'USDC'})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-cyan/50"
            placeholder="100"
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={handleAddPair}
          disabled={loading || !inputToken || !outputToken || inputToken.mint === outputToken.mint}
        >
          {loading ? 'Adding...' : 'Add Pair'}
        </Button>
      </div>
    </WidgetContainer>
  )
}

function PairSelectorWidget() {
  const [pairs, setPairs] = useState<MonitoredPair[]>([])

  // Fetch pairs on mount and listen for updates
  useEffect(() => {
    fetchPairs()

    // Listen for pair updates from AddPairWidget
    const handlePairUpdate = () => fetchPairs()
    window.addEventListener(ARB_PAIR_UPDATED, handlePairUpdate)
    return () => window.removeEventListener(ARB_PAIR_UPDATED, handlePairUpdate)
  }, [])

  const fetchPairs = async () => {
    try {
      const res = await fetch('/api/arb/pairs')
      const data = await res.json()
      if (Array.isArray(data)) {
        setPairs(data)
      }
    } catch (e) {
      console.error('Failed to fetch arb pairs:', e)
    }
  }

  const handleDeletePair = async (id: number) => {
    try {
      await fetch('/api/arb/pairs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      fetchPairs()
    } catch (e) {
      console.error('Failed to delete pair:', e)
    }
  }

  return (
    <WidgetContainer
      id="pair-selector"
      title="Monitored Pairs"
      icon={<BarChart3 className="w-4 h-4" />}
      badge={`${pairs.length} pairs`}
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_80px_60px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div>Pair</div>
          <div>Amount</div>
          <div></div>
        </div>

        {pairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <BarChart3 size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">No pairs monitored</span>
            <span className="text-[10px] text-white/20 mt-1">Use Add Pair widget to add pairs</span>
          </div>
        ) : (
          pairs.map((pair) => (
            <div
              key={pair.id}
              className={cn(
                'grid grid-cols-[1fr_80px_60px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                'hover:bg-white/[0.04] hover:border-accent-cyan/30'
              )}
            >
              {/* Pair */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[12px] font-semibold text-white">
                  {pair.input_symbol}
                </span>
                <ArrowRight className="w-3 h-3 text-white/30" />
                <span className="text-[12px] font-semibold text-accent-cyan">
                  {pair.output_symbol}
                </span>
              </div>

              {/* Amount */}
              <div className="text-[12px] font-mono text-white/70">
                {(pair.amount / 1e9).toLocaleString()} {pair.input_symbol === 'USDC' || pair.input_symbol === 'USDT' ? '' : ''}
              </div>

              {/* Actions */}
              <div className="flex justify-end">
                <button
                  onClick={() => handleDeletePair(pair.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-white/40 hover:text-accent-red"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  )
}

function PriceMatrixWidget() {
  const { matrix } = useAppSelector((state) => state.arb)
  const pairs = Object.entries(matrix)

  // Get all unique venues across all pairs
  const allVenues = Array.from(
    new Set(pairs.flatMap(([, data]) => Object.keys(data.venues || {})))
  ).sort()

  // Build dynamic grid columns: pair + spread + spacer + venues (evenly spread)
  const gridCols = `80px 55px 60px ${allVenues.map(() => '1fr').join(' ')}`

  return (
    <WidgetContainer
      id="price-matrix"
      title="Price Matrix"
      icon={<Activity className="w-4 h-4" />}
      badge={pairs.length > 0 ? 'Live' : undefined}
      badgeVariant="cyan"
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div
          className="grid gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div>Pair</div>
          <div>Spread</div>
          <div></div>
          {allVenues.map(venue => (
            <div key={venue}>{venue}</div>
          ))}
        </div>

        {pairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <Activity size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">Waiting for price data...</span>
            <span className="text-[10px] text-white/20 mt-1">Add pairs to start monitoring</span>
          </div>
        ) : (
          pairs.map(([pair, data]) => {
            const venues = data.venues || {}
            const prices = Object.values(venues)
            if (prices.length === 0) return null

            const maxPrice = Math.max(...prices)
            const minPrice = Math.min(...prices)
            const spread = maxPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0

            return (
              <div
                key={pair}
                className={cn(
                  'relative grid gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                  'hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
                style={{ gridTemplateColumns: gridCols }}
              >
                {/* Pair */}
                <div className="text-[12px] font-semibold text-white truncate">
                  {pair}
                </div>

                {/* Spread */}
                <div>
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded leading-none',
                    spread > 0.5
                      ? 'bg-accent-cyan/10 text-accent-cyan/80'
                      : spread > 0.2
                        ? 'bg-accent-yellow/10 text-accent-yellow/80'
                        : 'bg-white/5 text-white/50'
                  )}>
                    {spread.toFixed(3)}%
                  </span>
                </div>

                {/* Spacer */}
                <div></div>

                {/* Venue Prices */}
                {allVenues.map(venue => {
                  const price = venues[venue]
                  const isMax = price === maxPrice
                  const isMin = price === minPrice
                  const hasPrice = price !== undefined

                  return (
                    <div key={venue}>
                      {hasPrice ? (
                        <span className={cn(
                          'text-[12px] font-mono',
                          isMax
                            ? 'text-accent-cyan/70'
                            : isMin
                              ? 'text-accent-pink/70'
                              : 'text-white/70'
                        )}>
                          {formatUSD(price)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-white/20">—</span>
                      )}
                    </div>
                  )
                })}

                {/* Actions - absolute positioned */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {spread > 0.3 && (
                    <Button variant="primary" size="xs">
                      <Zap className="w-3 h-3" />
                    </Button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Find and delete the pair by matching symbols
                      fetch('/api/arb/pairs')
                        .then(res => res.json())
                        .then(pairs => {
                          const match = pairs.find((p: MonitoredPair) =>
                            `${p.input_symbol}/${p.output_symbol}` === pair
                          )
                          if (match) {
                            fetch('/api/arb/pairs/delete', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: match.id })
                            }).then(() => window.dispatchEvent(new Event(ARB_PAIR_UPDATED)))
                          }
                        })
                    }}
                    className="p-1 hover:bg-white/10 rounded transition-all text-white/40 hover:text-accent-pink"
                  >
                    <Trash2 size={12} />
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

function ArbControlWidget() {
  const dispatch = useAppDispatch()
  const { isMonitoring, autoStrike, minProfit, jitoTip } = useAppSelector((state) => state.arb)
  const [localMinProfit, setLocalMinProfit] = useState(minProfit.toString())
  const [localJitoTip, setLocalJitoTip] = useState(jitoTip.toString())
  const [starting, setStarting] = useState(false)

  const handleStartEngine = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/arb/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoStrike,
          minProfit: parseFloat(localMinProfit) || 0.1,
          jitoTip: parseFloat(localJitoTip) || 0.001
        })
      })
      if (res.ok) {
        dispatch(setArbConfig({
          isMonitoring: true,
          minProfit: parseFloat(localMinProfit) || 0.1,
          jitoTip: parseFloat(localJitoTip) || 0.001
        }))
      }
    } catch (e) {
      console.error('Failed to start arb engine:', e)
    } finally {
      setStarting(false)
    }
  }

  return (
    <WidgetContainer
      id="arb-control"
      title="Arb Engine"
      icon={<Zap className="w-4 h-4" />}
      badge={isMonitoring ? 'Running' : 'Stopped'}
      badgeVariant={isMonitoring ? 'cyan' : 'default'}
      noPadding
    >
      <div className="p-4 space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full",
              isMonitoring
                ? "bg-accent-cyan shadow-[0_0_10px_rgba(0,255,255,0.5)] animate-pulse"
                : "bg-white/30"
            )} />
            <span className={cn("text-sm font-medium", isMonitoring && "text-accent-cyan")}>
              {isMonitoring ? 'Engine Running' : 'Engine Stopped'}
            </span>
          </div>
          <Button
            variant={isMonitoring ? "ghost" : "primary"}
            size="sm"
            onClick={handleStartEngine}
            disabled={starting}
          >
            {starting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isMonitoring ? (
              'Restart'
            ) : (
              'Start Engine'
            )}
          </Button>
        </div>

        {/* Auto-Strike Toggle */}
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/[0.06]">
          <div>
            <div className="text-sm font-medium">Auto-Strike</div>
            <div className="text-[10px] text-white/50">Automatically execute profitable trades</div>
          </div>
          <button
            onClick={() => dispatch(setArbConfig({ autoStrike: !autoStrike }))}
            className={cn(
              "w-11 h-6 rounded-full transition-all duration-300 relative border",
              autoStrike
                ? "bg-accent-green/20 border-accent-green/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                : "bg-white/5 border-white/10"
            )}
          >
            <div className={cn(
              "absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 shadow-lg",
              autoStrike
                ? "left-5 bg-accent-green"
                : "left-0.5 bg-white/50"
            )} />
          </button>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-white/50 mb-1 block">Min Profit (USD)</label>
            <input
              type="number"
              value={localMinProfit}
              onChange={(e) => setLocalMinProfit(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-cyan/50"
              step="0.01"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/50 mb-1 block">Jito Tip (SOL)</label>
            <input
              type="number"
              value={localJitoTip}
              onChange={(e) => setLocalJitoTip(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-cyan/50"
              step="0.0001"
            />
          </div>
        </div>
      </div>
    </WidgetContainer>
  )
}

function OpportunitiesWidget() {
  const { opportunities } = useAppSelector((state) => state.arb)

  return (
    <WidgetContainer
      id="opportunities"
      title="Opportunities"
      icon={<TrendingUp className="w-4 h-4" />}
      badge={opportunities.length > 0 ? `${opportunities.length}` : undefined}
      badgeVariant="cyan"
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[60px_1fr_70px_70px_60px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div>Time</div>
          <div>Pair</div>
          <div>Spread</div>
          <div>Profit</div>
          <div></div>
        </div>

        {opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <Zap size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">No opportunities detected</span>
          </div>
        ) : (
          opportunities.slice(0, 20).map((opp, idx) => (
            <div
              key={`${opp.input_symbol}-${opp.output_symbol}-${opp.timestamp}-${idx}`}
              className={cn(
                'grid grid-cols-[60px_1fr_70px_70px_60px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                'hover:bg-white/[0.04] hover:border-accent-cyan/30'
              )}
            >
              {/* Time */}
              <div className="text-[11px] text-white/50">
                {new Date(opp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              {/* Pair */}
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[12px] font-semibold text-white truncate">
                  {opp.input_symbol}/{opp.output_symbol}
                </span>
                <span className="text-[10px] text-white/40">
                  {opp.best_venue}→{opp.worst_venue}
                </span>
              </div>

              {/* Spread */}
              <div>
                <Badge variant={opp.spread_pct > 0.5 ? 'green' : 'default'} size="sm">
                  {opp.spread_pct.toFixed(2)}%
                </Badge>
              </div>

              {/* Profit */}
              <div className="text-[12px] font-mono text-accent-green">
                +{formatUSD(opp.net_profit_usd)}
              </div>

              {/* Strike */}
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="xs"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    fetch('/api/arb/strike', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        input_mint: opp.input_mint,
                        output_mint: opp.output_mint,
                        input_symbol: opp.input_symbol,
                        output_symbol: opp.output_symbol,
                        best_venue: opp.best_venue,
                        worst_venue: opp.worst_venue,
                        best_amount: opp.best_amount,
                        worst_amount: opp.worst_amount,
                        spread_pct: opp.spread_pct,
                        input_amount: opp.input_amount
                      })
                    })
                  }}
                >
                  <Zap className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  )
}

export default function ArbPage() {
  return (
    <WidgetGrid page="arb">
      <div key="add-pair">
        <AddPairWidget />
      </div>
      <div key="pair-selector">
        <PairSelectorWidget />
      </div>
      <div key="arb-control">
        <ArbControlWidget />
      </div>
      <div key="price-matrix">
        <PriceMatrixWidget />
      </div>
      <div key="opportunities">
        <OpportunitiesWidget />
      </div>
    </WidgetGrid>
  )
}
