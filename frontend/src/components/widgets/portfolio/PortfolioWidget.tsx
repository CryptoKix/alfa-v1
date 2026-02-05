import { useMemo, useState } from 'react'
import { useAppSelector } from '@/app/hooks'
import { Wallet, Search, ArrowUpDown, TrendingUp, TrendingDown, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { Spinner } from '@/components/ui'
import { SendModal } from '@/components/modals/SendModal'

type SortKey = 'value' | 'balance' | 'price' | 'symbol' | 'change'
type SortDir = 'asc' | 'desc'

export function PortfolioWidget() {
  const { holdings, holdings24hAgo, totalUsd, totalUsd24hAgo, loading, connected } = useAppSelector(
    (state) => state.portfolio
  )
  const prices = useAppSelector((state) => state.prices.prices)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)

  // Calculate live values
  const liveHoldings = useMemo(() => {
    return holdings
      .map((h) => {
        const currentPrice = prices[h.mint] || h.price
        const baseline = holdings24hAgo.find((bh) => bh.mint === h.mint)
        const baselineValue = baseline ? baseline.balance * (baseline.price || currentPrice) : h.balance * currentPrice
        const currentValue = h.balance * currentPrice
        const pnl24h = currentValue - baselineValue
        const pnlPct = baselineValue > 0 ? (pnl24h / baselineValue) * 100 : 0

        return {
          ...h,
          currentPrice,
          liveValue: currentValue,
          pnl24h,
          pnlPct,
        }
      })
      .filter((h) => h.balance > 0)
  }, [holdings, prices, holdings24hAgo])

  // Filter and sort holdings
  const filteredHoldings = useMemo(() => {
    let result = [...liveHoldings]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((h) => h.symbol.toLowerCase().includes(q) || h.mint.toLowerCase().includes(q))
    }

    result.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortKey) {
        case 'symbol':
          aVal = a.symbol
          bVal = b.symbol
          break
        case 'balance':
          aVal = a.balance
          bVal = b.balance
          break
        case 'price':
          aVal = a.currentPrice
          bVal = b.currentPrice
          break
        case 'change':
          aVal = a.pnlPct
          bVal = b.pnlPct
          break
        case 'value':
        default:
          aVal = a.liveValue
          bVal = b.liveValue
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })

    return result
  }, [liveHoldings, search, sortKey, sortDir])

  const liveTotal = useMemo(() => {
    return liveHoldings.reduce((acc, h) => acc + h.liveValue, 0) || totalUsd
  }, [liveHoldings, totalUsd])

  const pnl24h = liveTotal - (totalUsd24hAgo || liveTotal)
  const pnlPct24h = totalUsd24hAgo > 0 ? (pnl24h / totalUsd24hAgo) * 100 : 0
  const isProfitTotal = pnl24h >= 0

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (!connected) {
    return (
      <WidgetContainer id="portfolio" title="Portfolio" icon={<Wallet className="w-4 h-4" />}>
        <div className="h-full flex flex-col items-center justify-center text-white/40">
          <Wallet className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Connect wallet to view portfolio</p>
        </div>
      </WidgetContainer>
    )
  }

  return (
    <WidgetContainer
      id="portfolio"
      title="Portfolio"
      icon={<Wallet className="w-4 h-4" />}
      badge={
        <span className="text-lg font-black font-mono text-accent-cyan">
          ${liveTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSendModalOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-accent-purple hover:text-white bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/20 rounded-lg transition-all"
            title="Send Assets"
          >
            <Send size={12} />
            Send
          </button>
          <div
            className={cn(
              'flex items-center gap-1 text-[11px] font-bold font-mono px-2 py-1 rounded',
              isProfitTotal ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'
            )}
          >
            {isProfitTotal ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isProfitTotal ? '+' : ''}
            {pnlPct24h.toFixed(2)}%
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-24 bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-accent-cyan/30"
            />
          </div>
        </div>
      }
      noPadding
    >
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="h-full flex flex-col">
          {/* Holdings List */}
          <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_70px_70px_60px_80px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 shrink-0" />
                <p className="hover:text-white/70 transition-colors cursor-pointer" onClick={() => handleSort('symbol')}>
                  Asset {sortKey === 'symbol' && '↕'}
                </p>
              </div>
              <div className="hover:text-white/70 transition-colors cursor-pointer" onClick={() => handleSort('balance')}>
                Qty {sortKey === 'balance' && '↕'}
              </div>
              <div className="hover:text-white/70 transition-colors cursor-pointer" onClick={() => handleSort('price')}>
                Price {sortKey === 'price' && '↕'}
              </div>
              <div className="hover:text-white/70 transition-colors cursor-pointer" onClick={() => handleSort('change')}>
                24h {sortKey === 'change' && '↕'}
              </div>
              <div className="hover:text-white/70 transition-colors cursor-pointer" onClick={() => handleSort('value')}>
                Value {sortKey === 'value' && '↕'}
              </div>
            </div>

            {filteredHoldings.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-white/30 text-sm">
                {search ? 'No matching holdings' : 'No holdings found'}
              </div>
            ) : (
              filteredHoldings.map((token) => {
                const isProfit = token.pnlPct >= 0
                return (
                  <div
                    key={token.mint}
                    className={cn(
                      'grid grid-cols-[1fr_70px_70px_60px_80px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                      'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                      'hover:bg-white/[0.04] hover:border-accent-cyan/30'
                    )}
                  >
                    {/* Asset */}
                    <div className="flex items-center gap-2 min-w-0">
                      {token.logoURI ? (
                        <img
                          src={token.logoURI}
                          alt={token.symbol}
                          className="w-6 h-6 rounded-full shrink-0 ring-1 ring-white/10"
                          onError={(e) =>
                            (e.currentTarget.src =
                              'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')
                          }
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-white/10 shrink-0">
                          {token.symbol.slice(0, 2)}
                        </div>
                      )}
                      <p className="text-[12px] font-semibold truncate text-white">{token.symbol}</p>
                    </div>

                    {/* Qty */}
                    <div className="text-[11px] font-mono text-white/70 truncate">
                      {token.balance < 0.001
                        ? token.balance.toExponential(2)
                        : token.balance < 1
                        ? token.balance.toFixed(4)
                        : token.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>

                    {/* Price */}
                    <div className="text-[11px] font-mono text-white/50 truncate">
                      ${token.currentPrice < 0.01 ? token.currentPrice.toExponential(2) : token.currentPrice.toFixed(2)}
                    </div>

                    {/* 24h Change */}
                    <div>
                      <span
                        className={cn(
                          'inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
                          isProfit ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'
                        )}
                      >
                        {isProfit ? '+' : ''}{token.pnlPct.toFixed(1)}%
                      </span>
                    </div>

                    {/* Value */}
                    <div className="text-[11px] font-bold font-mono text-white">
                      ${token.liveValue.toFixed(2)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Send Modal */}
      <SendModal isOpen={isSendModalOpen} onClose={() => setIsSendModalOpen(false)} />
    </WidgetContainer>
  )
}
