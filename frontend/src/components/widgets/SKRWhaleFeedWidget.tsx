import React, { useState, useEffect } from 'react'
import { Activity, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Movement {
  signature: string
  timestamp: number
  slot: number
  amount: number
  type: 'Stake' | 'Unstake'
}

export const SKRWhaleFeedWidget: React.FC = () => {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMovements = async () => {
      try {
        const res = await fetch('/api/skr/movements')
        const data = await res.json()
        setMovements(data)
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
            {movements.map((move) => (
              <div
                key={move.signature}
                className={cn(
                  "p-3 rounded-xl border flex items-center justify-between group transition-all",
                  move.type === 'Stake'
                    ? "bg-accent-cyan/5 border-accent-cyan/10 hover:border-accent-cyan/30"
                    : "bg-accent-pink/5 border-accent-pink/10 hover:border-accent-pink/30"
                )}
              >
                 <div className="flex items-center gap-3">
                    <span className="text-[10px] text-white font-mono font-bold uppercase shrink-0">
                       {new Date(move.timestamp * 1000).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <div className={cn(
                        "p-2 rounded-lg",
                        move.type === 'Stake' ? "bg-accent-cyan/10 text-accent-cyan" : "bg-accent-pink/10 text-accent-pink"
                    )}>
                        {move.type === 'Stake' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                    </div>
                    <div className="flex items-center gap-2">
                       <span className={cn(
                         "text-[10px] font-black uppercase tracking-widest",
                         move.type === 'Stake' ? "text-accent-cyan" : "text-accent-pink"
                       )}>
                         {move.type}
                       </span>
                       <span className="text-[10px] font-mono font-black text-white">
                          {move.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                       </span>
                    </div>
                 </div>

                 <div className="text-right">
                    <div className={cn(
                        "text-[10px] font-mono font-black transition-colors duration-500",
                        move.amount > 250000
                          ? (move.type === 'Stake' ? "text-accent-cyan animate-pulse" : "text-accent-pink animate-pulse")
                          : "text-text-muted"
                    )}>
                       {move.amount > 250000 ? 'HEAVY' : 'NORMAL'}
                    </div>
                 </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
