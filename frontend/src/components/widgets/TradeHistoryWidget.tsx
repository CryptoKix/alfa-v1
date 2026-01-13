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
        <div className="grid grid-cols-[70px_100px_1fr_70px] gap-4 px-3 pb-2 mr-[6px] text-[9px] font-black text-text-muted uppercase tracking-[0.2em] shrink-0">
          <div>Time</div>
          <div>Asset Pair</div>
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
                
                return (
                  <div key={trade.id} className="grid grid-cols-[70px_100px_1fr_70px] gap-4 items-center p-2.5 rounded-xl bg-background-elevated/30 border border-white/5 hover:border-white/10 transition-all group text-[10px] font-mono">
                    <div className="text-text-muted font-bold">{formatTimeAgo(trade.timestamp, now)}</div>
                    
                    <div className="flex items-center gap-1.5 font-black uppercase tracking-tighter">
                      <span className="text-accent-cyan">{trade.output}</span>
                      <span className="text-text-muted opacity-30">/</span>
                      <span className="text-accent-pink">{trade.input}</span>
                    </div>

                    <div className="truncate text-white flex items-center gap-2">
                       <span className="font-bold">{formatAmount(trade.amount_in)} {trade.input}</span>
                       <span className="text-text-muted lowercase font-normal italic">for</span>
                       <span className="text-accent-cyan font-black">{formatAmount(trade.amount_out)} {trade.output}</span>
                    </div>

                    <div className="text-right">
                       <span className={cn(
                         "uppercase font-black text-[8px] tracking-widest px-1.5 py-0.5 rounded border leading-none", 
                         isSuccess ? "text-accent-green border-accent-green/20 bg-accent-green/5" : "text-accent-red border-accent-red/20 bg-accent-red/5"
                       )}>
                         {trade.status}
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
        formatTimeAgo={(d, n) => formatTimeAgo(d, n)} // wrapper to match signature if needed
        now={now}
      />
    </>
  )
}

