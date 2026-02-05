import React, { useState, useEffect } from 'react'
import { Crown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StakeAccount {
  address: string
  owner: string
  guardian: string
  amount_ui: number
}

export const SKRWhaleLeaderboardWidget: React.FC = () => {
  const [whales, setWhales] = useState<StakeAccount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWhales = async () => {
      try {
        const res = await fetch('/api/skr/whales')
        const data = await res.json()
        setWhales(Array.isArray(data.whales) ? data.whales : [])
      } catch (e) {
        console.error('Failed to fetch SKR whales', e)
      } finally {
        setLoading(false)
      }
    }

    fetchWhales()
  }, [])

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Crown size={14} className="text-accent-cyan" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">SKR Whale Leaderboard</span>
        </div>
        <span className="text-[8px] font-bold text-text-muted uppercase">Top 20 Stakers</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {loading ? (
          <div className="h-full flex items-center justify-center p-10">
             <div className="text-[10px] font-black text-text-muted uppercase animate-pulse">Scanning Keystores...</div>
          </div>
        ) : (
          <>
            {whales.map((whale, i) => (
              <div
                key={whale.address}
                className={cn(
                  "p-3 rounded-xl border flex items-center justify-between group transition-all",
                  i < 3
                    ? "bg-accent-cyan/5 border-accent-cyan/10 hover:border-accent-cyan/30"
                    : "bg-white/[0.02] border-white/10 hover:border-white/20"
                )}
              >
                 <div className="flex items-center gap-3">
                    <span className={cn(
                        "text-[10px] font-mono font-black w-4",
                        i < 3 ? "text-accent-cyan" : "text-text-muted"
                    )}>
                        {(i + 1).toString().padStart(2, '0')}
                    </span>
                    <div className="flex flex-col">
                       <span className="text-[10px] font-mono text-white group-hover:text-accent-cyan transition-colors">
                          {whale.owner.slice(0, 4)}...{whale.owner.slice(-4)}
                       </span>
                       <span className="text-[8px] text-text-muted uppercase font-bold tracking-tighter">
                          Guardian: {whale.guardian.slice(0, 4)}
                       </span>
                    </div>
                 </div>

                 <div className="flex items-center gap-3 text-right">
                    <div className="flex flex-col items-end">
                       <span className="text-[10px] font-mono font-black text-white">
                          {whale.amount_ui.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                       </span>
                       <span className="text-[8px] font-bold text-accent-cyan uppercase">SKR</span>
                    </div>
                    <a
                      href={`https://solscan.io/account/${whale.owner}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-text-muted hover:text-white hover:border-white/20 transition-colors"
                    >
                       <ExternalLink size={10} />
                    </a>
                 </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
