import React, { useState, useEffect } from 'react'
import { Landmark, TrendingUp, Users, Shield, ArrowUpRight, Gift, CheckCircle } from 'lucide-react'

interface StakingStats {
  total_accounts: number
  total_staked: number
  claim_vault_balance: number
  total_claims: number
  token_symbol: string
}

export const SKRStakingWidget: React.FC = () => {
  const [stats, setStats] = useState<StakingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/skr/stats')
        const data = await res.json()
        setStats(data)
      } catch (e) {
        console.error('Failed to fetch SKR stats', e)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-black/40 rounded-2xl border border-white/5 animate-pulse">
        <div className="text-[10px] font-black text-text-muted uppercase tracking-widest">Loading Staking Data...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Landmark size={14} className="text-accent-pink" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Network Staking</span>
        </div>
        <div className="px-2 py-0.5 rounded bg-accent-pink/10 border border-accent-pink/20">
           <span className="text-[8px] font-black text-accent-pink uppercase">24.9% APY</span>
        </div>
      </div>

      <div className="flex-1 p-4 grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-accent-pink/5 border border-accent-pink/10 flex items-center justify-between group">
           <div className="flex items-center gap-2">
              <TrendingUp size={12} className="text-accent-pink" />
              <span className="text-[11px] font-black uppercase tracking-widest text-accent-pink">Staked</span>
           </div>
           <div className="flex items-baseline gap-1">
              <span className="text-[11px] font-mono font-black text-white">
                {(stats?.total_staked || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[7px] font-bold text-accent-pink">SKR</span>
           </div>
        </div>

        <div className="p-3 rounded-xl bg-white/10 border border-white/20 flex items-center justify-between shadow-[0_0_15px_rgba(255,255,255,0.02)]">
           <div className="flex items-center gap-2">
              <Users size={12} className="text-white" />
              <span className="text-[11px] font-black uppercase tracking-widest text-white">Accounts</span>
           </div>
           <div className="text-[11px] font-mono font-black text-white">
              {(stats?.total_accounts || 0).toLocaleString()}
           </div>
        </div>

        <div className="p-3 rounded-xl bg-accent-cyan/5 border border-accent-cyan/10 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <CheckCircle size={12} className="text-accent-cyan" />
              <span className="text-[11px] font-black uppercase tracking-widest text-accent-cyan">Claims</span>
           </div>
           <div className="text-[11px] font-mono font-black text-accent-cyan">
              {(stats?.total_claims || 0).toLocaleString()}
           </div>
        </div>

        <div className="p-3 rounded-xl bg-accent-cyan/5 border border-accent-cyan/10 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <Gift size={12} className="text-accent-cyan" />
              <span className="text-[11px] font-black uppercase tracking-widest text-accent-cyan">Airdrop</span>
           </div>
           <div className="flex items-baseline gap-1">
              <span className="text-[11px] font-mono font-black text-accent-cyan">
                {(stats?.claim_vault_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[7px] font-bold text-accent-cyan">SKR</span>
           </div>
        </div>

        <div className="col-span-2 p-3 rounded-xl bg-accent-cyan/5 border border-accent-cyan/10 flex items-center justify-between group cursor-pointer hover:bg-accent-cyan/10 transition-all">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-cyan/20 rounded-lg text-accent-cyan">
                 <Shield size={14} />
              </div>
              <div>
                 <div className="text-[9px] font-black text-white uppercase tracking-widest">Active Guardians</div>
                 <div className="text-[8px] text-accent-cyan/60 font-bold uppercase tracking-tighter">1 Verified Operator</div>
              </div>
           </div>
           <ArrowUpRight size={14} className="text-accent-cyan opacity-40 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="p-3 bg-white/[0.01] border-t border-white/5 flex items-center justify-between">
         <span className="text-[8px] font-black text-text-muted uppercase tracking-tighter">Last Update: Just Now</span>
         <div className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full bg-accent-green" />
            <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Sync Active</span>
         </div>
      </div>
    </div>
  )
}
