import { useState, useEffect } from 'react'
import { Activity, Zap, Clock, Settings2, BarChart3, Plus, Target, Trash2 } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { ArbSimulatorModal } from '../modals/ArbSimulatorModal'
import { ArbAddPairModal } from '../modals/ArbAddPairModal'
import { setArbConfig } from '@/features/arb/arbSlice'

// --- 1. SETTINGS WIDGET ---
export const ArbSettingsWidget = () => {
  const dispatch = useAppDispatch()
  const { minProfit, jitoTip, autoStrike, isMonitoring } = useAppSelector(state => state.arb)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const handleInitialize = async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/arb/start', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoStrike, jitoTip, minProfit })
      })
      if (res.ok) {
        setStatus('success'); setTimeout(() => setStatus('idle'), 3000)
        dispatch(addNotification({ title: 'Engine Sync', message: 'Parameters applied', type: 'success' }))
      }
    } catch (e) { setStatus('idle') }
  }

  return (
    <div className="lg:w-[400px] bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 h-full shrink-0">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple via-accent-cyan to-accent-pink opacity-50 z-20" />
      
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple"><Settings2 size={18} /></div>
          <h2 className="text-xs font-bold text-white uppercase tracking-tight">ARB CONFIG</h2>
        </div>
      </div>

      <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0 justify-center">
        <div className="flex-1 overflow-auto custom-scrollbar p-4 flex flex-col justify-center space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] uppercase text-text-muted font-bold px-1">Min Profit (%)</label>
              <input type="number" value={minProfit} onChange={e => dispatch(setArbConfig({ minProfit: parseFloat(e.target.value) }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 h-12 text-sm font-mono font-bold text-white focus:border-accent-cyan/50 outline-none transition-colors" />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] uppercase text-text-muted font-bold px-1">Jito Tip (SOL)</label>
              <input type="number" value={jitoTip} onChange={e => dispatch(setArbConfig({ jitoTip: parseFloat(e.target.value) }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 h-12 text-sm font-mono font-bold text-white focus:border-accent-cyan/50 outline-none transition-colors" />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex flex-col">
              <span className="text-sm font-black text-white uppercase leading-none">Auto-Strike</span>
              <span className="text-[9px] text-text-muted mt-1 uppercase font-bold tracking-tighter">Atomic Jito Bundles</span>
            </div>
            <button onClick={() => dispatch(setArbConfig({ autoStrike: !autoStrike }))} className={cn("w-12 h-6 rounded-full p-0.5 transition-all duration-300", autoStrike ? "bg-accent-purple shadow-glow-purple" : "bg-white/10")}>
              <div className={cn("w-5 h-5 rounded-full bg-white transition-all shadow-md", autoStrike ? "translate-x-6" : "translate-x-0")} />
            </button>
          </div>
        </div>
      </div>

      <button onClick={handleInitialize} disabled={status === 'loading'} className={cn("w-full py-4.5 rounded-2xl text-black font-black text-sm uppercase tracking-[0.25em] transition-all flex items-center justify-center gap-3 shadow-lg", isMonitoring ? "bg-white/5 text-accent-cyan border border-accent-cyan/30 shadow-none hover:bg-white/10" : "bg-accent-cyan shadow-glow-cyan hover:bg-white active:scale-95")}>
        {status === 'loading' ? <Activity size={20} className="animate-spin" /> : <Zap size={20} fill="currentColor" />}
        {isMonitoring ? 'Sync Engine' : 'Initialize'}
      </button>
    </div>
  )
}

// --- 2. ANALYSIS WIDGET ---
export const ArbAnalysisWidget = () => {
  const dispatch = useAppDispatch()
  const { matrix } = useAppSelector(state => state.arb)
  const venues = ["Raydium", "Orca", "Meteora", "Phoenix"]
  const [isAddPairOpen, setIsAddPairOpen] = useState(false)
  const [dbTokens, setDbTokens] = useState<any[]>([])

  const handleDeletePair = async (id: string) => {
    try {
      const res = await fetch('/api/arb/pairs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        dispatch(addNotification({ title: 'Pair Removed', message: 'Monitoring target updated', type: 'success' }))
      }
    } catch (e) {
      dispatch(addNotification({ title: 'Error', message: 'Failed to remove pair', type: 'error' }))
    }
  }

  // Fetch tokens only when modal is opened to save resources
  useEffect(() => {
    if (isAddPairOpen && dbTokens.length === 0) {
      const fetchTokens = async () => {
        try {
          const res = await fetch('/api/tokens')
          const data = await res.json()
          setDbTokens(data)
        } catch (e) {}
      }
      fetchTokens()
    }
  }, [isAddPairOpen])

  return (
    <div className="bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
      
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan"><BarChart3 size={18} /></div>
          <h2 className="text-xs font-bold text-white uppercase tracking-tight">Venue Matrix</h2>
          <button 
            onClick={() => setIsAddPairOpen(true)}
            className="p-1 bg-black/40 hover:bg-accent-cyan/20 rounded-md text-accent-cyan border border-accent-cyan/50 hover:border-accent-cyan transition-all active:scale-95 ml-2"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>
        <div className="text-[8px] font-mono text-accent-cyan uppercase tracking-widest opacity-60 px-2">Live 5s Polling</div>
      </div>

      <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0 mt-2">
        <div className="flex-1 overflow-auto custom-scrollbar p-2">
          <div className="grid grid-cols-[85px_repeat(4,1fr)_24px] gap-1 mb-1 px-1">
            <div className="text-[7px] font-black text-text-muted uppercase">Pair</div>
            {venues.map(v => <div key={v} className="text-[7px] font-black text-text-muted uppercase text-center">{v}</div>)}
            <div />
          </div>

          <div className="space-y-1">
            {Object.entries(matrix).map(([pair, data]) => {
              const { venues: venuePrices, id } = data
              const prices = Object.values(venuePrices)
              const minPrice = Math.min(...prices)
              const maxPrice = Math.max(...prices)
              return (
                <div key={pair} className="grid grid-cols-[85px_repeat(4,1fr)_24px] gap-1 h-10 items-stretch group">
                  <div className="bg-white/5 rounded-lg border border-white/5 px-1.5 flex items-center min-w-0">
                    <span className="text-[8px] font-black text-white uppercase truncate">{pair}</span>
                  </div>
                  {venues.map(v => {
                    const price = venuePrices[v]
                    const isBest = price === minPrice && minPrice !== maxPrice
                    const isWorst = price === maxPrice && minPrice !== maxPrice
                    return (
                      <div key={v} className={cn("rounded-lg border px-1 flex flex-col items-center justify-center transition-all", isBest ? "bg-accent-cyan/10 border-accent-cyan/30" : isWorst ? "bg-accent-pink/10 border-accent-pink/30" : "bg-white/[0.02] border-white/5")}>
                        <div className={cn("text-[9px] font-mono font-bold", isBest ? "text-accent-cyan" : isWorst ? "text-accent-pink" : "text-white/60")}>
                          {price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-center">
                    <button 
                      onClick={() => id && handleDeletePair(id)}
                      className={cn(
                        "p-1.5 rounded-md transition-all",
                        id ? "text-text-muted hover:text-accent-pink hover:bg-accent-pink/10 opacity-40 hover:opacity-100" : "text-white/5 cursor-not-allowed"
                      )}
                      title={id ? "Remove Pair" : "System Pair (Non-removable)"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      
      <ArbAddPairModal isOpen={isAddPairOpen} onClose={() => setIsAddPairOpen(false)} dbTokens={dbTokens} />
    </div>
  )
}

// --- 3. OPPORTUNITIES WIDGET ---
export const ArbOpportunitiesWidget = () => {
  const { opportunities } = useAppSelector(state => state.arb)
  const [selectedOpp, setSelectedOpp] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full shrink-0 min-w-0">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
      
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-pink/10 rounded-lg text-accent-pink"><Activity size={18} /></div>
          <h2 className="text-xs font-bold text-white uppercase tracking-tight">OPPORTUNITIES</h2>
        </div>
      </div>

      <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0 mt-2">
        <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-2">
          {opportunities.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
              <Target size={32} strokeWidth={1} className="animate-pulse" />
              <div className="text-center font-bold text-[10px] uppercase tracking-widest">Scanning gaps...</div>
            </div>
          ) : (
            opportunities.map((opp, i) => (
              <div key={i} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] transition-all relative overflow-hidden group">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg shrink-0 text-accent-cyan bg-accent-cyan/10"><Zap size={14} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-black text-white uppercase">{opp.input_symbol}/{opp.output_symbol}</span>
                      <span className="text-[8px] text-text-muted font-mono flex items-center gap-1"><Clock size={8} />{formatTime(opp.timestamp)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-[9px] text-text-secondary uppercase">{opp.best_venue} → {opp.worst_venue}</div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black text-accent-green">+{opp.spread_pct.toFixed(3)}%</div>
                        <button onClick={() => { setSelectedOpp(opp); setIsModalOpen(true); }} className="px-2 py-1 bg-accent-purple/10 border border-accent-purple/30 rounded-md text-[8px] font-black text-accent-purple hover:bg-accent-purple hover:text-white transition-all uppercase">Dry Run</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ArbSimulatorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} opportunity={selectedOpp} />
    </div>
  )
}
