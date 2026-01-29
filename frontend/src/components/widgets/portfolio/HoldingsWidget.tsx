import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Coins, Search, ArrowUpDown, Copy, Check } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn, formatUSD, formatNumber, shortenAddress, copyToClipboard } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { Input, Spinner, Tooltip } from '@/components/ui'

type SortKey = 'value' | 'balance' | 'price' | 'symbol'
type SortDir = 'asc' | 'desc'

export function HoldingsWidget() {
  const { holdings, loading, connected } = useAppSelector((state) => state.portfolio)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [copiedMint, setCopiedMint] = useState<string | null>(null)

  const filteredHoldings = useMemo(() => {
    let result = holdings.filter((h) => h.balance > 0)

    // Search filter
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (h) =>
          h.symbol.toLowerCase().includes(q) ||
          h.mint.toLowerCase().includes(q)
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      return sortDir === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    return result
  }, [holdings, search, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const handleCopy = async (mint: string) => {
    await copyToClipboard(mint)
    setCopiedMint(mint)
    setTimeout(() => setCopiedMint(null), 2000)
  }

  if (!connected) {
    return (
      <WidgetContainer
        id="holdings"
        title="Holdings"
        icon={<Coins className="w-4 h-4" />}
      >
        <div className="h-full flex flex-col items-center justify-center text-white/40">
          <Coins className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Connect wallet to view holdings</p>
        </div>
      </WidgetContainer>
    )
  }

  return (
    <WidgetContainer
      id="holdings"
      title="Holdings"
      icon={<Coins className="w-4 h-4" />}
      badge={holdings.length > 0 ? `${holdings.length}` : undefined}
      actions={
        <Input
          size="sm"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-32"
          icon={<Search className="w-3 h-3" />}
        />
      }
      noPadding
    >
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="h-full flex flex-col">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_90px_90px_90px] gap-3 px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-[10px] text-white/40 uppercase tracking-wider font-bold">
            <button
              onClick={() => handleSort('symbol')}
              className="flex items-center gap-1 hover:text-white/70 transition-colors text-left"
            >
              Asset
              {sortKey === 'symbol' && (
                <ArrowUpDown className="w-3 h-3 text-accent-cyan" />
              )}
            </button>
            <button
              onClick={() => handleSort('balance')}
              className="flex items-center gap-1 hover:text-white/70 transition-colors text-right justify-end"
            >
              Balance
              {sortKey === 'balance' && <ArrowUpDown className="w-3 h-3 text-accent-cyan" />}
            </button>
            <button
              onClick={() => handleSort('price')}
              className="flex items-center gap-1 hover:text-white/70 transition-colors text-right justify-end"
            >
              Price
              {sortKey === 'price' && <ArrowUpDown className="w-3 h-3 text-accent-cyan" />}
            </button>
            <button
              onClick={() => handleSort('value')}
              className="flex items-center gap-1 hover:text-white/70 transition-colors text-right justify-end"
            >
              Value
              {sortKey === 'value' && <ArrowUpDown className="w-3 h-3 text-accent-cyan" />}
            </button>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-auto glass-scrollbar">
            <AnimatePresence>
              {filteredHoldings.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-white/30 text-sm">
                  {search ? 'No matching holdings' : 'No holdings found'}
                </div>
              ) : (
                filteredHoldings.map((holding, index) => (
                  <motion.div
                    key={holding.mint}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.02 }}
                    className={cn(
                      "grid grid-cols-[1fr_90px_90px_90px] gap-3 px-4 py-2.5 transition-all group cursor-pointer",
                      "hover:bg-accent-cyan/[0.03] border-l-2 border-l-transparent hover:border-l-accent-cyan/50",
                      index % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                    )}
                  >
                    {/* Asset */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {holding.logoURI ? (
                        <img
                          src={holding.logoURI}
                          alt={holding.symbol}
                          className="w-7 h-7 rounded-full bg-white/5 ring-1 ring-white/10"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-accent-cyan/10 flex items-center justify-center text-[10px] font-bold text-accent-cyan ring-1 ring-accent-cyan/20">
                          {holding.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate text-white/90">{holding.symbol}</p>
                        <div className="flex items-center gap-1 text-[10px] text-white/30 font-mono">
                          <span>{shortenAddress(holding.mint, 4)}</span>
                          <Tooltip content={copiedMint === holding.mint ? 'Copied!' : 'Copy address'}>
                            <button
                              onClick={() => handleCopy(holding.mint)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-accent-cyan"
                            >
                              {copiedMint === holding.mint ? (
                                <Check className="w-3 h-3 text-accent-green" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="text-right flex items-center justify-end">
                      <p className="text-xs font-mono text-white/70">
                        {formatNumber(holding.balance, holding.balance < 1 ? 6 : 2)}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="text-right flex items-center justify-end">
                      <p className="text-xs font-mono text-white/50">
                        {formatUSD(holding.price)}
                      </p>
                    </div>

                    {/* Value */}
                    <div className="text-right flex items-center justify-end">
                      <p className="text-xs font-bold font-mono text-accent-cyan">
                        {formatUSD(holding.value)}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </WidgetContainer>
  )
}
