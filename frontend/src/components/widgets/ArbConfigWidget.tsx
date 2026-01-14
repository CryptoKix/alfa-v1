import { useState, useEffect } from 'react'
import { Activity, Target, Zap, Clock, Settings2, Plus, Trash2, ChevronDown } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { ArbSimulatorModal } from '../modals/ArbSimulatorModal'
import { setArbConfig } from '@/features/arb/arbSlice'

// --- 1. SETTINGS WIDGET (Left Column) ---
export const ArbSettingsWidget = () => {
  const dispatch = useAppDispatch()
  const { holdings } = useAppSelector(state => state.portfolio)
  const { minProfit, jitoTip, autoStrike, isMonitoring } = useAppSelector(state => state.arb)
  
  const [pairs, setPairs] = useState<any[]>([])
  const [isAddingPair, setIsAddingPair] = useState(false)
  const [newInputMint, setNewInputMint] = useState('')
  const [newOutputMint, setNewOutputMint] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const [isInputTokenOpen, setIsInputTokenOpen] = useState(false)
  const [isOutputTokenOpen, setIsOutputTokenOpen] = useState(false)

  const tokens = (holdings || []).length > 0 ? holdings : [
    { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' }
  ]

  const inputToken = tokens.find(t => t.mint === newInputMint)
  const outputToken = tokens.find(t => t.mint === newOutputMint)

  useEffect(() => { fetchPairs() }, [])

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
        body: JSON.stringify({ inputMint: newInputMint, outputMint: newOutputMint, amount: parseFloat(newAmount) })
      })
      if (res.ok) {
        setIsAddingPair(false); fetchPairs()
        dispatch(addNotification({ title: 'Pair Added', message: 'Target updated', type: 'success' }))
      }
    } catch (e) {}
  }

  const handleDeletePair = async (id: number) => {
    try {
      await fetch('/api/arb/pairs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      fetchPairs()
    } catch (e) {}
  }

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

  const TokenItem = ({ token, onClick }: { token: any, onClick: () => void }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group">
      <div className="flex items-center gap-3">
        <img src={token.logoURI} alt={token.symbol} className="w-5 h-5 rounded-full" onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')} />
        <div className="text-[10px] font-bold text-white">{token.symbol}</div>
      </div>
      <div className="text-[9px] font-mono text-text-muted">{token.balance?.toFixed(2)}</div>
    </button>
  )

  return (
    <div className="lg:w-[380px] bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 shrink-0 h-full">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple via-accent-cyan to-accent-pink opacity-50 z-20" />
      
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple"><Settings2 size={18} /></div>
          <h2 className="text-xs font-bold text-white uppercase tracking-tight">ARB CONFIG</h2>
        </div>
        <button onClick={() => setIsAddingPair(!isAddingPair)} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-accent-cyan border border-white/5"><Plus size={16} /></button>
      </div>

      <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-3">
          {isAddingPair && (
            <div className="p-3 bg-accent-purple/5 border border-accent-purple/20 rounded-xl space-y-3 animate-in slide-in-from-top-2">
              <div className="space-y-1.5 relative">
                <label className="text-[8px] uppercase text-text-muted font-bold px-1">Base</label>
                <button onClick={() => setIsInputTokenOpen(!isInputTokenOpen)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 h-9 flex items-center justify-between text-white text-xs font-bold">
                  {inputToken ? inputToken.symbol : 'Select Asset'} <ChevronDown size={12} />
                </button>
                {isInputTokenOpen && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-background-card border border-white/10 rounded-xl shadow-2xl p-1 max-h-40 overflow-auto">
                    {tokens.map(t => <TokenItem key={t.mint} token={t} onClick={() => { setNewInputMint(t.mint); setIsInputTokenOpen(false) }} />)}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 relative">
                <label className="text-[8px] uppercase text-text-muted font-bold px-1">Target</label>
                <button onClick={() => setIsOutputTokenOpen(!isOutputTokenOpen)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 h-9 flex items-center justify-between text-white text-xs font-bold">
                  {outputToken ? outputToken.symbol : 'Select Asset'} <ChevronDown size={12} />
                </button>
                {isOutputTokenOpen && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-background-card border border-white/10 rounded-xl shadow-2xl p-1 max-h-40 overflow-auto">
                    {tokens.map(t => <TokenItem key={t.mint} token={t} onClick={() => { setNewOutputMint(t.mint); setIsOutputTokenOpen(false) }} />)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Amt" type="number" className="bg-black/40 border border-white/10 rounded-lg px-2 h-9 text-xs text-white" />
                <button onClick={handleAddPair} className="bg-accent-cyan text-black rounded-lg font-black uppercase text-[10px] h-9">Add</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[8px] uppercase text-text-muted font-bold">Min Profit (%)</label>
              <input type="number" value={minProfit} onChange={e => dispatch(setArbConfig({ minProfit: parseFloat(e.target.value) }))} className="w-full bg-black/40 border border-white/10 rounded px-2 h-8 text-[10px] text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] uppercase text-text-muted font-bold">Jito Tip</label>
              <input type="number" value={jitoTip} onChange={e => dispatch(setArbConfig({ jitoTip: parseFloat(e.target.value) }))} className="w-full bg-black/40 border border-white/10 rounded px-2 h-8 text-[10px] text-white" />
            </div>
          </div>

          <div className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/10">
            <span className="text-[9px] font-black text-white uppercase">Auto-Strike</span>
            <button onClick={() => dispatch(setArbConfig({ autoStrike: !autoStrike }))} className={cn("w-8 h-4 rounded-full p-0.5 transition-all", autoStrike ? "bg-accent-purple" : "bg-white/10")}>
              <div className={cn("w-3 h-3 rounded-full bg-white transition-all", autoStrike ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <div className="space-y-1 pt-2 border-t border-white/5">
            <div className="text-[8px] text-text-muted font-black uppercase mb-1">Monitored</div>
            {pairs.map(p => (
              <div key={p.id} className="flex items-center justify-between p-1.5 bg-white/[0.02] border border-white/5 rounded-lg group text-[10px]">
                <span className="font-bold text-white">{p.input_symbol}/{p.output_symbol}</span>
                <button onClick={() => handleDeletePair(p.id)} className="text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100"><Trash2 size={10} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button onClick={handleInitialize} disabled={status === 'loading'} className={cn("w-full py-3.5 rounded-2xl text-black font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2", isMonitoring ? "bg-white/5 text-accent-cyan border border-accent-cyan/30" : "bg-accent-cyan shadow-glow-cyan")}>
        {status === 'loading' ? <Activity size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
        Initialize Engine
      </button>
    </div>
  )
}

// --- 2. ANALYSIS WIDGET (Top Right Slot) ---
export const ArbAnalysisWidget = () => {
  const { matrix } = useAppSelector(state => state.arb)
  const venues = ["Raydium", "Orca", "Meteora", "Phoenix"]

  return (
    <div className="bg-black/40 rounded-2xl border border-white/15 h-full flex flex-col relative overflow-hidden shadow-inner p-3">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse shadow-[0_0_8px_#00ffff]" />
          <span className="text-[10px] font-black text-white uppercase tracking-wider">Venue Matrix</span>
        </div>
        <div className="text-[8px] font-mono text-accent-cyan uppercase tracking-widest opacity-60">Live 5s Polling</div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-[60px_repeat(4,1fr)] gap-1 mb-1 px-1">
          <div className="text-[7px] font-black text-text-muted uppercase">Pair</div>
          {venues.map(v => <div key={v} className="text-[7px] font-black text-text-muted uppercase text-center">{v}</div>)}
        </div>

        <div className="space-y-1">
          {Object.entries(matrix).map(([pair, venuePrices]) => {
            const prices = Object.values(venuePrices)
            const minPrice = Math.min(...prices)
            const maxPrice = Math.max(...prices)
            return (
              <div key={pair} className="grid grid-cols-[60px_repeat(4,1fr)] gap-1 h-10 items-stretch">
                <div className="bg-white/5 rounded-lg border border-white/5 px-1.5 flex items-center min-w-0">
                  <span className="text-[8px] font-black text-white uppercase truncate">{pair}</span>
                </div>
                {venues.map(v => {
                  const price = venuePrices[v]
                  const isBest = price === minPrice && minPrice !== maxPrice
                  const isWorst = price === maxPrice && minPrice !== maxPrice
                  return (
                    <div key={v} className={cn("rounded-lg border px-1 flex flex-col items-center justify-center transition-all", isBest ? "bg-accent-green/10 border-accent-green/30" : isWorst ? "bg-accent-red/10 border-accent-red/30" : "bg-white/[0.02] border-white/5")}>
                      <div className={cn("text-[9px] font-mono font-bold", isBest ? "text-accent-green" : isWorst ? "text-accent-red" : "text-white/60")}>
                        {price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- 3. OPPORTUNITIES WIDGET (Right Bottom) ---
export const ArbOpportunitiesWidget = () => {
  const { opportunities } = useAppSelector(state => state.arb)
  const [selectedOpp, setSelectedOpp] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
      
      <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-pink/10 rounded-lg text-accent-pink"><Activity size={18} /></div>
          <h2 className="text-xs font-bold text-white uppercase tracking-tight">OPPORTUNITIES</h2>
        </div>
      </div>

      <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
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

// Backward compat wrapper
export const ArbConfigWidget = () => (
  <div className="flex gap-2 h-full min-h-0">
    <ArbSettingsWidget />
    <ArbOpportunitiesWidget />
  </div>
)