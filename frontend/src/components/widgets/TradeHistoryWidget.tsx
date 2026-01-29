import { useState } from 'react'
import { History, ExternalLink } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { HistoryModal } from '../modals/HistoryModal'
import { WidgetContainer } from './base/WidgetContainer'

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

export const TradeHistoryWidget = () => {
  const { history } = useAppSelector((state) => state.portfolio)
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <WidgetContainer
        id="trade-history"
        title="Trade History"
        icon={<History className="w-4 h-4" />}
        badge={history.length > 0 ? `${history.length}` : undefined}
        actions={
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-[10px] uppercase tracking-wider text-white/40 hover:text-accent-cyan transition-colors font-semibold"
          >
            View All
          </button>
        }
        noPadding
      >
        {/* Content */}
        <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
          {/* Table Header */}
          <div className="grid grid-cols-[70px_60px_1fr_80px_80px_70px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
            <div>Time</div>
            <div>Type</div>
            <div>Pair</div>
            <div>In</div>
            <div>Out</div>
            <div>Price</div>
          </div>

          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-white/30">
              <History size={24} strokeWidth={1} className="mb-2 opacity-50" />
              <span className="text-xs">No trades recorded</span>
            </div>
          ) : (
            history.slice(0, 20).map((trade) => {
              const price = trade.amount_in && trade.amount_out ? (trade.amount_out / trade.amount_in) : 0

              return (
                <div
                  key={trade.id}
                  className={cn(
                    'grid grid-cols-[70px_60px_1fr_80px_80px_70px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                    'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                    'hover:bg-white/[0.04] hover:border-accent-cyan/30'
                  )}
                >
                  {/* Time */}
                  <div className="text-[11px] text-white/50">
                    {formatTimestamp(trade.timestamp)}
                  </div>

                  {/* Type */}
                  <div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan">
                      Swap
                    </span>
                  </div>

                  {/* Pair */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-white truncate">{trade.input}/{trade.output}</span>
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

      <HistoryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} history={history} formatTimestamp={formatTimestamp} />
    </>
  )
}
