import { useState } from 'react'
import { History } from 'lucide-react'
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
      <div className="bg-background-card border border-accent-pink/30 rounded-lg p-6 shadow-floating h-full flex flex-col relative overflow-hidden">
        
        <div className="flex items-center justify-between mb-2 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
          <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-white">
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
        <div className="grid grid-cols-[100px_60px_100px_1fr_80px_60px] gap-4 px-2.5 pb-2 mr-[6px] text-[9px] font-bold text-text-secondary uppercase tracking-wider shrink-0">
          <div>Timestamp</div>
          <div>Type</div>
          <div>Asset Pair</div>
          <div>Execution Detail</div>
          <div>Price</div>
          <div className="text-right">Status</div>
        </div>

        <div className="flex-1 relative min-h-0">
          <div className="space-y-1 h-full overflow-auto custom-scrollbar pr-2 pb-4">
            {history.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in-95 duration-500">
                 <div className="p-4 rounded-full bg-accent-pink/5 border border-accent-pink/20 shadow-[0_0_30px_rgba(255,0,128,0.1)]">
                   <History size={32} strokeWidth={1.5} className="text-accent-pink" />
                 </div>
                 <div className="text-center space-y-1">
                   <div className="font-black text-xs uppercase tracking-[0.2em] text-white">No Activity</div>
                   <div className="text-[10px] font-bold text-accent-pink/70">Trades will appear here</div>
                 </div>
               </div>
            ) : (
              history.map((trade) => {
                const isSuccess = trade.status === 'success'
                const isOutputStable = ['USDC', 'USDT', 'USD'].includes(trade.output)
                const targetAmount = isOutputStable ? trade.amount_in : trade.amount_out
                const impliedPrice = trade.usd_value > 0 && targetAmount > 0 
                  ? trade.usd_value / targetAmount 
                  : 0
                
                const source = (trade.source || '').toLowerCase()
                let txType = 'EXEC'
                let typeColor = 'text-accent-purple'

                if (source.includes('buy')) {
                    txType = 'BUY'
                    typeColor = 'text-accent-cyan'
                } else if (source.includes('sell')) {
                    txType = 'SELL'
                    typeColor = 'text-accent-pink'
                } else if (source.includes('transfer') || source.includes('send')) {
                    txType = 'SEND'
                    typeColor = 'text-accent-purple'
                } else if (source.includes('rebalance')) {
                    txType = 'REBAL'
                }
                
                const inputColor = txType === 'BUY' ? "text-accent-cyan" : txType === 'SELL' ? "text-accent-pink" : "text-accent-purple"
                const outputColor = txType === 'BUY' ? "text-accent-pink" : txType === 'SELL' ? "text-accent-cyan" : "text-accent-purple"

                const isSend = txType === 'SEND'

                return (
                  <div key={trade.id} className="grid grid-cols-[100px_60px_100px_1fr_80px_60px] gap-4 items-end p-2.5 rounded-md bg-background-elevated/30 border border-border hover:border-border transition-all group text-xs font-mono whitespace-nowrap overflow-hidden">
                    <div className={cn(
                      "font-black shrink-0 text-[11px] leading-none transition-colors duration-500",
                      isSuccess ? "text-white/80" : "text-text-muted"
                    )}>
                      {formatTimestamp(trade.timestamp)}
                    </div>

                    <div className={cn("font-black uppercase tracking-tighter shrink-0 text-[11px] leading-none", typeColor)}>
                      {txType}
                    </div>
                    
                    <div className="flex items-end gap-1 font-black uppercase tracking-tighter shrink-0 text-[11px] leading-none">
                      <span className={cn("inline-block leading-none", inputColor)}>{trade.input}</span>
                      {!isSend && (
                        <>
                          <span className="text-white/50 inline-block leading-none mx-0.5">/</span>
                          <span className={cn("inline-block leading-none", outputColor)}>{trade.output}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-end gap-2 min-w-0 overflow-hidden text-[11px] leading-none">
                       <span className={cn("font-bold shrink-0 leading-none", inputColor)}>{formatAmount(trade.amount_in)} {trade.input}</span>
                       {!isSend && (
                         <>
                           <span className="text-white/50 text-[12px] font-black shrink-0 leading-none px-1">→</span>
                           <span className={cn("font-black truncate leading-none", outputColor)}>{formatAmount(trade.amount_out)} {trade.output}</span>
                         </>
                       )}
                       {isSend && <span className="text-accent-purple/50 text-[9px] italic shrink-0 leading-none ml-1">→ External</span>}
                    </div>

                    <div className="text-[11px] font-black text-white/60 leading-none shrink-0">
                      {impliedPrice > 0 ? `${impliedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
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

