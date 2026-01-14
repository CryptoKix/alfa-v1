import { useState, useMemo } from 'react'
import { Settings2, Play, Plus, Minus, Layers, Target, ChevronDown, Activity } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

export const GridConfigWidget = () => {
  const { holdings, history } = useAppSelector(state => state.portfolio)
  const prices = useAppSelector(state => state.prices.prices)

  // Asset Selection
  const tokens = useMemo(() => {
    const defaults = [
      { 
        mint: 'So11111111111111111111111111111111111111112', 
        symbol: 'SOL', 
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' 
      },
      { 
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 
        symbol: 'USDC', 
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' 
      },
      { 
        mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 
        symbol: 'USDT', 
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' 
      },
      { 
        mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 
        symbol: 'JUP', 
        logoURI: 'https://static.jup.ag/jup/icon.png' 
      }
    ]
    const combined = [...holdings]
    defaults.forEach(d => {
      if (!combined.find(c => c.mint === d.mint)) {
        combined.push({ ...d, balance: 0, price: 0, value: 0 } as any)
      }
    })
    return combined
  }, [holdings])

  const [inputMint, setInputMint] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') // USDC
  const [outputMint, setOutputMint] = useState('So11111111111111111111111111111111111111112') // SOL
  
  const [isFromOpen, setIsFromOpen] = useState(false)
  const [isToOpen, setIsToOpen] = useState(false)

  const [lowerPrice, setLowerPrice] = useState('')
  const [upperPrice, setUpperPrice] = useState('')
  const [gridCount, setGridCount] = useState('10')
  const [investment, setInvestment] = useState('')
  const [trailingEnabled, setTrailingEnabled] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const fromToken = useMemo(() => tokens.find(t => t.mint === inputMint) || tokens[0], [tokens, inputMint])
  const toToken = useMemo(() => tokens.find(t => t.mint === outputMint) || tokens[0], [tokens, outputMint])

  const currentPrice = useMemo(() => prices[outputMint] || toToken?.price || 0, [prices, outputMint, toToken])
  const steps = parseInt(gridCount) || 0
  const totalInv = parseFloat(investment) || 0
  
  const gridLevels = useMemo(() => {
    if (!lowerPrice || !upperPrice || steps < 2) return []
    const low = parseFloat(lowerPrice)
    const high = parseFloat(upperPrice)
    const diff = (high - low) / (steps - 1)
    
    return Array.from({ length: steps }).map((_, i) => ({
      index: i,
      price: low + (i * diff)
    }))
  }, [lowerPrice, upperPrice, steps])

  const amountPerLevel = steps > 0 ? totalInv / steps : 0
  const spacingPct = (lowerPrice && upperPrice && steps > 1) 
    ? ((parseFloat(upperPrice) - parseFloat(lowerPrice)) / parseFloat(lowerPrice) / (steps - 1) * 100) 
    : 0

  const sellLevels = gridLevels.filter(l => l.price > currentPrice)
  const buyLevels = gridLevels.filter(l => l.price <= currentPrice)
  const totalSellValue = sellLevels.length * amountPerLevel
  const totalBuyValue = buyLevels.length * amountPerLevel

  const hasInsufficientBalance = totalInv > (fromToken.balance || 0)

  const gridTrades = useMemo(() => history.filter(t => t && t.source?.toLowerCase()?.includes('grid')), [history])

  const handleDeploy = async () => {
    if (!investment || !lowerPrice || !upperPrice || !gridCount || hasInsufficientBalance) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/dca/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'GRID',
          inputMint,
          outputMint,
          totalInvestment: totalInv,
          lowerBound: parseFloat(lowerPrice),
          upperBound: parseFloat(upperPrice),
          steps: steps,
          trailingEnabled: trailingEnabled
        })
      })

      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setInvestment('')
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Deployment failed')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg('Network error')
    }
  }

  const adjustAmount = (delta: number) => {
    setInvestment(prev => {
      const val = parseFloat(prev) || 0
      return Math.max(0, val + delta).toString()
    })
  }

  return (
    <div className="flex flex-col lg:flex-row gap-2 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-0">
      
      {/* COLUMN 1: Parameters */}
      <div className="lg:w-[380px] bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 shrink-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-green to-accent-cyan opacity-50" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-green/10 rounded-lg text-accent-green">
              <Settings2 size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">GRID CONFIG</h2>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono font-bold text-accent-green">${currentPrice !== undefined && currentPrice !== null ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00'}</div>
          </div>
        </div>

        <div className="space-y-3 flex-1 overflow-auto custom-scrollbar pr-1 min-h-0">
          {/* Asset Selection */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5 relative">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">Spend Asset</label>
              <button 
                onClick={() => { setIsFromOpen(!isFromOpen); setIsToOpen(false); }}
                className="w-full bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center justify-between hover:bg-white/5 transition-colors h-12"
              >
                <div className="flex items-center gap-2">
                  <img src={fromToken.logoURI} alt="" className="w-4 h-4 rounded-full" onError={(e) => e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png'} />
                  <span className="font-bold text-xs text-white">{fromToken.symbol}</span>
                </div>
                <ChevronDown size={12} className="text-text-muted" />
              </button>
              {isFromOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsFromOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-background-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-1.5 max-h-40 overflow-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                    {tokens.map(t => (
                      <button key={t.mint} onClick={() => { setInputMint(t.mint); setIsFromOpen(false); }} className="w-full flex items-center gap-2 p-1.5 hover:bg-white/5 rounded-lg text-[10px] font-bold text-white transition-colors text-left">
                        <img src={t.logoURI} className="w-3.5 h-3.5 rounded-full" alt="" /> {t.symbol}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="space-y-1.5 relative">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-purple">Trade Asset</label>
              <button 
                onClick={() => { setIsToOpen(!isToOpen); setIsFromOpen(false); }}
                className="w-full bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center justify-between hover:bg-white/5 transition-colors h-12"
              >
                <div className="flex items-center gap-2">
                  <img src={toToken.logoURI} alt="" className="w-4 h-4 rounded-full" onError={(e) => e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png'} />
                  <span className="font-bold text-xs text-white">{toToken.symbol}</span>
                </div>
                <ChevronDown size={12} className="text-text-muted" />
              </button>
              {isToOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsToOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-background-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-1.5 max-h-40 overflow-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                    {tokens.map(t => (
                      <button key={t.mint} onClick={() => { setOutputMint(t.mint); setIsToOpen(false); }} className="w-full flex items-center gap-2 p-1.5 hover:bg-white/5 rounded-lg text-[10px] font-bold text-white transition-colors text-left">
                        <img src={t.logoURI} className="w-3.5 h-3.5 rounded-full" alt="" /> {t.symbol}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Price Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-green">Lower Price</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-green transition-colors h-12">
                <input 
                  type="number" 
                  value={lowerPrice}
                  onChange={(e) => setLowerPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-green">Upper Price</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-green transition-colors h-12">
                <input 
                  type="number" 
                  value={upperPrice}
                  onChange={(e) => setUpperPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5"
                />
              </div>
            </div>
          </div>

          {/* Grid Count */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-end px-1">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold text-accent-green">Grid Levels</label>
              <span className="text-[9px] font-mono text-text-muted">{gridCount} lvls</span>
            </div>
            <div className="bg-background-elevated border border-white/10 rounded-xl p-2 flex items-center gap-3 h-12">
              <button onClick={() => setGridCount(Math.max(2, steps - 1).toString())} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-green transition-colors"><Minus size={14} /></button>
              <input 
                type="range" 
                min="2" 
                max="50" 
                value={gridCount}
                onChange={(e) => setGridCount(e.target.value)}
                className="flex-1 accent-accent-green h-1"
              />
              <button onClick={() => setGridCount(Math.min(50, steps + 1).toString())} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-green transition-colors"><Plus size={14} /></button>
            </div>
          </div>

          {/* Investment & Trailing Toggle */}
          <div className="grid grid-cols-[1fr_120px] gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-green">Investment</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2 flex items-center gap-2 h-12">
                <button onClick={() => adjustAmount(-1)} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-pink transition-colors shrink-0"><Minus size={12} /></button>
                <input 
                  type="number" 
                  value={investment}
                  onChange={(e) => setInvestment(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5 text-center min-w-0"
                />
                <button onClick={() => adjustAmount(1)} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-green transition-colors shrink-0"><Plus size={12} /></button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">Trailing</label>
              <button 
                onClick={() => setTrailingEnabled(!trailingEnabled)}
                className={cn(
                  "w-full h-12 rounded-xl border transition-all flex items-center justify-center gap-2 group",
                  trailingEnabled 
                    ? "bg-accent-cyan/10 border-accent-cyan text-accent-cyan shadow-[0_0_15px_rgba(0,255,255,0.1)]" 
                    : "bg-background-elevated border-white/10 text-text-muted hover:bg-white/5"
                )}
              >
                <Activity size={14} className={cn("transition-transform duration-500", trailingEnabled ? "animate-pulse scale-110" : "opacity-50")} />
                <span className="text-[10px] font-black uppercase tracking-tighter">{trailingEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </div>

        {status === 'error' && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">{errorMsg}</div>}
        {hasInsufficientBalance && totalInv > 0 && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">LOW BALANCE</div>}
        {status === 'success' && <div className="p-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-[8px] text-accent-green font-bold animate-in fade-in text-center uppercase tracking-widest">Bot Deployed</div>}

        <button 
          onClick={handleDeploy}
          disabled={status === 'loading' || !totalInv || !lowerPrice || !upperPrice || hasInsufficientBalance}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-base uppercase tracking-[0.2em] transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-3 shrink-0 group/launch",
            totalInv > 0 && steps > 0 && lowerPrice && upperPrice && status !== 'loading' && !hasInsufficientBalance
              ? "bg-accent-green text-black hover:bg-white shadow-[0_0_30px_rgba(0,255,157,0.2)] hover:shadow-[0_0_50px_rgba(0,255,157,0.4)] border border-accent-green"
              : "bg-white/5 text-white/10 cursor-not-allowed border border-white/5 opacity-50"
          )}
        >
          {status === 'loading' ? (
            <div className="flex items-center gap-2">
              <Activity size={20} className="animate-spin" />
              <span className="animate-pulse text-xs tracking-widest">Deploying Sync...</span>
            </div>
          ) : hasInsufficientBalance && totalInv > 0 ? (
            <span className="text-xs">Balance Critical</span>
          ) : (
            <>
              <Play size={20} fill="currentColor" className="transition-transform group-hover/launch:scale-125" />
              Initialize Grid
            </>
          )}
        </button>
      </div>

      {/* COLUMN 2: Grid Levels Visualization */}
      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan to-accent-purple opacity-50" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">PREVIEW</h2>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono font-bold text-accent-cyan">{spacingPct.toFixed(2)}%</div>
          </div>
        </div>

        {/* Allocation Summary */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-2 flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-text-muted font-bold text-accent-pink">Sell Side</span>
            <div className="text-base font-black font-mono text-white tracking-tight">
              ${totalSellValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-2 flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-text-muted font-bold text-accent-green">Buy Side</span>
            <div className="text-base font-black font-mono text-white tracking-tight">
              ${totalBuyValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-3">
            {gridLevels.length > 0 ? (
              <div className="space-y-1.5">
                {gridLevels.slice().reverse().map((level) => {
                  const isBelowCurrent = currentPrice > level.price
                  return (
                    <div key={level.index} className="flex items-center justify-between p-2 bg-background-elevated/30 border border-white/5 rounded-lg group hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-1 h-6 rounded-full",
                          isBelowCurrent ? "bg-accent-green" : "bg-accent-pink"
                        )} />
                        <div>
                          <div className="text-[8px] text-text-muted font-bold uppercase leading-none mb-0.5">LVL {level.index + 1}</div>
                          <div className="text-xs font-mono font-bold text-white">${level.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className={cn(
                          "text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded border leading-none",
                          isBelowCurrent ? "text-accent-green border-accent-green/20 bg-accent-green/10" : "text-accent-pink border-accent-pink/20 bg-accent-pink/10"
                        )}>
                          {isBelowCurrent ? "Buy" : "Sell"}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
                <Target size={32} strokeWidth={1} />
                <div className="text-center">
                  <div className="font-bold text-[10px] uppercase tracking-widest mb-1">Waiting for Config</div>
                  <div className="text-[9px]">Define price range to visualize</div>
                </div>
              </div>
            )}
          </div>

          {/* Visualization Header */}
          <div className="bg-background-elevated/50 p-3 border-t border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                <span className="text-[9px] text-text-muted font-bold uppercase">Buy</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-pink" />
                <span className="text-[9px] text-text-muted font-bold uppercase">Sell</span>
              </div>
            </div>
            <div className="text-[9px] text-text-secondary italic">
              {steps} levels | ${amountPerLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })} / lvl
            </div>
          </div>
        </div>
      </div>

      {/* COLUMN 3: Real-time Executions */}
      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple to-accent-pink opacity-50" />
        
        <div className="flex items-center justify-between mb-1 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">EXECUTIONS</h2>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-3">
            {gridTrades.length > 0 ? (
              <div className="space-y-1">
                {gridTrades.map(trade => (
                  <div key={trade.id} className="grid grid-cols-[95px_90px_1fr_70px_45px] gap-2 items-end p-2 bg-background-elevated/30 border border-white/5 rounded-lg hover:bg-white/5 transition-all group font-mono whitespace-nowrap overflow-hidden">
                    <div className={cn(
                      "text-[11px] font-black uppercase tracking-tight shrink-0 leading-none transition-colors duration-500",
                      trade.status === 'success' ? "text-accent-green" : "text-text-muted"
                    )}>
                      {(() => {
                        if (!trade.timestamp) return '-'
                        const isoStr = trade.timestamp.replace(' ', 'T') + (trade.timestamp.includes('Z') ? '' : 'Z')
                        const date = new Date(isoStr)
                        if (isNaN(date.getTime())) return '-'
                        const d = date.getDate().toString().padStart(2, '0')
                        const m = (date.getMonth() + 1).toString().padStart(2, '0')
                        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                        return `${m}/${d} ${time}`
                      })()}
                    </div>
                    
                    <div className="flex items-end gap-1 font-black text-[11px] uppercase tracking-tighter shrink-0 leading-none">
                      <span className="text-accent-pink inline-block leading-none">{trade.input}</span>
                      <span className="text-text-muted opacity-30 inline-block leading-none">/</span>
                      <span className="text-accent-cyan inline-block leading-none">{trade.output}</span>
                    </div>

                    <div className="text-[11px] text-white/90 flex items-end gap-1.5 min-w-0 overflow-hidden leading-none">
                      <span className="font-bold shrink-0 leading-none">{trade.amount_in?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {trade.input}</span>
                      <span className="text-text-muted text-[9px] shrink-0 leading-none">→</span>
                      <span className="text-accent-cyan font-black truncate leading-none">{trade.amount_out?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {trade.output}</span>
                    </div>

                    <div className="text-[10px] font-black text-white/60 leading-none shrink-0">
                      {trade.usd_value && (trade.amount_in || trade.amount_out) ? (
                        `${((trade.usd_value / (['USDC', 'USDT'].includes(trade.output) ? trade.amount_in : trade.amount_out)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      ) : '---'}
                    </div>

                    <div className="text-right shrink-0 leading-none">
                      <span className={cn(
                        "uppercase font-black text-[9px] tracking-widest px-1.5 py-0.5 rounded border leading-none inline-block",
                        trade.status === 'success' ? "text-accent-green border-accent-green/20 bg-accent-green/5" : "text-accent-red border-accent-red/20 bg-accent-red/5"
                      )}>
                        {trade.status === 'success' ? 'OK' : 'ERR'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
                <Activity size={32} strokeWidth={1} />
                <div className="text-center">
                  <div className="font-bold text-[10px] uppercase tracking-widest mb-1">No Grid Activity</div>
                  <div className="text-[9px]">Active bot trades will appear here</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
