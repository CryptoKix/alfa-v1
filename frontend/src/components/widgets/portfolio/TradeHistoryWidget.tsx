import { useState, useMemo } from 'react'
import { History, ExternalLink, Search } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'

const getTradeType = (source: string | undefined, input: string, output: string) => {
  const s = (source || '').toLowerCase()

  // Check for transfers (same token in/out or explicit transfer source)
  if (s.includes('transfer') || s.includes('send') || s.includes('receive')) {
    return { label: 'Transfer', color: 'bg-accent-purple/10 text-accent-purple' }
  }

  // Check for swaps
  if (s.includes('jupiter') || s.includes('swap') || s.includes('raydium') || s.includes('orca')) {
    return { label: 'Swap', color: 'bg-accent-cyan/10 text-accent-cyan' }
  }

  // Check for deposits/withdraws
  if (s.includes('deposit')) {
    return { label: 'Deposit', color: 'bg-accent-green/10 text-accent-green' }
  }
  if (s.includes('withdraw')) {
    return { label: 'Withdraw', color: 'bg-accent-red/10 text-accent-red' }
  }

  // If input and output are the same, it's likely a transfer
  if (input === output) {
    return { label: 'Transfer', color: 'bg-accent-purple/10 text-accent-purple' }
  }

  // Default to showing the source or Swap
  if (s && s.length <= 8) {
    return { label: s.charAt(0).toUpperCase() + s.slice(1), color: 'bg-white/10 text-white/70' }
  }

  return { label: 'Swap', color: 'bg-accent-cyan/10 text-accent-cyan' }
}

const formatAmount = (num: number | undefined) => {
  if (num === undefined || num === null) return '0'
  if (num === 0) return '0'
  if (num < 0.0001) return num.toExponential(2)
  if (num < 1) return num.toFixed(4)
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const formatTimestamp = (dateStr: string) => {
  if (!dateStr) return '-'
  const isoStr = dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z')
  const date = new Date(isoStr)
  if (isNaN(date.getTime())) return '-'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function TradeHistoryWidget() {
  const { history, connected } = useAppSelector((state) => state.portfolio)
  const [search, setSearch] = useState('')

  const filteredHistory = useMemo(() => {
    if (!search) return history
    const q = search.toLowerCase()
    return history.filter(
      (t) =>
        t.input?.toLowerCase().includes(q) ||
        t.output?.toLowerCase().includes(q)
    )
  }, [history, search])

  if (!connected) {
    return (
      <WidgetContainer
        id="trade-history"
        title="Trade History"
        icon={<History className="w-4 h-4" />}
      >
        <div className="h-full flex flex-col items-center justify-center text-white/40">
          <History className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">Connect wallet to view history</p>
        </div>
      </WidgetContainer>
    )
  }

  return (
    <WidgetContainer
      id="trade-history"
      title="Trade History"
      icon={<History className="w-4 h-4" />}
      badge={history.length > 0 ? `${history.length}` : undefined}
      noPadding
      actions={
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
      }
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[60px_55px_1fr_70px_70px_60px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div>Time</div>
          <div className="-ml-1.5">Type</div>
          <div>Pair</div>
          <div>In</div>
          <div>Out</div>
          <div>Price</div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <History size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">{search ? 'No matching trades' : 'No trades recorded'}</span>
          </div>
        ) : (
          filteredHistory.slice(0, 50).map((trade) => {
            // Calculate price: stablecoin amount / non-stable amount = token price in USD
            const isInputStable = ['USDC', 'USDT', 'USD'].includes(trade.input)
            const price = trade.amount_in && trade.amount_out
              ? (isInputStable ? trade.amount_in / trade.amount_out : trade.amount_out / trade.amount_in)
              : 0
            const tradeType = getTradeType(trade.source, trade.input, trade.output)

            return (
              <div
                key={trade.id || trade.signature}
                className={cn(
                  'grid grid-cols-[60px_55px_1fr_70px_70px_60px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                  'hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
              >
                {/* Time */}
                <div className="text-[12px] text-white/50">
                  {formatTimestamp(trade.timestamp)}
                </div>

                {/* Type */}
                <div className="-ml-1.5 flex items-center">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded leading-none', tradeType.color)}>
                    {tradeType.label}
                  </span>
                </div>

                {/* Pair */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-semibold text-white truncate">{trade.input}/{trade.output}</span>
                  {trade.signature && (
                    <a
                      href={`https://solscan.io/tx/${trade.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-accent-cyan transition-all shrink-0"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                {/* In */}
                <div className="text-[12px] font-mono text-white/70 truncate">
                  {formatAmount(trade.amount_in)}
                </div>

                {/* Out */}
                <div className="text-[12px] font-mono text-accent-cyan truncate">
                  {formatAmount(trade.amount_out)}
                </div>

                {/* Price */}
                <div className="text-[12px] font-mono text-white/50">
                  {price < 0.0001 ? price.toExponential(2) : price.toFixed(4)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </WidgetContainer>
  )
}
