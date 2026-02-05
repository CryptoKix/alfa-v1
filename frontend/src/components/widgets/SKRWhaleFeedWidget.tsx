import React, { useState, useEffect } from 'react'
import { Activity, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Movement {
  signature: string
  block_time: number
  slot: number
  amount: number
  event_type: string
}

export const SKRWhaleFeedWidget: React.FC = () => {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMovements = async () => {
      try {
        const res = await fetch('/api/skr/events')
        const data = await res.json()
        setMovements(Array.isArray(data.events) ? data.events : [])
      } catch (e) {
        console.error('Failed to fetch SKR movements', e)
      } finally {
        setLoading(false)
      }
    }

    fetchMovements()
    const interval = setInterval(fetchMovements, 20000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-accent-cyan" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Whale Alerts</span>
        </div>
        <div className="flex items-center gap-1.5">
           <div className="w-1 h-1 rounded-full bg-accent-cyan animate-pulse" />
           <span className="text-[8px] font-bold text-accent-cyan uppercase">Real-time</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {loading ? (
          <div className="h-full flex items-center justify-center p-10">
             <div className="text-[10px] font-black text-text-muted uppercase animate-pulse">Monitoring Network...</div>
          </div>
        ) : (
          <>
            {movements.map((move) => {
              const isStake = move.event_type === 'stake'
              const amountUi = move.amount
              return (
              <div
                key={move.signature}
                className={cn(
                  "p-3 rounded-xl border flex items-center justify-between group transition-all",
                  isStake
                    ? "bg-accent-cyan/5 border-accent-cyan/10 hover:border-accent-cyan/30"
                    : "bg-accent-pink/5 border-accent-pink/10 hover:border-accent-pink/30"
                )}
              >
                 <div className="flex items-center gap-3">
                    <span className="text-[10px] text-white font-mono font-bold uppercase shrink-0">
                       {move.block_time ? new Date(move.block_time * 1000).toLocaleTimeString([], { hour12: false }) : '—'}
                    </span>
                    <div className={cn(
                        "p-2 rounded-lg",
                        isStake ? "bg-accent-cyan/10 text-accent-cyan" : "bg-accent-pink/10 text-accent-pink"
                    )}>
                        {isStake ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                    </div>
                    <div className="flex items-center gap-2">
                       <span className={cn(
                         "text-[10px] font-black uppercase tracking-widest",
                         isStake ? "text-accent-cyan" : "text-accent-pink"
                       )}>
                         {move.event_type}
                       </span>
                       <span className="text-[10px] font-mono font-black text-white">
                          {amountUi.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                       </span>
                    </div>
                 </div>

                 <div className="text-right">
                    <div className={cn(
                        "text-[10px] font-mono font-black transition-colors duration-500",
                        amountUi > 250000
                          ? (isStake ? "text-accent-cyan animate-pulse" : "text-accent-pink animate-pulse")
                          : "text-text-muted"
                    )}>
                       {amountUi > 250000 ? 'HEAVY' : 'NORMAL'}
                    </div>
                 </div>
              </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
