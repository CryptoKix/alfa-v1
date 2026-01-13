import { useState, useEffect, useMemo } from 'react'
import { Users, Activity } from 'lucide-react'
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

  useEffect(() => {
    fetchTargets()
    fetchSignals()
  }, [])

  useEffect(() => {
    if (selectedTarget) {
      setEditScale(selectedTarget.config?.scale_factor?.toString() || '0.1')
      setEditMax(selectedTarget.config?.max_per_trade?.toString() || '1.0')
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

  const handleUpdateConfig = async () => {
    if (!selectedAddress) return
    try {
      await fetch('/api/copytrade/targets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: selectedAddress,
          config: { scale_factor: parseFloat(editScale), max_per_trade: parseFloat(editMax) }
        })
      })
      dispatch(addNotification({ title: 'Config Updated', message: 'Parameters saved.', type: 'success' }))
      fetchTargets()
    } catch (e) {}
  }

  return (
    <div className="flex flex-col lg:flex-row gap-2 h-full min-h-0">
      <div className="lg:w-[300px] bg-background-card border border-white/5 rounded-2xl flex flex-col shrink-0 overflow-hidden shadow-xl h-full relative">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] px-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-none uppercase tracking-tight">TARGETS</h2>
              <span className="text-[8px] text-text-muted uppercase tracking-[0.2em] mt-1 block">Wallets</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-2">
          {targets?.map(t => (
            <button key={t.address} onClick={() => setSelectedAddress(t.address)} className={cn("w-full p-2 rounded-lg text-left text-[10px] border", selectedAddress === t.address ? "bg-accent-cyan/10 border-accent-cyan/30" : "bg-white/5 border-transparent")}>
              <div className="font-bold text-white">{t.alias}</div>
              <div className="text-text-muted truncate">{t.address}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-xl h-full relative">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple to-accent-cyan opacity-50 z-20" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] px-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-none uppercase tracking-tight">PARAMETERS</h2>
              <span className="text-[8px] text-text-muted uppercase tracking-[0.2em] mt-1 block">Config</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar p-6">
          {selectedTarget ? (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-white uppercase">{selectedTarget.alias}</h2>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-[10px] uppercase text-text-muted">Scale Factor</label>
                   <input type="number" value={editScale} onChange={(e) => setEditScale(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] uppercase text-text-muted">Max SOL</label>
                   <input type="number" value={editMax} onChange={(e) => setEditMax(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white" />
                 </div>
              </div>
              <button onClick={handleUpdateConfig} className="w-full py-3 bg-accent-purple text-white rounded-xl font-bold uppercase tracking-widest hover:bg-purple-500 transition-all">Save Config</button>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted italic">Select a target wallet</div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-xl h-full relative">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple to-accent-pink opacity-50 z-20" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] px-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-none uppercase tracking-tight">SIGNALS</h2>
              <span className="text-[8px] text-text-muted uppercase tracking-[0.2em] mt-1 block">Activity</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-2">
          {signals?.map(s => (
            <div key={s.signature} className="p-2 bg-white/5 rounded-lg text-[10px] flex flex-col gap-1">
              <div className="flex justify-between font-bold">
                <span className="text-accent-cyan">SIGNAL</span>
                <span className="text-text-muted">{new Date(s.timestamp * 1000).toLocaleTimeString()}</span>
              </div>
              <div className="truncate text-white/60">{s.signature}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}