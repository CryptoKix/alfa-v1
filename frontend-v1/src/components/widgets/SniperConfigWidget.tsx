import React, { useEffect, useState } from 'react'
import { Settings, ShieldCheck, Zap, Coins, Flame, Activity, Power, PowerOff } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { updateSniperSettings, setEngineActive } from '@/features/sniper/sniperSlice'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { cn } from '@/lib/utils'

export const SniperConfigWidget: React.FC = () => {
  const dispatch = useAppDispatch()
  const { settings, engineActive } = useAppSelector(state => state.sniper)
  const [isDeploying, setIsDeploying] = useState(false)

  useEffect(() => {
    // Load initial settings and status from backend
    const fetchInitialState = async () => {
      try {
        const [settingsRes, statusRes] = await Promise.all([
          fetch('/api/sniper/settings'),
          fetch('/api/sniper/engine/status')
        ])
        const settingsData = await settingsRes.json()
        const statusData = await statusRes.json()
        
        dispatch(updateSniperSettings(settingsData))
        dispatch(setEngineActive(statusData.isRunning))
      } catch (e) {
        console.error("Failed to fetch initial sniper state", e)
      }
    }
    fetchInitialState()

    // Periodically poll for status to stay in sync
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/sniper/engine/status')
        const data = await res.json()
        dispatch(setEngineActive(data.isRunning))
      } catch (e) {}
    }, 5000)

    return () => clearInterval(interval)
  }, [dispatch])

  const handleToggle = (key: keyof typeof settings) => {
    const newSettings = { ...settings, [key]: !settings[key] }
    dispatch(updateSniperSettings({ [key]: !settings[key] }))
    saveSettings(newSettings)
  }

  const handleInputChange = (key: keyof typeof settings, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue)) {
      const newSettings = { ...settings, [key]: numValue }
      dispatch(updateSniperSettings({ [key]: numValue }))
      saveSettings(newSettings)
    }
  }

  const saveSettings = async (newSettings: any) => {
    try {
      await fetch('/api/sniper/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      })
    } catch (e) {
      console.error("Failed to auto-save sniper settings", e)
    }
  }

  const handleEngineToggle = async (action: 'start' | 'stop') => {
    setIsDeploying(true)
    try {
      // First save current settings
      await fetch('/api/sniper/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })

      // Then toggle engine
      const res = await fetch('/api/sniper/engine/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const data = await res.json()
      
      if (data.success) {
        dispatch(setEngineActive(data.isRunning))
        dispatch(addNotification({
          title: action === 'start' ? 'Engine Active' : 'Engine Offline',
          message: action === 'start' ? 'Sniper Outrider is now scanning the chain.' : 'High-speed discovery has been terminated.',
          type: action === 'start' ? 'success' : 'info'
        }))
      }
    } catch (e) {
      dispatch(addNotification({
        title: 'Command Failed',
        message: 'Could not communicate with the service manager.',
        type: 'error'
      }))
    } finally {
      setIsDeploying(false)
    }
  }

  const handleTestSignal = async () => {
    try {
      await fetch('/api/sniper/test_signal', { method: 'POST' })
    } catch (e) {
      console.error("Failed to send test signal", e)
    }
  }

  return (
    <div className="bg-background-card border border-accent-pink/30 rounded-lg p-4 shadow-floating relative overflow-hidden flex flex-col h-full">
      
      <div className="flex items-center justify-between mb-4 border-b border-accent-pink/30 pb-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-accent-purple" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">Execution Guard</h2>
          <button 
            onClick={handleTestSignal}
            className="ml-2 px-1.5 py-0.5 rounded border border-border bg-white/5 text-[8px] font-black text-text-muted hover:text-accent-purple hover:border-accent-cyan/30 transition-all"
          >
            TEST
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-text-muted uppercase">Auto-Snipe</span>
          <button 
            onClick={() => handleToggle('autoSnipe')}
            className={cn(
              "w-8 h-4 rounded-full p-0.5 transition-colors",
              settings.autoSnipe ? "bg-accent-cyan" : "bg-white/10"
            )}
          >
            <div className={cn(
              "w-3 h-3 rounded-full bg-white transition-transform",
              settings.autoSnipe ? "translate-x-4" : "translate-x-0"
            )} />
          </button>
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar">
        {/* Buy Settings */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold text-accent-purple uppercase tracking-tighter">
            <Zap className="w-3 h-3" />
            <span>Launch Parameters</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/20 border border-border rounded-md p-2">
              <label className="text-[8px] uppercase text-text-muted font-bold block mb-1">Buy Amount (SOL)</label>
              <input 
                type="number" 
                value={settings.buyAmount}
                onChange={(e) => handleInputChange('buyAmount', e.target.value)}
                className="w-full bg-transparent border-none text-xs font-mono text-white outline-none"
                step="0.1"
              />
            </div>
            <div className="bg-black/20 border border-border rounded-md p-2">
              <label className="text-[8px] uppercase text-text-muted font-bold block mb-1">Slippage (%)</label>
              <input 
                type="number" 
                value={settings.slippage}
                onChange={(e) => handleInputChange('slippage', e.target.value)}
                className="w-full bg-transparent border-none text-xs font-mono text-white outline-none"
              />
            </div>
          </div>
        </div>

        {/* Safety Filters */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold text-accent-purple uppercase tracking-tighter">
            <ShieldCheck className="w-3 h-3" />
            <span>Safety Filters</span>
          </div>
          
          <div className="space-y-1.5">
            <div className="bg-black/20 border border-border rounded-md p-2 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-white uppercase leading-none">Min Liquidity</span>
                <span className="text-[7px] text-text-muted uppercase mt-0.5">Filter low depth</span>
              </div>
              <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-border">
                <input 
                  type="number" 
                  value={settings.minLiquidity}
                  onChange={(e) => handleInputChange('minLiquidity', e.target.value)}
                  className="w-8 bg-transparent border-none text-[10px] font-mono text-accent-purple outline-none text-right"
                />
                <span className="text-[8px] font-bold text-text-muted">SOL</span>
              </div>
            </div>

            <button 
              onClick={() => handleToggle('requireMintRenounced')}
              className={cn(
                "w-full p-2 rounded-md border flex items-center justify-between transition-all",
                settings.requireMintRenounced ? "bg-accent-cyan/5 border-accent-cyan/20" : "bg-black/20 border-border"
              )}
            >
              <div className="flex items-center gap-2">
                <Coins className={cn("w-3 h-3", settings.requireMintRenounced ? "text-accent-purple" : "text-text-muted")} />
                <span className="text-[9px] font-bold text-white uppercase">Mint Renounced</span>
              </div>
              <div className={cn("w-1.5 h-1.5 rounded-full", settings.requireMintRenounced ? "bg-accent-cyan shadow-[0_0_5px_#00ffff]" : "bg-white/10")} />
            </button>

            <button 
              onClick={() => handleToggle('requireLPBurned')}
              className={cn(
                "w-full p-2 rounded-md border flex items-center justify-between transition-all",
                settings.requireLPBurned ? "bg-accent-pink/5 border-accent-pink/20" : "bg-black/20 border-border"
              )}
            >
              <div className="flex items-center gap-2">
                <Flame className={cn("w-3 h-3", settings.requireLPBurned ? "text-accent-purple" : "text-text-muted")} />
                <span className="text-[9px] font-bold text-white uppercase">LP Burned/Locked</span>
              </div>
              <div className={cn("w-1.5 h-1.5 rounded-full", settings.requireLPBurned ? "bg-accent-pink shadow-[0_0_5px_#ff0080]" : "bg-white/10")} />
            </button>
          </div>
        </div>

        {/* System Settings */}
        <div className="pt-2">
           <div className="bg-accent-purple/10 border border-accent-cyan/20 rounded-md p-3 text-center">
              <span className="text-[8px] font-black text-accent-purple uppercase tracking-widest block mb-1">Priority Engine</span>
              <div className="flex items-center justify-center gap-2">
                <input 
                  type="number" 
                  value={settings.priorityFee}
                  onChange={(e) => handleInputChange('priorityFee', e.target.value)}
                  className="bg-black/40 border border-border rounded-lg px-2 py-1 text-[10px] font-mono text-white outline-none w-16 text-center"
                  step="0.001"
                />
                <span className="text-[8px] font-bold text-text-muted uppercase">SOL Tip</span>
              </div>
           </div>
        </div>
      </div>
      
      <div className="mt-auto pt-4 shrink-0 flex flex-col gap-2">
         {!engineActive ? (
           <button 
             onClick={() => handleEngineToggle('start')}
             disabled={isDeploying}
             className={cn(
               "w-full py-3 bg-gradient-to-r from-accent-cyan to-accent-purple text-black font-black uppercase tracking-widest text-[10px] rounded-md hover:opacity-90 active:scale-95 transition-all shadow-floating shadow-accent-cyan/10 flex items-center justify-center gap-2",
               isDeploying && "opacity-50 cursor-not-allowed"
             )}
           >
             {isDeploying ? <Activity size={14} className="animate-spin" /> : <Power size={14} />}
             Start Sniper Engine
           </button>
         ) : (
           <button 
             onClick={() => handleEngineToggle('stop')}
             disabled={isDeploying}
             className={cn(
               "w-full py-3 bg-white/5 border border-accent-pink/30 text-accent-purple font-black uppercase tracking-widest text-[10px] rounded-md hover:bg-accent-purple/10 active:scale-95 transition-all flex items-center justify-center gap-2",
               isDeploying && "opacity-50 cursor-not-allowed"
             )}
           >
             {isDeploying ? <Activity size={14} className="animate-spin" /> : <PowerOff size={14} />}
             Stop Sniper Engine
           </button>
         )}
      </div>
    </div>
  )
}
