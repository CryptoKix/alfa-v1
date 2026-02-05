import { useState, useMemo, useEffect, useRef } from 'react'
import { Settings2, Play, Plus, Minus, Layers, Target, ChevronDown, Activity, X } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { setMonitorBotId } from '@/features/bots/botsSlice'

export const GridConfigWidget = () => {
  const dispatch = useAppDispatch()
  const { holdings, history } = useAppSelector(state => state.portfolio)
  const { bots, monitorBotId } = useAppSelector(state => state.bots)
  const prices = useAppSelector(state => state.prices.prices)
  const { mode: walletMode, browserWalletAddress, sessionKeyActive } = useAppSelector(state => state.wallet)

  // Find the bot being monitored - only if it is still active
  const activeBot = useMemo(() => 
    bots.find(b => b.id === monitorBotId && b.status === 'active'),
    [bots, monitorBotId]
  )

  const [knownTokens, setKnownTokens] = useState<any[]>([])

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const res = await fetch('/api/tokens')
        if (res.ok) {
          const data = await res.json()
          setKnownTokens(data)
        }
      } catch (e) {
        console.error("Failed to fetch tokens", e)
      }
    }
    fetchTokens()
  }, [])

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
    
    // Start with holdings
    const combined = [...holdings]
    
    // Add defaults if missing
    defaults.forEach(d => {
      if (!combined.find(c => c.mint === d.mint)) {
        combined.push({ ...d, balance: 0, price: 0, value: 0 } as any)
      }
    })

    // Add known tokens from DB if missing
    knownTokens.forEach(k => {
      if (!combined.find(c => c.mint === k.mint)) {
        combined.push({ ...k, balance: 0, price: 0, value: 0 } as any)
      }
    })
    
    return combined
  }, [holdings, knownTokens])

  const [inputMint, setInputMint] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') // USDC
  const [outputMint, setOutputMint] = useState('So11111111111111111111111111111111111111112') // SOL
  
  const [isFromOpen, setIsFromOpen] = useState(false)
  const [isToOpen, setIsToOpen] = useState(false)

  const [lowerPrice, setLowerPrice] = useState('')
  const [upperPrice, setUpperPrice] = useState('')
  const [gridCount, setGridCount] = useState('10')
  const [investment, setInvestment] = useState('')
  const [alias, setAlias] = useState('')
  const [trailingEnabled, setTrailingEnabled] = useState(false)
  const [hysteresis, setHysteresis] = useState('0.1')
  const [gridMode, setGridMode] = useState<'market' | 'limit'>('market')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const fromToken = useMemo(() => tokens.find(t => t.mint === inputMint) || tokens[0], [tokens, inputMint])
  const toToken = useMemo(() => tokens.find(t => t.mint === outputMint) || tokens[0], [tokens, outputMint])

  const currentPrice = useMemo(() => prices[outputMint] || toToken?.price || 0, [prices, outputMint, toToken])
  
  const [priceColor, setPriceColor] = useState('text-accent-cyan')
  const prevPriceRef = useRef<number>(currentPrice)

  useEffect(() => {
    if (currentPrice > prevPriceRef.current) {
      setPriceColor('text-accent-cyan')
    } else if (currentPrice < prevPriceRef.current) {
      setPriceColor('text-accent-pink')
    }
    prevPriceRef.current = currentPrice
  }, [currentPrice])

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
  const totalBuyValue = buyLevels.length * amountPerLevel
  
  // Calculate Token Amounts for display
  const totalSellTokenAmount = sellLevels.reduce((acc, lvl) => acc + (amountPerLevel / lvl.price), 0)
  const activeBotSellTokenAmount = activeBot?.grid_levels?.filter(l => l.has_position).reduce((acc, l) => acc + (l.token_amount || 0), 0) || 0

  // DEBUG LOGGING
  useEffect(() => {
    console.log("DEBUG GRID:", {
        outputMint,
        toTokenSymbol: toToken?.symbol,
        currentPrice,
        priceFromRedux: prices[outputMint],
        priceFromToken: toToken?.price,
        sellLevelsCount: sellLevels.length,
        buyLevelsCount: buyLevels.length
    })
  }, [outputMint, toToken, currentPrice, prices, sellLevels, buyLevels])

  const hasInsufficientBalance = totalInv > (fromToken.balance || 0)

  const gridTrades = useMemo(() => history.filter(t => t && t.source?.toLowerCase()?.includes('grid')), [history])

  const handleDeploy = async () => {
    const debugInfo = { investment, lowerPrice, upperPrice, gridCount, hasInsufficientBalance, totalInv, fromTokenBalance: fromToken.balance }
    console.log('handleDeploy called:', debugInfo)

    if (!investment || !lowerPrice || !upperPrice || !gridCount || hasInsufficientBalance) {
      const missing = []
      if (!investment) missing.push('investment')
      if (!lowerPrice) missing.push('lowerPrice')
      if (!upperPrice) missing.push('upperPrice')
      if (!gridCount) missing.push('gridCount')
      if (hasInsufficientBalance) missing.push('hasInsufficientBalance=true')
      alert(`Cannot deploy - missing/invalid: ${missing.join(', ')}\n\nDebug: ${JSON.stringify(debugInfo, null, 2)}`)
      return
    }
    setStatus('loading')
    setErrorMsg('')

    try {
      // Include userWallet if in browser mode with session key delegation
      const userWallet = (walletMode === 'browser' && sessionKeyActive && browserWalletAddress)
        ? browserWalletAddress
        : undefined

      const res = await fetch('/api/dca/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: gridMode === 'market' ? 'GRID' : 'LIMIT_GRID',
          alias: alias || undefined,
          inputMint,
          outputMint,
          totalInvestment: totalInv,
          lowerBound: parseFloat(lowerPrice),
          upperBound: parseFloat(upperPrice),
          steps: steps,
          trailingEnabled: trailingEnabled,
          hysteresisPct: parseFloat(hysteresis),
          userWallet
        })
      })

      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setInvestment('')
        setAlias('')
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
            <div className={cn("text-xs font-mono font-bold transition-colors duration-300", priceColor)}>
              ${currentPrice !== undefined && currentPrice !== null ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
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

          {/* Strategy Alias */}
          <div className="space-y-1.5">
            <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">Strategy Alias</label>
            <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-cyan transition-colors h-12">
              <input 
                type="text" 
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. SOL Trend Rider"
                className="bg-transparent text-sm font-bold text-white w-full focus:outline-none placeholder:text-white/10"
              />
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

          {/* Mode Toggle */}
          <div className="space-y-1.5">
            <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">Execution Mode</label>
            <div className="flex bg-black/20 rounded-xl p-1 border border-white/5 gap-1 h-12">
              <button
                onClick={() => setGridMode('market')}
                className={cn(
                  "flex-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                  gridMode === 'market' ? "bg-accent-cyan text-black shadow-glow-cyan" : "text-text-muted hover:text-white"
                )}
              >
                Market (HFA)
              </button>
              <button
                onClick={() => setGridMode('limit')}
                className={cn(
                  "flex-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                  gridMode === 'limit' ? "bg-accent-purple text-white shadow-glow-purple" : "text-text-muted hover:text-white"
                )}
              >
                Limit (On-Chain)
              </button>
            </div>
          </div>

          {/* Grid Count */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-end px-1">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold text-accent-green">Grid Levels</label>
              <span className="text-[9px] font-mono text-text-muted">{gridCount || '0'} lvls</span>
            </div>
            <div className="bg-background-elevated border border-white/10 rounded-xl p-2 flex items-center gap-2 h-12">
              <button onClick={() => setGridCount(prev => String(Math.max(0, (parseInt(prev) || 0) - 1)))} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-green transition-colors shrink-0"><Minus size={14} /></button>
              <input
                type="text"
                inputMode="numeric"
                value={gridCount}
                onChange={(e) => setGridCount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="10"
                className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5 text-center min-w-0"
              />
              <button onClick={() => setGridCount(prev => String((parseInt(prev) || 0) + 1))} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-green transition-colors shrink-0"><Plus size={14} /></button>
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

          {/* Hysteresis Setting */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-end px-1">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold text-accent-pink">Price Hysteresis (%)</label>
              <span className="text-[9px] font-mono text-text-muted">{hysteresis}%</span>
            </div>
            <div className="bg-background-elevated border border-white/10 rounded-xl p-2 flex items-center gap-3 h-12">
              <button onClick={() => setHysteresis(prev => Math.max(0, parseFloat(prev) - 0.05).toFixed(2))} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-pink transition-colors"><Minus size={14} /></button>
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="0.01"
                value={hysteresis}
                onChange={(e) => setHysteresis(e.target.value)}
                className="flex-1 accent-accent-pink h-1"
              />
              <button onClick={() => setHysteresis(prev => Math.min(2, parseFloat(prev) + 0.05).toFixed(2))} className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-pink transition-colors"><Plus size={14} /></button>
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
        
        <div className="flex items-center justify-between border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-1.5 rounded-lg",
              activeBot ? "bg-accent-cyan/20 text-accent-cyan animate-pulse" : "bg-accent-cyan/10 text-accent-cyan"
            )}>
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight flex items-center gap-2">
                {activeBot ? (
                  <>
                    <span className="text-accent-cyan">MONITORING</span>
                    <span className="text-white/40">/</span>
                    <span>{activeBot.alias || activeBot.id}</span>
                    <div className="ml-2 flex items-center gap-1.5 px-2 py-0.5 bg-accent-cyan/10 border border-accent-cyan/30 rounded-full">
                      <div className="w-1 h-1 rounded-full bg-accent-cyan animate-ping" />
                      <span className="text-[7px] font-black text-accent-cyan uppercase tracking-widest">Live Stream</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span>PREVIEW</span>
                    {alias && (
                      <>
                        <span className="text-white/40">/</span>
                        <span className="text-accent-cyan">{alias}</span>
                      </>
                    )}
                  </>
                )}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeBot && (
              <button 
                onClick={() => dispatch(setMonitorBotId(null))}
                className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-pink transition-all"
                title="Exit Monitor Mode"
              >
                <X size={14} />
              </button>
            )}
            <div className="text-xs font-mono font-bold text-accent-cyan">{spacingPct.toFixed(2)}%</div>
          </div>
        </div>

        {/* Allocation Summary */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-2 flex flex-col gap-0.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-accent-pink/10 text-accent-pink text-[8px] font-black border-b border-l border-accent-pink/20 rounded-bl-lg">
              {activeBot ? activeBot.grid_levels?.filter(l => l.has_position).length : sellLevels.length} STEPS
            </div>
            <span className="text-[8px] uppercase tracking-widest text-text-muted font-bold text-accent-pink">Sell Side</span>
            <div className="text-base font-black font-mono text-white tracking-tight">
              {activeBot ? (
                 <span>{activeBotSellTokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-xs text-text-muted">{activeBot.output_symbol || toToken.symbol}</span></span>
              ) : (
                 <span>{totalSellTokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-xs text-text-muted">{toToken.symbol}</span></span>
              )}
            </div>
          </div>
          <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-2 flex flex-col gap-0.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-accent-green/10 text-accent-green text-[8px] font-black border-b border-l border-accent-green/20 rounded-bl-lg">
              {activeBot ? activeBot.grid_levels?.filter(l => !l.has_position).length : buyLevels.length} STEPS
            </div>
            <span className="text-[8px] uppercase tracking-widest text-text-muted font-bold text-accent-green">Buy Side</span>
            <div className="text-base font-black font-mono text-white tracking-tight">
              ${activeBot ? ((activeBot.grid_levels?.filter(l => !l.has_position).length || 0) * (activeBot.amount_per_level || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : totalBuyValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0 relative">
          <div className="flex-1 overflow-auto custom-scrollbar p-3">
            {(() => {
              const currentLevels = (activeBot ? activeBot.grid_levels : gridLevels) || []
              if (currentLevels.length === 0) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
                    <Target size={32} strokeWidth={1} />
                    <div className="text-center">
                      <div className="font-bold text-[10px] uppercase tracking-widest mb-1">Waiting for Config</div>
                      <div className="text-[9px]">Define price range to visualize</div>
                    </div>
                  </div>
                )
              }

              return (
                <div className="space-y-1.5">
                  {[...currentLevels].reverse().map((level: any, idx) => {
                    const isBelowCurrent = activeBot ? !level.has_position : (currentPrice > level.price)
                    const displayPrice = level.price
                    
                    return (
                      <div key={idx} className={cn(
                        "flex items-center justify-between p-2 rounded-lg transition-all duration-500 font-mono border",
                        isBelowCurrent 
                          ? "bg-accent-cyan/[0.03] border-accent-cyan/10" 
                          : "bg-accent-pink/[0.03] border-accent-pink/10",
                        "group hover:bg-white/5"
                      )}>
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-1 h-8 rounded-full transition-all duration-1000 shrink-0",
                            isBelowCurrent 
                              ? "bg-accent-cyan shadow-[0_0_8px_rgba(0,255,255,0.5)]" 
                              : "bg-accent-pink shadow-[0_0_8px_rgba(255,0,128,0.5)]"
                          )} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[8px] font-black uppercase leading-none mb-1.5 flex items-center gap-2">
                              <span className="text-white/80 tracking-[0.2em] w-20 shrink-0">INTERVAL {currentLevels.length - idx}</span>
                            </div>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center text-[10px] leading-none">
                              <div className="flex items-center justify-end gap-2 pr-4">
                                <span className={cn("font-bold text-[10px] uppercase tracking-tighter whitespace-nowrap", isBelowCurrent ? "text-accent-cyan" : "text-white/20")}>Buy Floor:</span>
                                <span className="text-white/40 font-bold">${(idx < currentLevels.length - 1 ? (currentLevels as any)[currentLevels.length - 2 - idx].price : displayPrice - (displayPrice * 0.01)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <span className="text-white/10">|</span>
                              <div className="flex items-center justify-start gap-2 pl-4">
                                <span className={cn("font-bold text-[10px] uppercase tracking-tighter whitespace-nowrap", !isBelowCurrent ? "text-accent-pink" : "text-white/20")}>Sell Ceiling:</span>
                                <span className="text-white font-black">${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border leading-none",
                            isBelowCurrent 
                              ? "text-accent-cyan border-accent-cyan/20 bg-accent-cyan/10" 
                              : "text-accent-pink border-accent-pink/20 bg-accent-pink/10"
                          )}>
                            {activeBot ? (level.has_position ? "Sell Target" : "Buy Trigger") : (isBelowCurrent ? "Buy" : "Sell")}
                          </div>
                          
                          {/* Step Amount Display */}
                          <div className="text-[8px] font-bold text-text-secondary mt-1 font-mono">
                            {activeBot ? (
                                level.has_position 
                                    ? `${Number(level.token_amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${activeBot.output_symbol}`
                                    : (() => {
                                        // Use cost_usd, or explicitly calculate from total investment
                                        const cost = Number(level.cost_usd)
                                        if (cost > 0) return `$${cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                        
                                        // Fallback to config calculation
                                        // Some bots use 'amount_per_level', others we calculate
                                        if (activeBot.amount_per_level) return `$${Number(activeBot.amount_per_level).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                        
                                        const botInv = Number(activeBot.totalInvestment || activeBot.investment || 0)
                                        const botSteps = Number(activeBot.steps || activeBot.grid_count || 1)
                                        const fallback = botSteps > 1 ? botInv / (botSteps - 1) : botInv
                                        return `$${fallback.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                      })()
                            ) : (
                                isBelowCurrent 
                                    ? `$${amountPerLevel.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `${(amountPerLevel / level.price).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${toToken.symbol}`
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Visualization Header */}
          <div className="bg-background-elevated/50 p-3 border-t border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />
                <span className="text-[9px] text-text-muted font-bold uppercase">Buy</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-pink" />
                <span className="text-[9px] text-text-muted font-bold uppercase">Sell</span>
              </div>
            </div>
            <div className="text-[9px] text-text-secondary italic">
              {steps} levels | ${amountPerLevel.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / lvl
            </div>
          </div>
        </div>
      </div>

      {/* COLUMN 3: Real-time Executions */}
      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple to-accent-pink opacity-50" />
        
        <div className="flex items-center justify-between border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
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
          <div className="flex-1 overflow-auto custom-scrollbar">
            {/* Sticky Header - Strict vertical left alignment */}
            <div className="grid grid-cols-[90px_50px_1fr_1fr_80px_60px] gap-4 px-4 py-3 text-[8px] font-black text-text-muted uppercase tracking-widest shrink-0 border-b border-white/5 bg-background-card sticky top-0 z-10">
              <div className="text-left">Time</div>
              <div className="text-left">Type</div>
              <div className="text-left">From</div>
              <div className="text-left">To</div>
              <div className="text-left">Price</div>
              <div className="text-left">Status</div>
            </div>

            <div className="py-2 space-y-1">
              {gridTrades.length > 0 ? (
                gridTrades.map(trade => {
                  const isSuccess = trade.status === 'success'
                  const isOutputStable = ['USDC', 'USDT', 'USD'].includes(trade.output)
                  const source = (trade.source || '').toLowerCase()
                  const txType = source.includes('buy') ? 'BUY' : source.includes('sell') ? 'SELL' : source.includes('rebalance') ? 'REBAL' : 'EXEC'
                  
                  const isRebal = txType === 'REBAL'
                  const isBuy = txType === 'BUY'
                  
                  const rowTypeColor = isRebal ? "text-white" : (isBuy ? "text-accent-cyan" : "text-accent-pink")
                  const amountAssetColor = isRebal ? "text-white/90" : (isBuy ? "text-accent-cyan" : "text-accent-pink")
                  const toAmountAssetColor = isRebal ? "text-white/90" : (isBuy ? "text-accent-pink" : "text-accent-cyan")

                  // Calculate SOL price based on which side is the stablecoin
                  const isInputStable = ['USDC', 'USDT', 'USD'].includes(trade.input)
                  const impliedPrice = trade.amount_in > 0 && trade.amount_out > 0
                    ? (isInputStable ? trade.amount_in / trade.amount_out : trade.amount_out / trade.amount_in)
                    : 0

                  return (
                    <div key={trade.id} className="mx-2 grid grid-cols-[90px_50px_1fr_1fr_80px_60px] gap-4 items-center px-2 py-2 rounded-lg bg-background-elevated/30 border border-white/5 hover:border-white/10 transition-all group font-mono whitespace-nowrap overflow-hidden">
                      {/* 1. Time */}
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-tighter text-left">
                        {(() => {
                          if (!trade.timestamp) return '-'
                          const date = new Date(trade.timestamp.replace(' ', 'T') + (trade.timestamp.includes('Z') ? '' : 'Z'))
                          if (isNaN(date.getTime())) return '-'
                          const d = date.getDate().toString().padStart(2, '0')
                          const m = (date.getMonth() + 1).toString().padStart(2, '0')
                          const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                          return `${m}/${d} ${time}`
                        })()}
                      </div>
                      
                      {/* 2. Type */}
                      <div className={cn("font-black uppercase tracking-tighter text-[10px] text-left", rowTypeColor)}>
                        {txType}
                      </div>

                      {/* 3. From */}
                      <div className="flex items-center gap-2 min-w-0 overflow-hidden text-[10px] font-bold tracking-tighter text-left">
                        <span className={cn("tabular-nums", amountAssetColor)}>{trade.amount_in?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <span className={cn("uppercase", amountAssetColor)}>{trade.input}</span>
                      </div>

                      {/* 4. To */}
                      <div className="flex items-center gap-2 min-w-0 overflow-hidden text-[10px] font-bold tracking-tighter text-left">
                        <span className={cn("tabular-nums", toAmountAssetColor)}>{trade.amount_out?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <span className={cn("uppercase", toAmountAssetColor)}>{trade.output}</span>
                      </div>

                      {/* 5. Price */}
                      <div className="text-[10px] font-black tabular-nums text-white/80 tracking-tighter text-left">
                        {impliedPrice > 0 ? impliedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
                      </div>

                      {/* 6. Status */}
                      <div className="text-left">
                        <span className={cn(
                          "uppercase font-black text-[8px] tracking-tighter px-1.5 py-0.5 rounded border leading-none inline-block",
                          isRebal ? "text-white/20 border-white/10 bg-white/5" : 
                          (isSuccess ? "text-accent-cyan border-accent-cyan/20 bg-accent-cyan/5" : "text-accent-pink border-accent-pink/20 bg-accent-pink/5")
                        )}>
                          {isRebal ? 'REB' : (isSuccess ? 'OK' : 'FAIL')}
                        </span>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50 py-20">
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

    </div>
  )
}
