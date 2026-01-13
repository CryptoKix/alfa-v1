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

const formatTimestamp = (dateStr: string) => {
  if (!dateStr) return '-'
  const isoStr = dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z')
  const date = new Date(isoStr)
  if (isNaN(date.getTime())) return '-'
  
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  
  return `${m}/${d} ${time}`
}

export const TradeHistoryWidget = () => {
  const { history } = useAppSelector(state => state.portfolio)
  const [isModalOpen, setIsModalOpen] = useState(false)

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
            className="text-[9px] uppercase tracking-[0.2em] text-text-muted hover:text-white transition-colors font-bold"
          >
            View All
          </button>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[100px_100px_80px_1fr_60px] gap-4 px-3 pb-2 mr-[6px] text-[9px] font-black text-text-muted uppercase tracking-[0.2em] shrink-0">
          <div>Timestamp</div>
          <div>Asset Pair</div>
          <div>Price</div>
          <div>Execution Detail</div>
          <div className="text-right">Status</div>
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
                  <div key={trade.id} className="grid grid-cols-[100px_100px_80px_1fr_60px] gap-4 items-end p-2.5 rounded-xl bg-background-elevated/30 border border-white/5 hover:border-white/10 transition-all group text-xs font-mono whitespace-nowrap overflow-hidden">
                    <div className={cn(
                      "font-black shrink-0 text-[11px] leading-none transition-colors duration-500",
                      isSuccess ? "text-accent-green" : "text-text-muted"
                    )}>
                      {formatTimestamp(trade.timestamp)}
                    </div>
                    
                    <div className="flex items-end gap-1 font-black uppercase tracking-tighter shrink-0 text-[11px] leading-none">
                      <span className="text-accent-pink inline-block leading-none">{trade.input}</span>
                      <span className="text-text-muted opacity-30 inline-block leading-none">/</span>
                      <span className="text-accent-cyan inline-block leading-none">{trade.output}</span>
                    </div>

                    <div className="text-[11px] font-black text-white/60 leading-none shrink-0">
                      {impliedPrice > 0 ? `@ ${impliedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '@ ---'}
                    </div>

                    <div className="flex items-end gap-2 min-w-0 overflow-hidden text-[11px] leading-none">
                       <span className="font-bold text-white/90 shrink-0 leading-none">{formatAmount(trade.amount_in)} {trade.input}</span>
                       <span className="text-text-muted text-[10px] italic shrink-0 leading-none">→</span>
                       <span className="text-accent-cyan font-black truncate leading-none">{formatAmount(trade.amount_out)} {trade.output}</span>
                    </div>

                    <div className="text-right shrink-0 leading-none">
                       <span className={cn(
                         "uppercase font-black text-[9px] tracking-widest px-2 py-0.5 rounded border leading-none inline-block", 
                         isSuccess ? "text-accent-green border-accent-green/20 bg-accent-green/5" : "text-accent-red border-accent-red/20 bg-accent-red/5"
                       )}>
                         {isSuccess ? 'OK' : 'ERR'}
                       </span>
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
        formatTimestamp={formatTimestamp}
      />
    </>
  )
}

