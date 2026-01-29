import { useState, useMemo, useEffect } from 'react'
import { Play, ChevronDown, Activity, Zap, TrendingUp, TrendingDown, History } from 'lucide-react'
import { BacktestModal } from '@/components/modals/BacktestModal'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

export const SignalBotWidget = () => {
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
        mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
        symbol: 'SKR',
        logoURI: '/logo_concept_5.svg'
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

  const [inputMint, setInputMint] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  const [outputMint, setOutputMint] = useState('So11111111111111111111111111111111111111112')

  const [isFromOpen, setIsFromOpen] = useState(false)
  const [isToOpen, setIsToOpen] = useState(false)
  const [isBacktestOpen, setIsBacktestOpen] = useState(false)

  const fromToken = tokens.find(t => t.mint === inputMint) || tokens[0]
  const toToken = tokens.find(t => t.mint === outputMint) || tokens[1]

  // Signal Bot Specific State
  const [rsiThreshold, setRsiThreshold] = useState('30')
  const [useBollinger, setUseBollinger] = useState(true)
  const [timeframe, setTimeframe] = useState('1H')
  const [indicatorData, setIndicatorData] = useState<any>(null)
  const [loadingIndicators, setLoadingIndicators] = useState(false)

  // Configuration State
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Fetch Indicator Data
  useEffect(() => {
    const fetchIndicators = async () => {
      setLoadingIndicators(true)
      try {
        const res = await fetch(`/api/analysis/data?mint=${outputMint}&timeframe=${timeframe}`)
        const data = await res.json()
        setIndicatorData(data)
      } catch (e) {
        console.error("Failed to fetch Indicators", e)
      } finally {
        setLoadingIndicators(false)
      }
    }
    fetchIndicators()
    const interval = setInterval(fetchIndicators, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [outputMint, timeframe])

  const currentPrice = prices[outputMint] || toToken.price || 0
  const totalAmt = parseFloat(amount) || 0

  const hasInsufficientBalance = totalAmt > (fromToken.balance || 0)

  const signalTrades = useMemo(() => history.filter(t => t && t.source?.toLowerCase()?.includes('signal')), [history])

  const handleDeploy = async () => {
    if (!amount || hasInsufficientBalance) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/dca/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'SIGNAL',
          inputMint,
          outputMint,
          amount: totalAmt,
          interval: 15, // Check every 15 mins
          rsiThreshold: parseFloat(rsiThreshold),
          useBollinger,
          timeframe
        })
      })

      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setAmount('')
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

  return (
    <div className="flex flex-col lg:flex-row gap-2 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-0 text-white">

      {/* COLUMN 1: Parameters */}
      <div className="lg:w-[380px] bg-background-card border border-accent-cyan/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 shrink-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent" />

        <div className="flex items-center justify-between mb-1 border-b border-accent-cyan/10 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Zap size={18} />
            </div>
            <h2 className="text-xs font-bold uppercase tracking-tight">SIGNAL CONFIG</h2>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono font-bold text-accent-cyan">${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
          </div>
        </div>

        <div className="space-y-3 flex-1 overflow-auto custom-scrollbar pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 relative">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Spend</label>
              <button onClick={() => setIsFromOpen(!isFromOpen)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-2 flex items-center justify-between h-10">
                <span className="font-bold text-xs">{fromToken.symbol}</span>
                <ChevronDown size={12} />
              </button>
              {isFromOpen && (
                <div className="absolute top-full left-0 right-0 z-30 bg-background-card border border-accent-cyan/20 rounded-xl mt-1 p-1">
                  {tokens.map(t => (
                    <button key={t.mint} onClick={() => { setInputMint(t.mint); setIsFromOpen(false); }} className="w-full p-2 hover:bg-white/5 rounded-lg text-left text-[10px] font-bold">
                      {t.symbol}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 relative">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">Trade</label>
              <button onClick={() => setIsToOpen(!isToOpen)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-2 flex items-center justify-between h-10 border-accent-cyan/30">
                <span className="font-bold text-xs">{toToken.symbol}</span>
                <ChevronDown size={12} />
              </button>
              {isToOpen && (
                <div className="absolute top-full left-0 right-0 z-30 bg-background-card border border-accent-cyan/20 rounded-xl mt-1 p-1">
                  {tokens.map(t => (
                    <button key={t.mint} onClick={() => { setOutputMint(t.mint); setIsToOpen(false); }} className="w-full p-2 hover:bg-white/5 rounded-lg text-left text-[10px] font-bold">
                      {t.symbol}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Timeframe</label>
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-2 h-10 text-xs font-bold focus:outline-none">
                <option value="15m">15 Minutes</option>
                <option value="1H">1 Hour</option>
                <option value="4H">4 Hours</option>
                <option value="1D">1 Day</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">RSI Threshold</label>
              <input type="number" value={rsiThreshold} onChange={(e) => setRsiThreshold(e.target.value)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-2 h-10 text-xs font-mono font-bold focus:outline-none" placeholder="30" />
            </div>
          </div>

          <button
            onClick={() => setUseBollinger(!useBollinger)}
            className={cn(
              "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
              useBollinger ? "bg-accent-cyan/10 border-accent-cyan text-accent-cyan" : "bg-white/5 border-accent-cyan/20 text-text-muted"
            )}
          >
            <span className="text-[10px] font-black uppercase tracking-widest">Require Bollinger Confluence</span>
            <div className={cn("w-2 h-2 rounded-full", useBollinger ? "bg-accent-cyan animate-pulse" : "bg-white/20")} />
          </button>

          <div className="space-y-1.5 pt-4">
            <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Entry Amount ({fromToken.symbol})</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-3 h-12 text-lg font-mono font-bold focus:outline-none focus:border-accent-cyan text-center" placeholder="0.00" />
          </div>
        </div>

        {status === 'error' && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">{errorMsg}</div>}
        {hasInsufficientBalance && totalAmt > 0 && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">LOW BALANCE</div>}
        {status === 'success' && <div className="p-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-[8px] text-accent-green font-bold animate-in fade-in text-center uppercase tracking-widest">Signal Bot Deployed</div>}

        <button onClick={handleDeploy} disabled={status === 'loading' || !totalAmt || hasInsufficientBalance} className={cn(
          "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3",
          totalAmt > 0 && !hasInsufficientBalance ? "bg-accent-cyan text-black shadow-[0_0_30px_rgba(3,225,255,0.2)]" : "bg-white/5 text-white/10 cursor-not-allowed"
        )}>
          {status === 'loading' ? <Activity size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
          Deploy Signal Bot
        </button>
      </div>

      {/* COLUMN 2: Analysis */}
      <div className="flex-1 bg-background-card border border-accent-cyan/10 rounded-2xl p-4 shadow-xl relative flex flex-col gap-4 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent" />

        <div className="flex items-center justify-between border-b border-accent-cyan/10 pb-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-accent-cyan" />
            <h2 className="text-xs font-bold uppercase">Technical Analysis</h2>
          </div>
          {indicatorData && (
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-[8px] text-text-muted font-bold uppercase">RSI (14)</div>
                <div className={cn("text-xs font-mono font-black", indicatorData.rsi < 30 ? "text-accent-cyan" : indicatorData.rsi > 70 ? "text-accent-pink" : "text-white")}>
                  {indicatorData.rsi?.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] text-text-muted font-bold uppercase">EMA 20/50</div>
                <div className="text-xs font-mono font-black text-white">
                  {indicatorData.ema_cross_up ? <TrendingUp size={12} className="inline text-accent-cyan mr-1" /> : <TrendingDown size={12} className="inline text-accent-pink mr-1" />}
                  {indicatorData.ema_cross_up ? 'BULLISH' : 'BEARISH'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-background-elevated rounded-xl p-4 border border-accent-cyan/10 relative overflow-hidden">
              {loadingIndicators && <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] animate-pulse z-10" />}
              <div className="text-[10px] text-text-muted font-bold uppercase mb-1">Bollinger Status</div>
              <div className={cn("text-xl font-black", indicatorData?.bb_oversold ? "text-accent-cyan" : indicatorData?.bb_overbought ? "text-accent-pink" : "text-white")}>
                {indicatorData?.bb_oversold ? 'OVERSOLD' : indicatorData?.bb_overbought ? 'OVERBOUGHT' : 'NEUTRAL'}
              </div>
              <div className="text-[8px] text-text-muted font-bold mt-1 uppercase tracking-tighter">
                Price vs 2SD Bands
              </div>
            </div>
            <div className="bg-background-elevated rounded-xl p-4 border border-accent-cyan/10 relative overflow-hidden">
              {loadingIndicators && <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] animate-pulse z-10" />}
              <div className="text-[10px] text-text-muted font-bold uppercase mb-1">Strategy Bias</div>
              <div className={cn("text-xl font-black truncate", indicatorData?.bias_color || 'text-white')}>
                {indicatorData?.bias_level || 'NEUTRAL'}
              </div>
              <div className="text-[8px] text-text-muted font-bold mt-1 uppercase tracking-tighter">
                Based on {timeframe} market structure
              </div>
            </div>
          </div>

          <div className="bg-accent-cyan/5 rounded-xl p-4 border border-accent-cyan/10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-black uppercase text-accent-cyan">Quant Intelligence</h3>
              <button
                onClick={() => setIsBacktestOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1 bg-accent-cyan/10 border border-accent-cyan/30 rounded-lg hover:bg-accent-cyan hover:text-black transition-all group"
              >
                <History size={10} className="group-hover:rotate-[-45deg] transition-transform" />
                <span className="text-[8px] font-black uppercase tracking-widest">Run Time Machine</span>
              </button>
            </div>
            {indicatorData ? (
              <p className="text-[10px] leading-relaxed text-text-secondary">
                The {toToken.symbol} token is currently showing
                <span className={cn("font-bold mx-1", indicatorData.rsi < 30 ? "text-accent-cyan" : "text-white")}>
                  {indicatorData.rsi < 30 ? 'high reversal potential' : 'moderate momentum'}
                </span>
                on the {timeframe} timeframe. {indicatorData.bb_oversold ? 'Price has pierced the lower Bollinger Band, indicating a strong value zone.' : ''}
                {indicatorData.trend_up ? ' Long-term trend remains intact above EMA 50.' : ' Short-term bearish pressure detected below EMA 50.'}
              </p>
            ) : (
              <p className="text-[10px] text-text-muted animate-pulse">Analyzing market structures...</p>
            )}
          </div>

          {/* Indicator Grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'RSI', value: indicatorData?.rsi?.toFixed(1) || '...', color: indicatorData?.rsi < 30 ? 'text-accent-cyan' : indicatorData?.rsi > 70 ? 'text-accent-pink' : 'text-white' },
              { label: 'ATR', value: indicatorData?.atr?.toFixed(4) || '...', color: 'text-white' },
              { label: 'MACD', value: indicatorData?.MACD_12_26_9?.toFixed(2) || '...', color: 'text-white' },
            ].map((stat, i) => (
              <div key={i} className="bg-black/20 border border-accent-cyan/10 rounded-lg p-2 text-center">
                <div className="text-[7px] text-text-muted font-bold uppercase">{stat.label}</div>
                <div className={cn("text-[10px] font-mono font-black", stat.color)}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* COLUMN 3: History */}
      <div className="flex-1 bg-background-card border border-accent-cyan/10 rounded-2xl p-4 shadow-xl relative flex flex-col gap-4 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent" />
        <h2 className="text-xs font-bold uppercase border-b border-accent-cyan/10 pb-4">Signal Activity</h2>
        <div className="flex-1 overflow-auto custom-scrollbar">
          {signalTrades.length > 0 ? (
            <div className="space-y-2">
              {signalTrades.map(t => (
                <div key={t.id} className="p-2 bg-background-elevated rounded-lg border border-accent-cyan/10 text-[10px] font-mono flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-accent-cyan font-bold">SIGNAL {t.output}</span>
                    <span className="text-text-muted text-[8px]">{t.timestamp}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${t.usd_value.toFixed(2)}</div>
                    <div className="text-accent-green text-[8px]">FILLED</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-30 gap-2">
              <Zap size={32} />
              <div className="text-[10px] font-bold uppercase tracking-widest">No Signal Events</div>
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      <BacktestModal
        isOpen={isBacktestOpen}
        onClose={() => setIsBacktestOpen(false)}
        mint={outputMint}
        symbol={toToken.symbol}
      />
    </div>
  )
}
