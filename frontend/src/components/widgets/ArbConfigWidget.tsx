import { useState, useEffect } from 'react'
import { Activity, Target, Zap, Clock, Settings2, BarChart3, Plus, Trash2, ShieldCheck } from 'lucide-react'
import { useAppDispatch } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { arbSocket } from '@/services/socket'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { ArbSimulatorModal } from '../modals/ArbSimulatorModal'

export const ArbConfigWidget = () => {
  const dispatch = useAppDispatch()
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [matrix, setMatrix] = useState<Record<string, Record<string, number>>>({})
  const [minProfit, setMinProfit] = useState('0.1')
  const [jitoTip, setJitoTip] = useState('0.001')
  const [autoStrike, setAutoStrike] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(true)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  // Simulation State
  const [selectedOpp, setSelectedOpp] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Pair Management State
  const [pairs, setPairs] = useState<any[]>([])
  const [isAddingPair, setIsAddingPair] = useState(false)
  const [newInputMint, setNewInputMint] = useState('')
  const [newOutputMint, setNewOutputMint] = useState('')
  const [newAmount, setNewAmount] = useState('')

  const venues = ["Raydium", "Orca", "Meteora", "Phoenix"]

  // Audio Synth for Tactical Alerts
  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime) // A5
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1)
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)

      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)

      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.3)
    } catch (e) {}
  }

  useEffect(() => {
    fetchStatus()
    fetchPairs()
  }, [])

  useEffect(() => {
    if (!arbSocket) return

    const handleArb = (data: any) => {
      const threshold = parseFloat(minProfit)
      if (data.spread_pct >= threshold) {
        setOpportunities(prev => [data, ...prev].slice(0, 50))
        
        // Trigger Tactical Alerts
        playAlertSound()
        dispatch(addNotification({
          title: 'Arb Opportunity',
          message: `${data.input_symbol}/${data.output_symbol}: ${data.spread_pct.toFixed(3)}% gap between ${data.best_venue} and ${data.worst_venue}`,
          type: 'success'
        }))
      }
    }

    const handleMatrix = (data: any) => {
      const key = `${data.input_symbol}/${data.output_symbol}`
      setMatrix(prev => ({
        ...prev,
        [key]: data.venues
      }))
    }

    arbSocket.on('arb_opportunity', handleArb)
    arbSocket.on('price_matrix_update', handleMatrix)
    
    return () => {
      arbSocket.off('arb_opportunity', handleArb)
      arbSocket.off('price_matrix_update', handleMatrix)
    }
  }, [minProfit, arbSocket])

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/arb/status')
      const data = await res.json()
      if (data.running) setIsMonitoring(true)
    } catch (e) {}
  }

  const fetchPairs = async () => {
    try {
      const res = await fetch('/api/arb/pairs')
      const data = await res.json()
      setPairs(data)
    } catch (e) {}
  }

  const handleAddPair = async () => {
    try {
      const res = await fetch('/api/arb/pairs/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: newInputMint,
          outputMint: newOutputMint,
          amount: parseFloat(newAmount)
        })
      })
      if (res.ok) {
        setIsAddingPair(false)
        fetchPairs()
        dispatch(addNotification({ title: 'Pair Added', message: 'Now monitoring new arb target', type: 'success' }))
      }
    } catch (e) {}
  }

  const handleDeletePair = async (id: number) => {
    try {
      await fetch('/api/arb/pairs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      fetchPairs()
    } catch (e) {}
  }

  const handleInitialize = async () => {
    setStatus('loading')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    try {
      const res = await fetch('/api/arb/start', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoStrike,
          jitoTip: parseFloat(jitoTip),
          minProfit: parseFloat(minProfit)
        }),
        signal: controller.signal 
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        setStatus('success')
        setIsMonitoring(true)
        dispatch(addNotification({ title: 'Arb Engine', message: 'Engine initialized and scanning pools', type: 'success' }))
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown server error' }))
        dispatch(addNotification({ title: 'Arb Error', message: data.error || 'Failed to start engine', type: 'error' }))
        setStatus('idle')
      }
    } catch (e: any) {
      console.error('Initialize Error:', e)
      const msg = e.name === 'AbortError' ? 'Request timed out' : 'Network error'
      dispatch(addNotification({ title: 'Arb Error', message: msg, type: 'error' }))
      setStatus('idle')
    } finally {
      // status is already handled in success/error paths, 
      // but let's ensure it's not stuck in loading if something weird happens
      setTimeout(() => {
        setStatus(prev => prev === 'loading' ? 'idle' : prev)
      }, 5000)
    }
  }

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  return (
    <div className="flex flex-col lg:flex-row gap-2 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-0">
      
      {/* COLUMN 1: Config */}
      <div className="lg:w-[380px] bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 shrink-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple via-accent-cyan to-accent-pink opacity-50 z-20" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
              <Settings2 size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">ARB CONFIG</h2>
            </div>
          </div>
          <button 
            onClick={() => setIsAddingPair(!isAddingPair)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-accent-cyan transition-colors border border-white/5"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-3">
            {/* Permanent Add Pair Form */}
            <div className="p-3 bg-accent-purple/5 border border-accent-purple/20 rounded-xl space-y-3">
              <div className="text-[9px] font-black text-accent-cyan uppercase tracking-wider border-b border-white/5 pb-1.5">Add Target Pair</div>
              <div className="space-y-1.5">
                <label className="text-[8px] uppercase text-text-muted font-bold px-1">Input Mint (Base)</label>
                <input value={newInputMint} onChange={(e) => setNewInputMint(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none focus:border-accent-cyan/50 h-8" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] uppercase text-text-muted font-bold px-1">Output Mint (Target)</label>
                <input value={newOutputMint} onChange={(e) => setNewOutputMint(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none focus:border-accent-cyan/50 h-8" />
              </div>
              <div className="grid grid-cols-[1fr_100px] gap-2 items-end">
                <div className="space-y-1.5">
                  <label className="text-[8px] uppercase text-text-muted font-bold px-1">Test Amount</label>
                  <input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} type="number" className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none focus:border-accent-cyan/50 h-8" />
                </div>
                <button onClick={handleAddPair} className="bg-accent-purple text-white rounded-lg font-black uppercase text-[10px] hover:bg-white hover:text-black transition-all h-8">Add Pair</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
              <div className="space-y-1.5">
                <label className="text-[8px] uppercase text-text-muted font-bold px-1">Min Profit (%)</label>
                <input 
                  type="number" 
                  value={minProfit} 
                  onChange={(e) => setMinProfit(e.target.value)} 
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white focus:border-accent-cyan/50 outline-none h-9" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] uppercase text-text-muted font-bold px-1">Jito Tip (SOL)</label>
                <input 
                  type="number" 
                  value={jitoTip} 
                  onChange={(e) => setJitoTip(e.target.value)} 
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white focus:border-accent-cyan/50 outline-none h-9" 
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-accent-purple/5 border border-accent-purple/20 rounded-xl">
              <div>
                <div className="text-[10px] font-black text-white uppercase leading-none">Auto-Strike</div>
                <div className="text-[7px] text-text-muted mt-1 uppercase tracking-tighter font-bold">Atomic Jito Bundles</div>
              </div>
              <button 
                onClick={() => setAutoStrike(!autoStrike)}
                className={cn(
                  "w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out",
                  autoStrike ? "bg-accent-purple" : "bg-white/10"
                )}
              >
                <div className={cn(
                  "w-3 h-3 rounded-full bg-white transition-transform duration-200",
                  autoStrike ? "translate-x-4" : "translate-x-0"
                )} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
              <div>
                <div className="text-[10px] font-black text-white uppercase leading-none">Live Monitor</div>
                <div className="text-[7px] text-text-muted mt-1 uppercase tracking-tighter font-bold">Scan DEX venues</div>
              </div>
              <button 
                onClick={() => setIsMonitoring(!isMonitoring)}
                className={cn(
                  "w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out",
                  isMonitoring ? "bg-accent-cyan" : "bg-white/10"
                )}
              >
                <div className={cn(
                  "w-3 h-3 rounded-full bg-white transition-transform duration-200",
                  isMonitoring ? "translate-x-4" : "translate-x-0"
                )} />
              </button>
            </div>

            <div className="p-2 border-t border-white/5 pt-3">
               <div className="text-[9px] uppercase text-text-muted font-bold mb-2 px-1">Monitored Pairs</div>
               <div className="space-y-1">
                  {pairs.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5 group">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-white">{p.input_symbol}/{p.output_symbol}</span>
                          <span className="text-[7px] text-text-muted font-mono truncate max-w-[180px]">{p.input_mint.slice(0,8)}...</span>
                       </div>
                       <button onClick={() => handleDeletePair(p.id)} className="p-1 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 size={12} />
                       </button>
                    </div>
                  ))}
                  {pairs.length === 0 && (
                    <div className="text-center py-4 text-[9px] text-text-muted italic uppercase">Default SOL/USDC scanning active</div>
                  )}
               </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleInitialize}
          disabled={status === 'loading'}
          className={cn(
            "w-full py-4 rounded-2xl text-black font-black text-sm uppercase tracking-[0.2em] transition-all transform active:scale-95 flex items-center justify-center gap-2 shrink-0",
            isMonitoring 
              ? "bg-white/5 text-accent-cyan border border-accent-cyan/30 shadow-none hover:bg-white/10" 
              : "bg-accent-cyan shadow-[0_0_30px_rgba(0,255,255,0.2)] hover:bg-white",
            status === 'loading' && "opacity-50 cursor-not-allowed"
          )}
        >
          {status === 'loading' ? <Activity size={18} className="animate-spin" /> : <Zap size={18} fill="currentColor" />}
          {status === 'success' ? 'Ready & Scanning' : isMonitoring ? 'Restart Engine' : 'Initialize Arb Engine'}
        </button>
      </div>

      {/* COLUMN 2: Visualization */}
      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <BarChart3 size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">ANALYSIS</h2>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-2">
            <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-2 px-1">
               <div className="text-[8px] font-black text-text-muted uppercase">Pair</div>
               {venues.map(v => (
                 <div key={v} className="text-[8px] font-black text-text-muted uppercase text-center">{v}</div>
               ))}
            </div>

            <div className="space-y-1">
              {Object.entries(matrix).map(([pair, venuePrices]) => {
                const prices = Object.values(venuePrices)
                const minPrice = Math.min(...prices)
                const maxPrice = Math.max(...prices)
                
                return (
                  <div key={pair} className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 items-stretch h-12">
                    <div className="bg-white/5 rounded-lg border border-white/5 px-2 flex items-center min-w-0">
                       <span className="text-[9px] font-black text-white uppercase truncate">{pair}</span>
                    </div>
                    {venues.map(v => {
                      const price = venuePrices[v]
                      const isBest = price === minPrice && minPrice !== maxPrice
                      const isWorst = price === maxPrice && minPrice !== maxPrice
                      
                      return (
                        <div 
                          key={v} 
                          className={cn(
                            "rounded-lg border px-1 flex flex-col items-center justify-center transition-all duration-500 min-w-0",
                            !price ? "bg-white/[0.02] border-white/5" :
                            isBest ? "bg-accent-green/10 border-accent-green/30 shadow-[inset_0_0_10px_rgba(0,255,157,0.1)]" :
                            isWorst ? "bg-accent-red/10 border-accent-red/30 shadow-[inset_0_0_10px_rgba(255,42,109,0.1)]" :
                            "bg-white/[0.02] border-white/5"
                          )}
                        >
                          <div className={cn(
                            "text-[10px] font-mono font-bold leading-none",
                            isBest ? "text-accent-green" : isWorst ? "text-accent-red" : "text-white/60"
                          )}>
                            {price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                          </div>
                          <div className="h-[8px] mt-1 flex items-center justify-center">
                            {price && (
                              <span className={cn(
                                "text-[7px] font-black uppercase leading-none opacity-40 transition-opacity",
                                (isBest || isWorst) ? "opacity-100" : "opacity-0"
                              )}>
                                {isBest ? 'Buy' : isWorst ? 'Sell' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {Object.keys(matrix).length === 0 && (
                <div className="h-40 flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
                  <Target size={32} className="animate-pulse" />
                  <div className="text-center font-bold text-[10px] uppercase tracking-widest">Awaiting venue data...</div>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 border-t border-white/5 flex items-center justify-between shrink-0 bg-black/40">
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                   <span className="text-[8px] font-black text-text-muted uppercase">Best Buy</span>
                </div>
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-accent-red" />
                   <span className="text-[8px] font-black text-text-muted uppercase">Best Sell</span>
                </div>
             </div>
             <div className="text-[8px] font-mono text-accent-cyan uppercase tracking-widest opacity-80">Live 5s Polling</div>
          </div>
        </div>
      </div>

      {/* COLUMN 3: Opportunities */}
      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple via-accent-cyan to-accent-pink opacity-50 z-20" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-pink/10 rounded-lg text-accent-pink">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">OPPORTUNITIES</h2>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-2">
            {opportunities.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
                <Target size={32} strokeWidth={1} />
                <div className="text-center font-bold text-[10px] uppercase tracking-widest">Scanning for gaps...</div>
              </div>
            ) : (
              opportunities.map((opp, i) => (
                <div key={i} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] transition-all relative overflow-hidden group">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg shrink-0 text-accent-cyan bg-accent-cyan/10">
                      <Zap size={14} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[10px] font-black text-white uppercase tracking-tight truncate">
                          {opp.input_symbol}/{opp.output_symbol} ARB
                        </span>
                        <span className="text-[8px] text-text-muted font-mono shrink-0 flex items-center gap-1">
                          <Clock size={8} />
                          {formatTime(opp.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[10px] text-text-secondary leading-none">
                          {opp.best_venue} → {opp.worst_venue}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-[11px] font-black text-accent-green leading-none">
                            +{opp.spread_pct.toFixed(3)}%
                          </div>
                          <button 
                            onClick={() => { setSelectedOpp(opp); setIsModalOpen(true); }}
                            className="px-2 py-1 bg-accent-purple/10 border border-accent-purple/30 rounded-md text-[8px] font-black text-accent-purple hover:bg-accent-purple hover:text-white transition-all uppercase tracking-tighter"
                          >
                            Dry Run
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ArbSimulatorModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        opportunity={selectedOpp} 
      />
    </div>
  )
}
