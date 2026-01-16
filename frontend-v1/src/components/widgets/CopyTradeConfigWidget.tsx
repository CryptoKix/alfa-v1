import { useState, useEffect, useMemo } from 'react'
import { Users, Activity, Zap, Clock, Plus, Trash2 } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { setTargets, setSignals } from '@/features/copytrade/copytradeSlice'
import { addNotification } from '@/features/notifications/notificationsSlice'

export const CopyTradeConfigWidget = () => {
  const dispatch = useAppDispatch()
  const { targets, signals } = useAppSelector(state => state.copytrade)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  
  const selectedTarget = useMemo(() => targets?.find(t => t.address === selectedAddress), [targets, selectedAddress])
  const [editScale, setEditScale] = useState('0.1')
  const [editMax, setEditMax] = useState('1.0')
  const [pumpScale, setPumpScale] = useState('0.05')
  const [pumpMax, setPumpMax] = useState('0.2')
  const [majorScale, setMajorScale] = useState('0.5')
  const [majorMax, setMajorMax] = useState('5.0')
  const [slippage, setSlippage] = useState('1.0')
  const [priorityFee, setPriorityFee] = useState('0.005')
  const [autoExecute, setAutoExecute] = useState(false)

  // Add Target State
  const [isAdding, setIsAdding] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [newAlias, setNewAlias] = useState('')

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  useEffect(() => {
    fetchTargets()
    fetchSignals()
  }, [])

  useEffect(() => {
    if (selectedTarget) {
      const cfg = selectedTarget.config || {}
      setEditScale(cfg.scale_factor?.toString() || '0.1')
      setEditMax(cfg.max_per_trade?.toString() || '1.0')
      setPumpScale(cfg.pump_scale?.toString() || '0.05')
      setPumpMax(cfg.pump_max?.toString() || '0.2')
      setMajorScale(cfg.major_scale?.toString() || '0.5')
      setMajorMax(cfg.major_max?.toString() || '5.0')
      setSlippage(cfg.slippage?.toString() || '1.0')
      setPriorityFee(cfg.priority_fee?.toString() || '0.005')
      setAutoExecute(!!cfg.auto_execute)
    }
  }, [selectedTarget])

  const fetchTargets = async () => {
    try {
      const res = await fetch('/api/copytrade/targets')
      const data = await res.json()
      if (Array.isArray(data)) {
        dispatch(setTargets(data))
        if (data.length > 0 && !selectedAddress) setSelectedAddress(data[0].address)
      }
    } catch (e) {}
  }

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/copytrade/signals')
      const data = await res.json()
      if (Array.isArray(data)) dispatch(setSignals(data))
    } catch (e) {}
  }

  const handleAddTarget = async () => {
    if (!newAddress || !newAlias) return
    try {
      const res = await fetch('/api/copytrade/targets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: newAddress, alias: newAlias })
      })
      if (res.ok) {
        setNewAddress('')
        setNewAlias('')
        setIsAdding(false)
        dispatch(addNotification({ title: 'Whale Added', message: `Now tracking ${newAlias}`, type: 'success' }))
        fetchTargets()
      }
    } catch (e) {}
  }

  const handleDeleteTarget = async (address: string) => {
    if (!confirm('Stop tracking this whale?')) return
    try {
      await fetch('/api/copytrade/targets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      if (selectedAddress === address) setSelectedAddress(null)
      fetchTargets()
    } catch (e) {}
  }

  const handleUpdateConfig = async () => {
    if (!selectedAddress) return
    try {
      await fetch('/api/copytrade/targets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: selectedAddress,
          config: { 
            scale_factor: parseFloat(editScale), 
            max_per_trade: parseFloat(editMax),
            pump_scale: parseFloat(pumpScale),
            pump_max: parseFloat(pumpMax),
            major_scale: parseFloat(majorScale),
            major_max: parseFloat(majorMax),
            slippage: parseFloat(slippage),
            priority_fee: parseFloat(priorityFee),
            auto_execute: autoExecute
          }
        })
      })
      dispatch(addNotification({ title: 'Config Updated', message: 'Parameters saved.', type: 'success' }))
      fetchTargets()
    } catch (e) {}
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-0 overflow-visible">
      {/* TARGETS COLUMN */}
      <div className="lg:w-[380px] bg-background-card border border-accent-pink/30 rounded-lg p-4 shadow-floating relative overflow-hidden flex flex-col gap-4 shrink-0 h-full">
        
        <div className="flex items-center justify-between mb-1 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">TARGETS</h2>
            </div>
          </div>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-accent-cyan transition-colors border border-border"
          >
            <Plus size={16} />
          </button>
        </div>

        {isAdding && (
          <div className="p-3 bg-accent-cyan/5 border border-accent-cyan/20 rounded-md mb-2 space-y-2 animate-in slide-in-from-top-2">
            <div className="space-y-1">
              <label className="text-[8px] uppercase text-accent-cyan font-bold">Wallet Address</label>
              <input 
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Paste Solana address..."
                className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white outline-none focus:border-accent-cyan/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] uppercase text-accent-cyan font-bold">Whale Alias</label>
              <input 
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="e.g. Pump Fun Whale"
                className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white outline-none focus:border-accent-cyan/50"
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAddTarget}
                className="flex-1 py-2 bg-accent-cyan text-black rounded-lg font-black uppercase text-[10px] hover:bg-white transition-all"
              >
                Add Whale
              </button>
              <button 
                onClick={() => setIsAdding(false)}
                className="px-3 py-2 bg-white/5 text-text-muted rounded-lg font-black uppercase text-[10px] hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto custom-scrollbar space-y-2 pr-1">
          {targets?.map(t => (
            <button 
              key={t.address} 
              onClick={() => setSelectedAddress(t.address)} 
              className={cn(
                "w-full p-3 rounded-md text-left border transition-all relative overflow-hidden group",
                selectedAddress === t.address 
                  ? "bg-accent-cyan/10 border-accent-cyan/30 ring-1 ring-accent-cyan/20" 
                  : "bg-white/[0.02] border-border5 hover:bg-white/5 hover:border-border5"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={cn(
                  "text-[10px] font-black uppercase tracking-tight truncate",
                  selectedAddress === t.address ? "text-accent-cyan" : "text-white"
                )}>
                  {t.alias}
                </div>
                <div className="flex items-center gap-2">
                   {t.config?.auto_execute && (
                     <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
                   )}
                   <button 
                     onClick={(e) => { e.stopPropagation(); handleDeleteTarget(t.address); }}
                     className="p-1 text-text-muted hover:text-accent-red transition-colors opacity-0 group-hover:opacity-100"
                   >
                     <Trash2 size={12} />
                   </button>
                </div>
              </div>
              <div className="text-[8px] text-text-muted font-mono truncate">{t.address}</div>
            </button>
          ))}
        </div>
      </div>

      {/* PARAMETERS COLUMN */}
      <div className="flex-1 bg-background-card border border-accent-pink/30 rounded-lg p-4 shadow-floating relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        
        <div className="flex items-center justify-between mb-1 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">PARAMETERS</h2>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-md border border-border overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-2">
            {selectedTarget ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                   <h2 className="text-xs font-black text-white uppercase truncate">{selectedTarget.alias}</h2>
                   <div className="text-[8px] text-text-muted font-mono truncate max-w-[150px]">{selectedTarget.address}</div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Standard Profile */}
                  <div className="p-3 bg-white/5 rounded-md border border-border flex flex-col gap-3">
                    <div className="text-[10px] font-black text-accent-cyan uppercase tracking-wider text-center border-b border-accent-pink/30 pb-2">Standard</div>
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase text-text-muted font-bold block">Scale Factor</label>
                      <input type="number" value={editScale} onChange={(e) => setEditScale(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-cyan/50 outline-none h-9" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase text-text-muted font-bold block">Max SOL</label>
                      <input type="number" value={editMax} onChange={(e) => setEditMax(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-cyan/50 outline-none h-9" />
                    </div>
                  </div>

                  {/* Pump.fun Profile */}
                  <div className="p-3 bg-white/5 rounded-md border border-border flex flex-col gap-3">
                    <div className="text-[10px] font-black text-accent-cyan uppercase tracking-wider text-center border-b border-accent-pink/30 pb-2">Pump.fun</div>
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase text-text-muted font-bold block">Scale Factor</label>
                      <input type="number" value={pumpScale} onChange={(e) => setPumpScale(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-pink/50 outline-none h-9" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase text-text-muted font-bold block">Max SOL</label>
                      <input type="number" value={pumpMax} onChange={(e) => setPumpMax(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-pink/50 outline-none h-9" />
                    </div>
                  </div>

                  {/* Major Profile */}
                  <div className="p-3 bg-white/5 rounded-md border border-border flex flex-col gap-3">
                    <div className="text-[10px] font-black text-accent-cyan uppercase tracking-wider text-center border-b border-accent-pink/30 pb-2">Major</div>
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase text-text-muted font-bold block">Scale Factor</label>
                      <input type="number" value={majorScale} onChange={(e) => setMajorScale(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-purple/50 outline-none h-9" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase text-text-muted font-bold block">Max SOL</label>
                      <input type="number" value={majorMax} onChange={(e) => setMajorMax(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-purple/50 outline-none h-9" />
                    </div>
                  </div>
                </div>

                {/* Execution Safety Section */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                   <div className="p-3 bg-white/5 rounded-md border border-border flex flex-col gap-2">
                      <div className="text-[10px] font-black text-white uppercase tracking-wider text-center border-b border-accent-pink/30 pb-2">Safety Config</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                           <label className="text-[8px] uppercase text-text-muted font-bold block">Slippage (%)</label>
                           <input type="number" value={slippage} onChange={(e) => setSlippage(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-cyan/50 outline-none h-9" />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[8px] uppercase text-text-muted font-bold block">Priority (SOL)</label>
                           <input type="number" value={priorityFee} onChange={(e) => setPriorityFee(e.target.value)} className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-cyan/50 outline-none h-9" />
                        </div>
                      </div>
                   </div>
                   
                   <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between p-3 bg-white/5 rounded-md border border-border h-[50%]">
                        <div className="flex flex-col">
                          <div className="text-[10px] font-black text-white uppercase leading-none">Auto-Execute</div>
                          <div className="text-[8px] text-text-muted mt-1 uppercase tracking-tighter font-bold">Mirror trades</div>
                        </div>
                        <button 
                          onClick={() => setAutoExecute(!autoExecute)}
                          className={cn(
                            "w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out",
                            autoExecute ? "bg-accent-cyan" : "bg-white/10"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full bg-white transition-transform duration-200",
                            autoExecute ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      <button onClick={handleUpdateConfig} className="w-full bg-accent-purple text-white rounded-md font-black uppercase tracking-[0.2em] hover:bg-purple-500 transition-all text-xs shadow-floating active:scale-95 h-[50%]">
                        Save Config
                      </button>
                   </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted italic text-[10px] opacity-50 gap-2">
                <Users size={24} strokeWidth={1} />
                <span>Select a target wallet</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SIGNALS COLUMN */}
      <div className="flex-1 bg-background-card border border-accent-pink/30 rounded-lg p-4 shadow-floating relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        
        <div className="flex items-center justify-between mb-1 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">SIGNALS</h2>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-md border border-border overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-2">
            {signals?.map(s => (
              <div key={s.signature} className="p-3 rounded-md border border-border bg-white/[0.02] transition-all relative overflow-hidden group">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg shrink-0 text-accent-cyan bg-accent-cyan/10">
                    <Zap size={14} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-black text-white uppercase tracking-tight truncate">
                        {s.type || 'SIGNAL'} - {s.alias}
                      </span>
                      <span className="text-[8px] text-text-muted font-mono shrink-0 flex items-center gap-1">
                        <Clock size={8} />
                        {formatTime(s.timestamp)}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">
                      {s.sent && s.received ? (
                        <span className="flex items-center gap-1">
                          Sold {s.sent.amount.toFixed(2)} {s.sent.symbol} → Bought {s.received.amount.toFixed(2)} {s.received.symbol}
                        </span>
                      ) : (
                        `Activity detected for ${s.alias}`
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
