import React, { useState, useMemo } from 'react'
import { X, TrendingUp, AlertTriangle, ShieldCheck, Zap, Info, Layers, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoopSimulatorModalProps {
  isOpen: boolean
  onClose: () => void
}

const PROTOCOLS = [
  { id: 'kamino', name: 'Kamino Lend', desc: 'Market Standard', fee: 0.1 },
  { id: 'meteora', name: 'Meteora DLMM', desc: 'Dynamic Yield', fee: 0.03 },
  { id: 'loopscale', name: 'Loopscale', desc: 'Recursive Specialist', fee: 0.05 },
  { id: 'hylo', name: 'HyLo Protocol', desc: 'Yield Multiplier', fee: 0.02 },
]

const ASSETS = [
  { symbol: 'JitoSOL', mint: 'J1tG8ZwypT7hdS2f6fSC66mVSg9Mpx6Z4dxvwoAR39q', supplyApy: 8.4, borrowApy: 0, protocols: ['kamino', 'loopscale', 'meteora'] },
  { symbol: 'mSOL', mint: 'mSoLzYCxHdYgS6M3ToHDbh29VmS3dmjcKQ6PpkYdv6', supplyApy: 7.2, borrowApy: 0, protocols: ['kamino', 'loopscale'] },
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', supplyApy: 6.5, borrowApy: 0.5, protocols: ['kamino', 'loopscale', 'meteora'] },
  { symbol: 'hyUSD', mint: '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E', supplyApy: 11.6, borrowApy: 0, protocols: ['hylo'] },
  { symbol: 'xSOL', mint: 'BdfAtZzhitUCUnYpMTvTMAnZNoZ9ZpqshZ6AFYAnpump', supplyApy: 18.5, borrowApy: 0, protocols: ['hylo'] },
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', supplyApy: 12.5, borrowApy: 14.2, protocols: ['kamino', 'loopscale', 'meteora'] },
]

export const LoopSimulatorModal: React.FC<LoopSimulatorModalProps> = ({ isOpen, onClose }) => {
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0])
  const [selectedProtocol, setSelectedProtocol] = useState(PROTOCOLS[0])
  const [leverage, setLeverage] = useState(3.0)
  const [principal, setPrincipal] = useState('100')
  const [executionMode, setExecutionMode] = useState<'shadow' | 'live'>('shadow')
  const [isDeploying, setIsDeploying] = useState(false)

  // Filter assets based on protocol support or vice versa
  const filteredAssets = useMemo(() => {
    const supported = ASSETS.filter(a => a.protocols.includes(selectedProtocol.id))
    return supported
  }, [selectedProtocol])

  // Safety check for Memo
  const netApy = useMemo(() => {
    try {
      if (!selectedAsset) return 0
      const l = parseFloat(leverage.toString() || '1')

      let baseApy = selectedAsset.supplyApy
      const borrowRate = selectedAsset.symbol.includes('SOL') ? 0.5 : (selectedAsset.borrowApy || 0)

      // Protocol Specific Boosts/Logic
      if (selectedProtocol.id === 'hylo') {
        baseApy += 2.5 // Multi-staking boost
      } else if (selectedProtocol.id === 'meteora') {
        baseApy += 1.8 // Dynamic vault rebalancing alpha
      }

      const leveragedApy = (baseApy * l) - (borrowRate * (l - 1))
      return leveragedApy
    } catch {
      return 0
    }
  }, [selectedAsset, selectedProtocol, leverage])

  if (!isOpen) return null

  const handleExecute = async () => {
    console.log('INITIALIZING STRATEGY:', {
      protocol: selectedProtocol.name,
      symbol: selectedAsset?.symbol,
      amount: principal,
      leverage: leverage,
      mode: executionMode
    })
    setIsDeploying(true)
    try {
      const payload = {
        protocol: selectedProtocol.name,
        strategy: selectedProtocol.id === 'meteora' ? 'Dynamic Vault' : (leverage > 1.1 ? 'Recursive Loop' : 'Direct Supply'),
        mint: selectedAsset?.mint || 'So11111111111111111111111111111111111111112',
        symbol: selectedAsset?.symbol || 'SOL',
        amount: Number(parseFloat(principal || '0')),
        leverage: Number(leverage),
        apy: Number(netApy),
        live: executionMode === 'live',
        details: {
          protocol_id: selectedProtocol.id,
          base_apy: selectedAsset?.supplyApy || 0
        }
      }
      console.log('SENDING PAYLOAD:', payload)

      const res = await fetch('/api/lending/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      console.log('SERVER RESPONSE STATUS:', res.status)
      const data = await res.json()
      console.log('SERVER DATA:', data)

      if (data.success) {
        console.log('DEPLOYMENT SUCCESS')
        onClose()
      } else {
        console.error('DEPLOYMENT FAILED:', data.error)
      }
    } catch (e) {
      console.error("API FATAL ERROR:", e)
    } finally {
      setIsDeploying(false)
    }
  }

  const currentLtv = leverage > 0 ? ((leverage - 1) / leverage) * 100 : 0
  const riskLevel = currentLtv > 80 ? 'CRITICAL' : currentLtv > 70 ? 'HIGH' : 'LOW'

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-background-card border border-accent-cyan/20 rounded-3xl w-full max-w-4xl relative overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className={cn(
          "absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r z-20",
          executionMode === 'live' ? "from-accent-pink/80 via-accent-pink/40 to-transparent" : "from-accent-cyan/80 via-accent-cyan/40 to-transparent"
        )} />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-accent-cyan/10">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-xl border shadow-[0_0_15px_rgba(0,255,255,0.1)]",
              executionMode === 'live' ? "bg-accent-pink/10 text-accent-pink border-accent-pink/20" : "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20"
            )}>
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Strategy Lab</h2>
              <p className={cn(
                "text-[10px] uppercase tracking-widest font-bold",
                executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan"
              )}>Multi-Route Loop Simulation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-text-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* Config */}
          <div className="w-full lg:w-80 border-r border-accent-cyan/10 p-6 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="space-y-5">
              {/* Execution Mode */}
              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Execution Mode</label>
                <div className="flex bg-black/20 rounded-xl p-1 border border-white/5 gap-1">
                  <button
                    onClick={() => setExecutionMode('shadow')}
                    className={cn(
                      "flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                      executionMode === 'shadow' ? "bg-accent-cyan text-black" : "text-text-muted hover:text-white"
                    )}
                  >
                    Shadow
                  </button>
                  <button
                    onClick={() => setExecutionMode('live')}
                    className={cn(
                      "flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                      executionMode === 'live' ? "bg-accent-pink text-black" : "text-text-muted hover:text-white"
                    )}
                  >
                    Live
                  </button>
                </div>
              </div>

              {/* Protocol Selector */}
              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Routing Protocol</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {PROTOCOLS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProtocol(p)
                        const supported = ASSETS.find(a => a.protocols.includes(p.id))
                        if (supported) setSelectedAsset(supported)
                      }}
                      className={cn(
                        "flex flex-col p-2.5 rounded-xl border transition-all text-left",
                        selectedProtocol.id === p.id
                          ? (executionMode === 'live' ? "bg-accent-pink/10 border-accent-pink/40" : "bg-accent-cyan/10 border-accent-cyan/40")
                          : "bg-white/5 border-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="flex justify-between items-center mb-0.5">
                        <span className={cn("text-[10px] font-black uppercase", selectedProtocol.id === p.id ? (executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan") : "text-white")}>{p.name}</span>
                        {selectedProtocol.id === p.id && <div className={cn("w-1 h-1 rounded-full animate-pulse", executionMode === 'live' ? "bg-accent-pink" : "bg-accent-cyan")} />}
                      </div>
                      <span className="text-[8px] text-text-muted font-bold uppercase">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Asset Selector */}
              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Asset Allocation</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {filteredAssets.map(asset => (
                    <button
                      key={asset.symbol}
                      onClick={() => setSelectedAsset(asset)}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-xl border transition-all text-[10px] font-bold",
                        selectedAsset?.symbol === asset.symbol
                          ? (executionMode === 'live' ? "bg-accent-pink/10 border-accent-pink/40 text-accent-pink" : "bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan")
                          : "bg-white/5 border-white/5 text-text-muted hover:text-white"
                      )}
                    >
                      <span>{asset.symbol}</span>
                      <span className="text-[8px] font-mono opacity-50">{asset.supplyApy}%</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-white/5">
                <div className="flex justify-between px-1">
                  <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold">{selectedProtocol.id === 'meteora' ? 'Liquidity Multiplier' : 'Recursive Leverage'}</label>
                  <span className={cn("text-[10px] font-black", executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan")}>{leverage.toFixed(1)}x</span>
                </div>
                <input
                  type="range" min="1.1" max={selectedProtocol.id === 'loopscale' ? "10.0" : "5.0"} step="0.1"
                  value={leverage}
                  onChange={(e) => setLeverage(parseFloat(e.target.value))}
                  className={cn(
                    "w-full h-1.5 bg-white/10 rounded-lg cursor-pointer",
                    executionMode === 'live' ? "accent-accent-pink" : "accent-accent-cyan"
                  )}
                />
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Initial Principal</label>
                <div className="relative">
                  <input
                    type="number" value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    className={cn(
                      "w-full bg-background-elevated border rounded-xl p-3 text-sm font-mono font-bold text-white focus:outline-none",
                      executionMode === 'live' ? "border-accent-pink/20 focus:border-accent-pink" : "border-accent-cyan/20 focus:border-accent-cyan"
                    )}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-muted uppercase">
                    {selectedAsset?.symbol || 'SOL'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 bg-black/20 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 gap-4">
               <div className={cn("bg-background-card border rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1", executionMode === 'live' ? "border-accent-pink/10" : "border-accent-cyan/10")}>
                  <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Net APY</span>
                  <div className={cn("text-3xl font-black font-mono tracking-tighter", executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan")}>
                    {netApy.toFixed(2)}%
                  </div>
                  <div className={cn("text-[10px] font-bold uppercase", executionMode === 'live' ? "text-accent-pink/50" : "text-accent-cyan/50")}>Strategy Yield</div>
               </div>
               <div className={cn("bg-background-card border rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1", executionMode === 'live' ? "border-accent-pink/10" : "border-accent-cyan/10")}>
                  <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Est. ROI (Year)</span>
                  <div className="text-3xl font-black text-white font-mono tracking-tighter">
                    ${((parseFloat(principal || '0')) * (netApy / 100)).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">USD Projection</div>
               </div>
            </div>

            <div className={cn("bg-background-card border rounded-2xl p-5 space-y-4", executionMode === 'live' ? "border-accent-pink/10" : "border-accent-cyan/10")}>
               <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                    <Info size={12} className={executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan"} />
                    Strategy Path: {selectedProtocol.name}
                  </h3>
                  <div className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 border rounded-full",
                    executionMode === 'live' ? "bg-accent-pink/10 border-accent-pink/30" : "bg-accent-cyan/10 border-accent-cyan/30"
                  )}>
                    <Layers size={10} className={executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan"} />
                    <span className={cn("text-[8px] font-black uppercase tracking-widest", executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan")}>Automated Routing</span>
                  </div>
               </div>

               {/* New Strategy Path Visualization */}
               <div className="space-y-3 pt-1">
                  {[
                    {
                      step: '01',
                      label: selectedProtocol.id === 'meteora' ? 'Dynamic Supply' : 'Supply Collateral',
                      protocol: selectedProtocol.name,
                      detail: `Deposit ${principal} ${selectedAsset?.symbol} into ${selectedProtocol.id} ${selectedProtocol.id === 'meteora' ? 'optimized vault' : 'main vault'}`
                    },
                    {
                      step: '02',
                      label: selectedProtocol.id === 'meteora' ? 'Rebalance Logic' : 'Borrow Liquidity',
                      protocol: selectedProtocol.name,
                      detail: selectedProtocol.id === 'meteora' ? `Auto-allocation across ${selectedAsset?.symbol} high-yield liquidity pools` : `Recursive borrow ${selectedAsset?.symbol.includes('USD') ? 'USDC' : 'SOL'} at ${(leverage - 1).toFixed(1)}x multiplier`
                    },
                    {
                      step: '03',
                      label: 'Atomic Swap',
                      protocol: 'Jupiter V6',
                      detail: `Convert borrow to ${selectedAsset?.symbol} with < ${selectedProtocol.fee}% slippage`
                    },
                    {
                      step: '04',
                      label: 'Target Yield',
                      protocol: 'Tactix Engine',
                      detail: `Final position: ${(parseFloat(principal || '0') * leverage).toFixed(2)} ${selectedAsset?.symbol} @ ${netApy.toFixed(1)}% APY`
                    },
                  ].map((path, i) => (
                    <div key={i} className="flex items-center gap-4 group/path relative">
                      {i < 3 && <div className={cn("absolute left-3 top-6 w-px h-4", executionMode === 'live' ? "bg-accent-pink/20" : "bg-accent-cyan/20")} />}
                      <div className={cn(
                        "w-6 h-6 rounded-lg bg-black border flex items-center justify-center text-[10px] font-black shrink-0 group-hover/path:border-accent-cyan/50 transition-colors z-10",
                        executionMode === 'live' ? "border-accent-pink/20 text-accent-pink" : "border-accent-cyan/20 text-accent-cyan"
                      )}>
                        {path.step}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[10px] font-black text-white uppercase tracking-tight">{path.label}</span>
                          <span className={cn("text-[8px] font-bold uppercase tracking-widest opacity-60", executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan")}>{path.protocol}</span>
                        </div>
                        <p className="text-[9px] text-text-muted leading-none">{path.detail}</p>
                      </div>
                    </div>
                  ))}
               </div>

               <div className={cn(
                 "mt-4 p-3 rounded-xl border flex items-start gap-3",
                 riskLevel === 'CRITICAL' ? "bg-accent-pink/10 border-accent-pink/20" : (executionMode === 'live' ? "bg-accent-pink/5 border-accent-pink/10" : "bg-accent-cyan/5 border-accent-cyan/10")
               )}>
                  {riskLevel === 'CRITICAL' ? <AlertTriangle className="text-accent-pink shrink-0" size={16} /> : <ShieldCheck className={cn("shrink-0", executionMode === 'live' ? "text-accent-pink" : "text-accent-cyan")} size={16} />}
                  <div className="flex-1 text-[9px] leading-tight">
                    <div className={cn("font-black uppercase mb-0.5", riskLevel === 'CRITICAL' ? 'text-accent-pink' : (executionMode === 'live' ? 'text-accent-pink' : 'text-accent-cyan'))}>
                      Risk Rating: {riskLevel}
                    </div>
                    <p className="text-text-secondary">
                      {riskLevel === 'CRITICAL'
                        ? 'Liquidation risk critical. High-leverage recursive loops are sensitive to small price drops.'
                        : (executionMode === 'live' ? 'LIVE ON-CHAIN SETTLEMENT ENABLED. Funds will be moved to protocol vaults.' : `Conservative ${selectedProtocol.name} strategy within safe collateral limits.`)}
                    </p>
                  </div>
               </div>
            </div>

            <button
              onClick={handleExecute}
              disabled={isDeploying || !principal || parseFloat(principal) <= 0}
              className={cn(
                "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(0,255,255,0.2)] hover:bg-white transition-all flex items-center justify-center gap-3 mt-auto active:scale-95",
                executionMode === 'live'
                  ? "bg-accent-pink text-black shadow-[0_0_30px_rgba(255,0,255,0.2)]"
                  : "bg-accent-cyan text-black shadow-[0_0_30px_rgba(0,255,255,0.2)]",
                (isDeploying || !principal || parseFloat(principal) <= 0) && "opacity-50 cursor-not-allowed"
              )}
            >
              {isDeploying ? (
                <>
                  <Activity size={20} className="animate-spin" />
                  Broadcasting...
                </>
              ) : (
                <>
                  <Zap size={20} fill="currentColor" />
                  {executionMode === 'live' ? 'Execute Live Settlement' : 'Initialize Multi-Route Strategy'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
