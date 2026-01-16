import { useState } from 'react'
import { History, Activity } from 'lucide-react'
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
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
        
        <div className="flex items-center justify-between mb-2 border-b border-white/5 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
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

        {/* Table Header - Strict 16px offset match (px-4 = 16px) */}
        <div className="grid grid-cols-[90px_100px_1fr_80px_60px] gap-4 px-4 py-3 text-[8px] font-black text-text-muted uppercase tracking-widest shrink-0 border-b border-white/5">
          <div className="text-left">Timestamp</div>
          <div className="text-left">Asset Pair</div>
          <div className="text-left">Execution Detail</div>
          <div className="text-left">Price</div>
          <div className="text-left">Status</div>
        </div>

        <div className="flex-1 relative min-h-0">
          <div className="py-2 space-y-1 h-full overflow-auto custom-scrollbar">
            {history.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50 py-20">
                 <Activity size={32} strokeWidth={1} />
                 <div className="text-center">
                    <div className="font-bold text-[10px] uppercase tracking-widest mb-1">System Idle</div>
                    <div className="text-[9px]">No trades recorded on-chain</div>
                 </div>
               </div>
            ) : (
              history.map((trade) => {
                const isSuccess = trade.status === 'success'
                const isOutputStable = ['USDC', 'USDT', 'USD'].includes(trade.output)
                
                const source = (trade.source || '').toLowerCase()
                const txType = source.includes('buy') ? 'BUY' : source.includes('sell') ? 'SELL' : source.includes('rebalance') ? 'REBAL' : 'EXEC'
                
                const isRebal = txType === 'REBAL'
                const isBuy = txType === 'BUY'
                
                // Unified Color Logic from Executions
                const fromColor = isRebal ? "text-white/90" : (isBuy ? "text-accent-cyan" : "text-accent-pink")
                const toColor = isRebal ? "text-white/90" : (isBuy ? "text-accent-pink" : "text-accent-cyan")

                const targetAmount = isOutputStable ? trade.amount_in : trade.amount_out
                const impliedPrice = trade.usd_value > 0 && targetAmount > 0 
                  ? trade.usd_value / targetAmount 
                  : 0
                
                return (
                  <div key={trade.id} className="mx-2 grid grid-cols-[90px_100px_1fr_80px_60px] gap-4 items-center px-2 py-2 rounded-lg bg-background-elevated/30 border border-white/5 hover:border-white/10 transition-all group font-mono whitespace-nowrap overflow-hidden">
                    {/* 1. Time */}
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-tighter text-left">
                      {formatTimestamp(trade.timestamp)}
                    </div>
                    
                    {/* 2. Asset Pair */}
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter text-left">
                      <span className={fromColor}>{trade.input}</span>
                      <span className="text-text-muted opacity-30">/</span>
                      <span className={toColor}>{trade.output}</span>
                    </div>

                    {/* 3. Execution Detail */}
                    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-[10px] font-bold tracking-tighter text-left">
                       <span className={cn("tabular-nums", fromColor)}>{formatAmount(trade.amount_in)}</span>
                       <span className={cn("uppercase", fromColor)}>{trade.input}</span>
                       <span className="text-text-muted opacity-30 mx-1">→</span>
                       <span className={cn("tabular-nums", toColor)}>{formatAmount(trade.amount_out)}</span>
                       <span className={cn("uppercase", toColor)}>{trade.output}</span>
                    </div>

                    {/* 4. Price */}
                    <div className="text-[10px] font-black tabular-nums text-white/80 tracking-tighter text-left">
                      {impliedPrice > 0 ? impliedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                    </div>

                    {/* 5. Status */}
                    <div className="text-left">
                       <span className={cn(
                         "uppercase font-black text-[8px] tracking-tighter px-1.5 py-0.5 rounded border leading-none inline-block", 
                         isRebal ? "text-white/20 border-white/10 bg-white/5" : 
                         (isSuccess ? "text-accent-cyan border-accent-cyan/20 bg-accent-cyan/5" : "text-accent-pink border-accent-pink/20 bg-accent-pink/5")
                       )}>
                         {isRebal ? 'REB' : (isSuccess ? 'OK' : 'FAIL')}
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
