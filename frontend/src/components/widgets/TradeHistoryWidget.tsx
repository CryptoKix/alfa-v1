import { useEffect, useState } from 'react'
import { History, ExternalLink, ArrowRight } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { HistoryModal } from '../modals/HistoryModal'

const formatAmount = (num: number | undefined) => {
  if (num === undefined || num === null) return '0'
  if (num === 0) return '0'
  if (num < 0.000001) return '< 0.000001'
  return num.toLocaleString(undefined, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: num < 1 ? 6 : 2 
  })
}

const formatTimeAgo = (dateStr: string, nowMs: number) => {
  if (!dateStr) return '-'
  const isoStr = dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z')
  const date = new Date(isoStr)
  if (isNaN(date.getTime())) return '-'
  const diff = Math.floor((nowMs - date.getTime()) / 1000)
  if (diff < 60) return `${Math.max(0, diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export const TradeHistoryWidget = () => {
  const { history } = useAppSelector(state => state.portfolio)
  const [now, setNow] = useState(Date.now())
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000) // Update every second for 's ago'
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <div className="bg-background-card border border-white/5 rounded-2xl p-6 shadow-xl h-full flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
        
        <div className="flex items-center justify-between mb-2 border-b border-white/5 shrink-0 h-[55px]">
          <h3 className="text-base font-bold flex items-center gap-2">
            <History className="text-accent-cyan" size={18} />
            Trade History
          </h3>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="text-[9px] uppercase tracking-[0.2em] text-text-muted hover:text-accent-cyan transition-colors font-bold"
          >
            View All
          </button>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[60px_160px_1fr_80px_80px_80px_80px] gap-4 px-2.5 pb-2 mr-[6px] text-[9px] font-bold text-text-muted uppercase tracking-wider shrink-0">
          <div>Time</div>
          <div>Source</div>
          <div>Action</div>
          <div className="text-left">Price</div>
          <div className="text-left">Value</div>
          <div className="text-left">Fee</div>
          <div className="text-left">Status</div>
        </div>

        <div className="flex-1 relative min-h-0">
          <div className="space-y-1 h-full overflow-auto custom-scrollbar pr-2 pb-4">
            {history.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
                 <span className="text-xs italic tracking-widest uppercase">No trades recorded</span>
               </div>
            ) : (
              history.map((trade) => {
                const isSuccess = trade.status === 'success'
                const isOutputStable = ['USDC', 'USDT', 'USD'].includes(trade.output)
                const targetAmount = isOutputStable ? trade.amount_in : trade.amount_out
                const impliedPrice = trade.usd_value > 0 && targetAmount > 0 
                  ? trade.usd_value / targetAmount 
                  : 0

                return (
                  <div key={trade.id} className="grid grid-cols-[60px_160px_1fr_80px_80px_80px_80px] gap-4 items-center p-2 rounded-lg bg-background-elevated/30 border border-white/5 hover:border-white/10 transition-colors group text-[11px] font-mono">
                    <div className="text-text-muted">{formatTimeAgo(trade.timestamp, now)}</div>
                    
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isSuccess ? "bg-accent-cyan" : "bg-accent-red")} />
                      <span className="uppercase font-bold text-white/80 whitespace-nowrap">
                        {(trade.source || 'Manual').replace(/(\d+\.\d{2})\d+/, '$1')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 truncate text-white">
                       <span className={cn(isSuccess ? "text-accent-pink" : "text-text-muted")}>{formatAmount(trade.amount_in)} {trade.input}</span>
                       <ArrowRight size={10} className="text-text-muted shrink-0" />
                       <span className={cn(isSuccess ? "text-accent-cyan" : "text-text-muted")}>{formatAmount(trade.amount_out)} {trade.output}</span>
                    </div>

                    <div className="text-left text-text-muted">
                      {impliedPrice > 0 ? `$${impliedPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                    </div>

                    <div className="text-left font-bold text-white">
                      ${trade.usd_value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>

                    <div className="text-left text-text-muted text-[10px]">
                      {trade.priority_fee ? `${trade.priority_fee} SOL` : '-'}
                    </div>

                    <div className="flex items-center justify-start gap-2">
                       <span className={cn("uppercase font-bold text-[9px]", isSuccess ? "text-accent-green" : "text-accent-red")}>
                         {trade.status}
                       </span>
                       {trade.signature && (
                         <a 
                           href={`https://solscan.io/tx/${trade.signature}`} 
                           target="_blank" 
                           rel="noreferrer"
                           className="text-text-muted hover:text-white transition-colors"
                         >
                           <ExternalLink size={12} />
                         </a>
                       )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background-card to-transparent pointer-events-none z-10" />
        </div>
      </div>

      <HistoryModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        history={history}
        formatTimeAgo={(d, n) => formatTimeAgo(d, n)} // wrapper to match signature if needed
        now={now}
      />
    </>
  )
}

