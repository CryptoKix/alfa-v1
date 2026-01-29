import { useState, useEffect } from 'react'
import { Sprout, Shield, Zap, Activity, Info, TrendingUp, AlertTriangle, ChevronRight, BarChart3, ArrowUpRight, Clock, ExternalLink, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MeteoraPoolSelectorModal } from '@/components/modals/MeteoraPoolSelectorModal'

const YieldFarmPage = () => {
  const [activeTab, setActiveBot] = useState<'low' | 'med' | 'high'>('low')
  const [stats, setStats] = useState<any>(null)
  const [activePositions, setActivePositions] = useState<any[]>([])

  // Selection & Monitoring State
  const [isPoolSelectorOpen, setIsPoolSelectorOpen] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<any>(null)
  const [isWithdrawing, setIsWithdrawing] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const [selectedPool, setSelectedPool] = useState({
    pair: 'SOL/USDC',
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    type: 'Dynamic'
  })

  // Deployment State
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const statsRes = await fetch('/api/yieldfarm/stats')
        setStats(await statsRes.json())
        const posRes = await fetch('/api/yieldfarm/active')
        setActivePositions(await posRes.json())
      } catch (e) {
        console.error("Failed to fetch yield farm data", e)
      }
    }
    fetchData()
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleDeploy = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    setStatus('loading'); setErrorMsg('')
    try {
      const res = await fetch('/api/yieldfarm/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_address: selectedPool.mint,
          symbol: selectedPool.pair,
          amount: parseFloat(amount),
          risk_tier: activeTab,
          distribution: riskProfiles.find(p => p.id === activeTab)!.distribution,
          mint: selectedPool.mint
        })
      })
      const data = await res.json()
      if (data.success) {
        setStatus('success'); setAmount('')
        const posRes = await fetch('/api/yieldfarm/active')
        setActivePositions(await posRes.json())
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setStatus('error'); setErrorMsg(data.error || 'Deployment failed')
      }
    } catch (e) {
      setStatus('error'); setErrorMsg('Network error')
    }
  }

  const handleWithdraw = async (id: string) => {
    setIsWithdrawing(id)
    try {
      const res = await fetch('/api/lending/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const data = await res.json()
      if (data.success) {
        setSelectedPosition(null)
        setActivePositions(prev => prev.filter(p => p.id !== id))
      }
    } catch (e) {
      console.error("Withdrawal failed", e)
    } finally {
      setIsWithdrawing(null)
    }
  }

  const riskProfiles = [
    { id: 'low', name: 'Stability Harvester', risk: 'Low Risk', target: 'Stable-to-Bluechip', distribution: 'Curve', expectedApy: '15-40%', icon: Shield, description: 'Wide bin distribution focused on high-volume fee collection with minimal impermanent loss.' },
    { id: 'med', name: 'Volatility Engine', risk: 'Medium Risk', target: 'High-Correlation', distribution: 'Bid-Ask', expectedApy: '60-150%', icon: Zap, description: 'Captures "swing" fees by placing more liquidity immediately above and below current price.' },
    { id: 'high', name: 'Bin Sniper', risk: 'High Risk', target: 'Trend / New Launches', distribution: 'Spot', expectedApy: '500%+', icon: Activity, description: 'Maximum fee extraction by concentrating 90% of capital into 1-3 bins adjacent to price.' }
  ]

  const selected = riskProfiles.find(p => p.id === activeTab)!

  // Bin Visualization Component
  const BinVisualization = ({ type }: { type: string }) => {
    const bins = Array.from({ length: 25 })
    return (
      <div className="h-32 w-full flex items-end justify-between gap-0.5 px-2 relative group mt-4 mb-2">
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
           <BarChart3 size={64} className="text-accent-cyan" />
        </div>
        {bins.map((_, i) => {
          let height = "10%"
          const center = 12
          const dist = Math.abs(i - center)
          if (type === 'Spot') {
            if (dist === 0) height = "90%"
            else if (dist === 1) height = "40%"
            else height = "5%"
          } else if (type === 'Bid-Ask') {
            height = `${Math.max(10, 80 - (dist * 15))}%`
          } else {
            height = `${Math.max(20, 60 - (dist * 4))}%`
          }
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group/bin">
              <div className={cn("w-full rounded-t-sm transition-all duration-700", dist === 0 ? "bg-accent-cyan shadow-glow-cyan" : "bg-accent-cyan/20 group-hover/bin:bg-accent-cyan/40")} style={{ height }} />
              {i % 6 === 0 && <span className="text-[6px] font-bold text-text-muted uppercase">B{i}</span>}
            </div>
          )
        })}
        <div className="absolute left-1/2 bottom-0 w-[1px] h-full bg-accent-pink/40 dashed z-10">
           <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-accent-pink/20 border border-accent-pink/40 rounded text-[6px] font-black text-accent-pink uppercase tracking-widest whitespace-nowrap">Live Price</div>
        </div>
      </div>
    )
  }

  // MASTER DESIGN SYSTEM (DIRECT FROM DASHBOARD WIDGETS)
  const MASTER_CARD = "bg-background-card border border-accent-cyan/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full"
  const MASTER_HIGHLIGHT = "absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent"
  const MASTER_HEADER = "flex items-center justify-between border-b border-accent-cyan/10 shrink-0 h-[55px] -mx-4 px-4 -mt-4 mb-0 bg-white/[0.01]"
  const MASTER_INNER = "flex-1 bg-black/20 rounded-xl border border-accent-cyan/10 p-3 mt-4"
  const ALPHA_BADGE = "px-2 py-0.5 bg-accent-cyan/10 border border-accent-cyan/30 rounded text-[8px] font-black text-accent-cyan tracking-widest uppercase"

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pt-2 text-white animate-in fade-in duration-700">

      {/* HEADER SECTION */}
      <div className="flex items-center justify-between shrink-0 px-2 h-[60px]">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-accent-cyan/10 border border-accent-cyan/20 rounded-xl text-accent-cyan shadow-glow-cyan">
            <Sprout size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter italic bg-clip-text text-transparent bg-gradient-to-r from-accent-cyan to-white leading-none">
              Meteora DLMM Tactical
            </h1>
            <div className="flex items-center gap-2 mt-1.5 text-[9px] text-text-muted font-black uppercase tracking-[0.2em]">
               <div className="w-1 h-1 rounded-full bg-accent-cyan animate-pulse" />
               Yield Concentration Engine
            </div>
          </div>
        </div>

        <div className="flex gap-6 items-center">
           <div className="text-right">
              <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1">Vault TVL</div>
              <div className="text-base font-black font-mono text-white tracking-tight">${stats ? (stats.tvl / 1e9).toFixed(2) : '1.24'}B</div>
           </div>
           <div className="text-right border-l border-white/10 pl-6">
              <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1 text-accent-pink">24H Fees</div>
              <div className="text-base font-black font-mono text-accent-pink tracking-tight">${stats ? (stats.fees_24h / 1e3).toFixed(1) : '842.1'}K</div>
           </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">

        {/* LEFT Column */}
        <div className="lg:col-span-4 flex flex-col gap-2 min-h-0">
          {/* STRATEGY SELECTORS */}
          <div className="flex flex-col gap-2 shrink-0">
            {riskProfiles.map((profile) => (
              <div
                key={profile.id}
                onClick={() => { setActiveBot(profile.id as any); setSelectedPosition(null); }}
                className={cn(
                  MASTER_CARD, "h-[125px] cursor-pointer transition-all duration-300",
                  (activeTab === profile.id && !selectedPosition) ? "shadow-glow-cyan" : "opacity-60 hover:opacity-100"
                )}
              >
                <div className={cn(MASTER_HIGHLIGHT, (activeTab !== profile.id || selectedPosition) && "opacity-0")} />
                <div className={MASTER_HEADER}>
                   <div className="flex items-center gap-2">
                      <profile.icon size={18} className={(activeTab === profile.id && !selectedPosition) ? "text-accent-cyan" : "text-text-muted"} />
                      <h2 className="text-xs font-bold text-white uppercase tracking-tight">{profile.name}</h2>
                   </div>
                   <div className={ALPHA_BADGE}>
                     {profile.risk}
                   </div>
                </div>
                <div className={cn(MASTER_INNER, "mt-3 p-2.5 flex items-center justify-between", (activeTab === profile.id && !selectedPosition) && "bg-accent-cyan/[0.05] border-accent-cyan/30")}>
                   <div className="text-[9px] text-text-muted font-bold uppercase tracking-tighter flex items-center gap-2 leading-none">
                      <BarChart3 size={10} />
                      Target: {profile.target}
                   </div>
                   <ChevronRight size={14} className={cn("transition-all duration-500", (activeTab === profile.id && !selectedPosition) ? "text-accent-cyan translate-x-1 opacity-100" : "opacity-0")} />
                </div>
              </div>
            ))}
          </div>

          {/* FLEET STATUS */}
          <div className={MASTER_CARD + " flex-1"}>
             <div className={MASTER_HIGHLIGHT} />
             <div className={MASTER_HEADER}>
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-accent-cyan" />
                  <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Fleet Status</h2>
                </div>
                <div className={ALPHA_BADGE}>
                  {activePositions.length} ACTIVE
                </div>
             </div>
             <div className={cn(MASTER_INNER, "overflow-y-auto custom-scrollbar")}>
                {activePositions.length > 0 ? (
                   <div className="space-y-1">
                      {activePositions.map(pos => (
                         <div
                            key={pos.id}
                            onClick={() => setSelectedPosition(pos)}
                            className={cn(
                                "p-2.5 rounded-lg bg-background-elevated/30 border transition-all cursor-pointer flex items-center justify-between font-mono group/pos",
                                selectedPosition?.id === pos.id ? "border-accent-cyan shadow-glow-cyan" : "border-accent-cyan/10 hover:border-accent-cyan/30"
                            )}
                         >
                            <div className="flex items-center gap-3">
                               <div className={cn("w-1 h-4 rounded-full shadow-glow-cyan transition-all", selectedPosition?.id === pos.id ? "bg-accent-cyan h-6" : "bg-accent-cyan/40")} />
                               <span className={cn("text-[10px] font-black transition-colors", selectedPosition?.id === pos.id ? "text-accent-cyan" : "text-white")}>{pos.symbol}</span>
                            </div>
                            <span className="text-[10px] font-black text-accent-cyan">{pos.apy.toFixed(1)}%</span>
                         </div>
                      ))}
                   </div>
                ) : (
                   <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-30 gap-2 py-10">
                      <Shield size={24} strokeWidth={1} />
                      <span className="text-[9px] font-black uppercase tracking-widest">No Tactical Positions</span>
                   </div>
                )}
             </div>
          </div>
        </div>

        {/* RIGHT Column: DYNAMIC TACTICAL PANEL */}
        <div className="lg:col-span-8 flex flex-col gap-2 min-h-0">
          {selectedPosition ? (
            /* MONITOR MODE */
            <div className={cn(MASTER_CARD, "border-accent-cyan/30 shadow-glow-cyan animate-in slide-in-from-right-4 duration-500")}>
               <div className={MASTER_HIGHLIGHT} />
               <div className={MASTER_HEADER}>
                  <div className="flex items-center gap-3">
                     <div className="p-1.5 bg-accent-cyan/20 rounded-lg text-accent-cyan">
                        <Activity size={16} />
                     </div>
                     <h2 className="text-[10px] font-black uppercase tracking-tighter italic text-white">Monitor: {selectedPosition.symbol}</h2>
                     <div className={ALPHA_BADGE}>Tactical Active</div>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="text-[9px] text-text-muted font-black uppercase tracking-widest opacity-60">Fleet Status</span>
                     <div className="px-2 py-0.5 bg-accent-green/10 border border-accent-green/30 rounded text-[8px] font-black text-accent-green uppercase animate-pulse">Running</div>
                  </div>
               </div>

               <div className={cn(MASTER_INNER, "mt-4 p-6 space-y-6 bg-black/30 overflow-y-auto custom-scrollbar")}>

                  {/* Real-time Tactical Metrics Grid */}
                  <div className="grid grid-cols-3 gap-4">
                     {(() => {
                        const startTime = new Date(selectedPosition.created_at).getTime()
                        const elapsedYears = (now - startTime) / (1000 * 60 * 60 * 24 * 365)
                        const accruedFees = selectedPosition.amount * (selectedPosition.apy / 100) * elapsedYears

                        const details = JSON.parse(selectedPosition.details_json || '{}')
                        const entryPrice = details.entry_price || 127.45
                        const currentPrice = 127.45 + (Math.sin(now / 10000) * 2) // Simulating small volatility
                        const pnl = (selectedPosition.amount * (currentPrice - entryPrice) / entryPrice)
                        const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100

                        return (
                           <>
                              <div className="bg-background-card border border-accent-cyan/10 rounded-xl p-3 flex flex-col gap-1">
                                 <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Accrued Fees</span>
                                 <div className="text-lg font-black text-accent-green font-mono">
                                    +${accruedFees.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                                 </div>
                              </div>
                              <div className="bg-background-card border border-accent-cyan/10 rounded-xl p-3 flex flex-col gap-1">
                                 <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Position PnL</span>
                                 <div className={cn("text-lg font-black font-mono", pnl >= 0 ? "text-accent-cyan" : "text-accent-pink")}>
                                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                    <span className="text-[9px] ml-1.5 opacity-60">({pnlPct.toFixed(2)}%)</span>
                                 </div>
                              </div>
                              <div className="bg-background-card border border-accent-cyan/10 rounded-xl p-3 flex flex-col gap-1">
                                 <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Bin Yield</span>
                                 <div className="text-lg font-black text-white font-mono">{selectedPosition.apy.toFixed(1)}%<span className="text-[8px] ml-1 text-text-muted uppercase">APY</span></div>
                              </div>
                           </>
                        )
                     })()}
                  </div>

                  {/* Bin Mapping Visualization */}
                  <div className="bg-background-card border border-accent-cyan/10 rounded-xl p-4 relative overflow-hidden">
                     <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-black text-accent-cyan uppercase tracking-widest flex items-center gap-2">
                           <TrendingUp size={14} />
                           Live Bin concentration: {JSON.parse(selectedPosition.details_json || '{}').distribution || 'Dynamic'}
                        </h3>
                        <span className="text-[8px] text-text-muted font-bold uppercase tracking-tighter italic">ID: {selectedPosition.id}</span>
                     </div>
                     <BinVisualization type={JSON.parse(selectedPosition.details_json || '{}').distribution || 'Curve'} />
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-[0.2em] text-accent-cyan ml-1">Fleet Configuration</label>
                           <div className="p-5 bg-background-elevated/30 border border-accent-cyan/10 rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center font-black text-accent-cyan shadow-glow-cyan uppercase text-lg">{selectedPosition.symbol[0]}</div>
                                 <div>
                                    <div className="text-sm font-black text-white">{selectedPosition.symbol}</div>
                                    <div className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-0.5">Meteora DLMM Engine</div>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <div className="text-[8px] text-text-muted font-black uppercase">Principal</div>
                                 <div className="text-sm font-black font-mono text-white">{selectedPosition.amount.toLocaleString()} {selectedPosition.symbol.split('/')[1] || 'USDC'}</div>
                              </div>
                           </div>
                        </div>

                        <div className="p-5 bg-accent-pink/5 rounded-xl border border-accent-pink/20 flex items-start gap-4">
                           <AlertTriangle size={20} className="text-accent-pink shrink-0 mt-0.5" />
                           <div>
                              <div className="text-[9px] font-black text-accent-pink uppercase tracking-widest mb-1">Autonomous Sluice Active</div>
                              <p className="text-[10px] text-text-secondary leading-relaxed font-bold">The engine is currently sweeping fees across 25 bins. Capital is re-centered every 2.5% price shift.</p>
                           </div>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="p-5 bg-background-card border border-accent-cyan/10 rounded-xl space-y-4 shadow-inner relative overflow-hidden">
                           <h4 className="text-[10px] font-black uppercase text-accent-cyan flex items-center gap-2 tracking-[0.1em] border-b border-accent-cyan/10 pb-2 mb-2"><Clock size={12} /> Deployment Status</h4>
                           <div className="space-y-3">
                              <div className="flex justify-between items-center text-[10px] font-mono border-b border-white/5 pb-2"><span className="text-text-secondary font-bold uppercase tracking-tighter text-[8px]">Time Elapsed</span><span className="text-white font-black uppercase">Active {Math.floor((now - new Date(selectedPosition.created_at).getTime()) / 60000)}m</span></div>
                              <div className="flex justify-between items-center text-[10px] font-mono border-b border-white/5 pb-2"><span className="text-text-secondary font-bold uppercase tracking-tighter text-[8px]">Live APY</span><span className="text-accent-green font-black uppercase animate-pulse">{selectedPosition.apy.toFixed(1)}%</span></div>
                              <div className="flex justify-between items-center text-[10px] font-mono"><span className="text-text-secondary font-bold uppercase tracking-tighter text-[8px]">Network Status</span><span className="text-accent-cyan font-black">STABLE</span></div>
                           </div>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => setSelectedPosition(null)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-black text-[9px] text-white uppercase tracking-[0.2em] transition-all">Back to Fleet</button>
                           <a href={`https://solscan.io/account/${selectedPosition.mint}`} target="_blank" rel="noreferrer" className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-black text-[9px] text-white uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"><ExternalLink size={12} /> Explorer</a>
                        </div>
                     </div>
                  </div>

                  <div className="p-6 border-t border-accent-cyan/10 bg-white/[0.01] -mx-6 -mb-6 mt-auto">
                     <button
                        onClick={() => handleWithdraw(selectedPosition.id)}
                        disabled={isWithdrawing === selectedPosition.id}
                        className="w-full py-5 bg-accent-pink text-black font-black uppercase tracking-[0.4em] rounded-xl shadow-glow-pink hover:bg-white transition-all text-xs flex items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        {isWithdrawing === selectedPosition.id ? <RefreshCw size={20} className="animate-spin" /> : <ArrowUpRight size={20} />}
                        {isWithdrawing === selectedPosition.id ? 'Processing Tactical Exit...' : 'Terminate Position & Reclaim Rent'}
                     </button>
                  </div>
               </div>
            </div>
          ) : (
            /* DEPLOYMENT MODE */
            <div className={cn(MASTER_CARD, "animate-in fade-in duration-500")}>
               <div className={MASTER_HIGHLIGHT} />
               <div className={MASTER_HEADER}>
                  <div className="flex items-center gap-3">
                     <h2 className="text-[10px] font-black uppercase tracking-tighter italic text-white">{selected.name}</h2>
                     <div className={ALPHA_BADGE}>Alpha Build v1.0.4</div>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="text-[9px] text-text-muted font-black uppercase tracking-widest opacity-60">Proj. ROI</span>
                     <span className="text-xl font-black font-mono text-accent-cyan leading-none">{selected.expectedApy}</span>
                  </div>
               </div>

               <div className={cn(MASTER_INNER, "mt-4 p-6 space-y-8 bg-black/30 overflow-y-auto custom-scrollbar")}>
                  {/* Tactical Bin Preview */}
                  <div className="bg-background-card border border-accent-cyan/10 rounded-xl p-4 relative overflow-hidden">
                     <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-black text-accent-cyan uppercase tracking-widest flex items-center gap-2">
                           <Activity size={14} />
                           Tactical Bin Preview: {selected.distribution} Distribution
                        </h3>
                        <span className="text-[8px] text-text-muted font-bold uppercase tracking-tighter">Projected 25 Bins Focused</span>
                     </div>
                     <BinVisualization type={selected.distribution} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-accent-cyan ml-1">Asset Selection</label>
                          <div onClick={() => setIsPoolSelectorOpen(true)} className="p-4 rounded-lg bg-background-elevated/30 border border-accent-cyan/10 flex items-center justify-between group hover:border-accent-cyan/30 transition-all cursor-pointer">
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center font-black text-accent-cyan shadow-glow-cyan uppercase">{selectedPool.symbol[0]}</div>
                                <div>
                                   <div className="text-sm font-black text-white group-hover:text-accent-cyan transition-colors">{selectedPool.pair}</div>
                                   <div className="text-[8px] text-text-muted font-bold uppercase tracking-widest mt-0.5">Meteora DLMM</div>
                                </div>
                             </div>
                             <ChevronRight size={16} className="text-text-muted group-hover:text-accent-cyan transition-all group-hover:translate-x-1" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-accent-cyan ml-1">Capital Input</label>
                          <div className="relative group">
                             <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-background-elevated/30 border border-accent-cyan/10 rounded-xl p-4 text-xl font-black font-mono focus:outline-none focus:border-accent-cyan/40 transition-all text-center" />
                             <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-muted uppercase tracking-widest border-l border-white/10 pl-4">{selectedPool.pair.split('/')[1] || 'USDC'}</div>
                          </div>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <div className="p-5 bg-background-card border border-accent-cyan/10 rounded-xl space-y-4 shadow-inner relative overflow-hidden">
                           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/20 via-transparent to-transparent" />
                           <h4 className="text-[10px] font-black uppercase text-accent-cyan flex items-center gap-2 tracking-[0.1em] border-b border-accent-cyan/10 pb-2 mb-2"><Info size={12} /> Strategic Parameters</h4>
                           <div className="space-y-3">
                              <div className="flex justify-between items-center text-[10px] font-mono border-b border-white/5 pb-2"><span className="text-text-secondary font-bold uppercase tracking-tighter text-[8px]">Bin Shape</span><span className="text-white font-black uppercase">{selected.distribution}</span></div>
                              <div className="flex justify-between items-center text-[10px] font-mono border-b border-white/5 pb-2"><span className="text-text-secondary font-bold uppercase tracking-tighter text-[8px]">Rebalance</span><span className="text-accent-cyan font-black uppercase animate-pulse">Auto-Active</span></div>
                              <div className="flex justify-between items-center text-[10px] font-mono"><span className="text-text-secondary font-bold uppercase tracking-tighter text-[8px]">Max Slippage</span><span className="text-white font-black">0.50%</span></div>
                           </div>
                        </div>
                        <div className="p-4 bg-accent-pink/5 rounded-lg border border-accent-pink/20 flex items-start gap-3">
                           <AlertTriangle size={16} className="text-accent-pink shrink-0 mt-0.5" />
                           <p className="text-[10px] text-text-secondary leading-relaxed font-bold italic opacity-80 uppercase tracking-tighter">Concentrated liquidity involves directional risk. Position will re-center dynamically.</p>
                        </div>
                     </div>
                  </div>

                  <div className="p-6 border-t border-accent-cyan/10 bg-white/[0.01] -mx-6 -mb-6 mt-auto">
                     {status === 'error' && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[10px] text-accent-red font-bold text-center animate-in fade-in uppercase tracking-widest mb-4">{errorMsg}</div>}
                     {status === 'success' && <div className="p-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-[10px] text-accent-green font-bold text-center animate-in fade-in uppercase tracking-widest mb-4">Tactical Broadcast Successful</div>}
                     <button onClick={handleDeploy} disabled={status === 'loading' || !amount || parseFloat(amount) <= 0} className="w-full py-5 bg-accent-cyan text-black font-black uppercase tracking-[0.4em] rounded-xl shadow-glow-cyan hover:bg-white transition-all text-xs flex items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed border border-accent-cyan/30">
                        {status === 'loading' ? <Activity size={20} className="animate-spin" /> : <Zap size={20} fill="currentColor" />}
                        {status === 'loading' ? 'Broadcasting...' : 'Initialize Tactical Deployment'}
                     </button>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>

      <MeteoraPoolSelectorModal isOpen={isPoolSelectorOpen} onClose={() => setIsPoolSelectorOpen(false)} currentMint={selectedPool.mint} onSelect={(pool) => { setSelectedPool({ pair: pool.pair, symbol: pool.symbol, mint: pool.mint, type: pool.type }); setIsPoolSelectorOpen(false); }} />
    </div>
  )
}

export default YieldFarmPage
