import { useState, useEffect } from 'react'
import { Activity, Play, Pause, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { useAppDispatch } from '@/app/hooks'
import { botsSocket } from '@/services/socket'

export const WolfPackWidget = () => {
  const dispatch = useAppDispatch()
  const [config, setConfig] = useState<any>({
    enabled: false,
    consensus_threshold: 2,
    time_window: 60,
    buy_amount: 0.1,
    priority_fee: 0.005,
    slippage: 15
  })
  const [consensus, setConsensus] = useState<any[]>([])
  const [attacks, setAttacks] = useState<any[]>([])
  
  useEffect(() => {
    fetchStatus()
    
    const handleUpdate = (data: any) => {
        if (data.config) setConfig(data.config)
        if (data.consensus) setConsensus(data.consensus)
        if (data.attacks) setAttacks(data.attacks)
    }
    
    if (botsSocket) {
        botsSocket.on('wolfpack_update', handleUpdate)
        return () => { botsSocket.off('wolfpack_update', handleUpdate) }
    }
  }, [])

  const fetchStatus = async () => {
    try {
        const res = await fetch('/api/wolfpack/status')
        const data = await res.json()
        if (data.config) setConfig(data.config)
        if (data.consensus) setConsensus(data.consensus)
        if (data.attacks) setAttacks(data.attacks)
    } catch(e) {}
  }

  const updateConfig = async (key: string, value: any) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig) // Optimistic update
    try {
        await fetch('/api/wolfpack/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value })
        })
        dispatch(addNotification({ title: 'Wolf Pack Updated', message: 'Parameters saved', type: 'success' }))
    } catch (e) {}
  }

  return (
    <div className="flex gap-4 h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Config Panel */}
      <div className="w-[320px] bg-background-card border border-accent-pink/30 rounded-lg p-4 shadow-floating relative overflow-hidden flex flex-col gap-4">
        
        <div className="flex items-center justify-between mb-1 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">Wolf Pack Config</h2>
            </div>
          </div>
          <button 
            onClick={() => updateConfig('enabled', !config.enabled)}
            className={cn(
                "p-1.5 rounded-lg transition-all border",
                config.enabled 
                    ? "bg-accent-purple/10 border-accent-green/30 text-accent-purple hover:bg-accent-green/20" 
                    : "bg-white/5 border-border text-text-muted hover:text-white"
            )}
          >
            {config.enabled ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto custom-scrollbar p-1">
            <div className="space-y-2">
                <label className="text-[10px] uppercase text-text-muted font-bold block">Consensus Threshold</label>
                <div className="flex items-center gap-2">
                    <input 
                        type="range" min="2" max="10" step="1" 
                        value={config.consensus_threshold}
                        onChange={(e) => updateConfig('consensus_threshold', parseInt(e.target.value))}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent-pink"
                    />
                    <span className="font-mono font-bold text-accent-purple w-8 text-right">{config.consensus_threshold}</span>
                </div>
                <p className="text-[9px] text-text-secondary">Minimum unique whales buying within window.</p>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] uppercase text-text-muted font-bold block">Time Window (Seconds)</label>
                <input 
                    type="number" 
                    value={config.time_window}
                    onChange={(e) => updateConfig('time_window', parseInt(e.target.value))}
                    className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-pink/50 outline-none"
                />
            </div>

            <div className="space-y-2">
                <label className="text-[10px] uppercase text-text-muted font-bold block">Buy Amount (SOL)</label>
                <input 
                    type="number" 
                    value={config.buy_amount}
                    onChange={(e) => updateConfig('buy_amount', parseFloat(e.target.value))}
                    className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-pink/50 outline-none"
                />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <label className="text-[9px] uppercase text-text-muted font-bold block">Slippage (%)</label>
                    <input 
                        type="number" value={config.slippage}
                        onChange={(e) => updateConfig('slippage', parseFloat(e.target.value))}
                        className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-pink/50 outline-none"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] uppercase text-text-muted font-bold block">Priority (SOL)</label>
                    <input 
                        type="number" value={config.priority_fee}
                        onChange={(e) => updateConfig('priority_fee', parseFloat(e.target.value))}
                        className="w-full bg-black/40 border border-border rounded-lg p-2 text-xs text-white focus:border-accent-pink/50 outline-none"
                    />
                </div>
            </div>
        </div>
      </div>

      {/* Right Column: Feeds */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
          
          {/* Consensus Feed */}
          <div className="flex-1 bg-background-card border border-accent-pink/30 rounded-lg p-4 shadow-floating relative overflow-hidden flex flex-col gap-4 min-h-0">
            
            <div className="flex items-center justify-between mb-1 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
                  <Activity size={18} />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-tight">Consensus Feed</h2>
                </div>
              </div>
              <div className="text-[10px] font-mono text-text-muted">
                {consensus?.length || 0} Active Signals
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar space-y-2 bg-black/20 rounded-md border border-border p-2">
                {consensus?.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-text-muted gap-2 opacity-50">
                        <Zap size={32} strokeWidth={1} />
                        <div className="text-center font-bold text-[10px] uppercase tracking-widest">Waiting for the Pack...</div>
                    </div>
                ) : (
                    consensus?.map((item) => (
                        <div key={item.mint} className="p-3 rounded-md border border-border bg-white/[0.02] flex items-center justify-between group hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-accent-purple/10 text-accent-purple">
                                    <Zap size={16} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-white uppercase">{item.symbol}</span>
                                        <span className="text-[9px] text-text-muted font-mono">{item.mint.slice(0,6)}...</span>
                                    </div>
                                    <div className="text-[10px] text-text-secondary">
                                        {item.count} / {config.consensus_threshold} Whales • {item.wallets.length} Unique
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                {/* Progress Bar */}
                                <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-accent-purple to-accent-pink transition-all duration-500"
                                        style={{ width: `${Math.min(100, (item.count / config.consensus_threshold) * 100)}%` }}
                                    />
                                </div>
                                
                                <span className={cn(
                                    "text-xs font-black uppercase px-2 py-1 rounded",
                                    item.count >= config.consensus_threshold 
                                        ? "bg-accent-green/20 text-accent-purple animate-pulse" 
                                        : "text-text-muted"
                                )}>
                                    {item.count >= config.consensus_threshold ? "ATTACKING" : "FORMING"}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
          </div>

          {/* Attack History */}
          <div className="h-[200px] bg-background-card border border-accent-pink/30 rounded-lg p-4 shadow-floating relative overflow-hidden flex flex-col gap-4 shrink-0">
            
            <div className="flex items-center justify-between mb-1 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
                  <Zap size={18} />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-tight">Recent Attacks</h2>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar bg-black/20 rounded-md border border-border">
                <table className="w-full text-left">
                    <thead className="bg-white/5 text-[9px] uppercase font-bold text-text-muted sticky top-0">
                        <tr>
                            <th className="p-2">Time</th>
                            <th className="p-2">Token</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-[10px] font-mono divide-y divide-white/5">
                        {attacks?.length === 0 ? (
                            <tr><td colSpan={4} className="p-4 text-center text-text-muted italic">No attacks executed yet</td></tr>
                        ) : (
                            attacks?.map((atk, i) => (
                                <tr key={i} className="hover:bg-white/5">
                                    <td className="p-2 text-text-secondary">
                                        {new Date(atk.timestamp * 1000).toLocaleTimeString()}
                                    </td>
                                    <td className="p-2 font-bold text-white">{atk.symbol}</td>
                                    <td className="p-2 text-right text-accent-purple">{atk.amount} SOL</td>
                                    <td className="p-2 text-right">
                                        <span className={cn(
                                            "uppercase text-[9px] font-bold px-1.5 py-0.5 rounded",
                                            atk.status === 'executed' ? "bg-accent-green/20 text-accent-purple" : "bg-accent-red/20 text-accent-red"
                                        )}>
                                            {atk.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          </div>
      </div>
    </div>
  )
}