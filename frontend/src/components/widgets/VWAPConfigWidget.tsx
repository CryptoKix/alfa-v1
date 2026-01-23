import { useState, useMemo, useEffect } from 'react'
import { Play, BarChart3,  ChevronDown, Activity, TrendingUp } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

interface VWAPData {
  vwap: number
  hourly_weights: number[]
  candle_count: number
  window_hours: number
}

export const VWAPConfigWidget = () => {
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

  const fromToken = tokens.find(t => t.mint === inputMint) || tokens[0]
  const toToken = tokens.find(t => t.mint === outputMint) || tokens[1]

  // Configuration State
  const [totalAmount, setTotalAmount] = useState('')
  const [durationHours, setDurationHours] = useState('24')
  const [interval, setInterval] = useState('15') // Minutes between trades
  const [vwapWindow, setVwapWindow] = useState('24') // Hours for VWAP calculation
  const [maxDeviation, setMaxDeviation] = useState('') // Optional max deviation %
  const [takeProfit, setTakeProfit] = useState('') // Snipe Profit %
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // VWAP Data State
  const [vwapData, setVwapData] = useState<VWAPData | null>(null)
  const [loadingVwap, setLoadingVwap] = useState(false)

  // Derived Calculations
  const currentPrice = prices[outputMint] || toToken.price || 0
  const totalDurationHours = parseInt(durationHours) || 24
  const tradeInterval = parseInt(interval) || 15
  const totalAmt = parseFloat(totalAmount) || 0
  const tpPercent = parseFloat(takeProfit) || 0
  const maxDev = parseFloat(maxDeviation) || 0

  const runsPerHour = Math.floor(60 / tradeInterval)
  const tradeCount = totalDurationHours * runsPerHour
  const baseAmountPerTrade = tradeCount > 0 ? totalAmt / tradeCount : 0

  const hasInsufficientBalance = totalAmt > (fromToken.balance || 0)

  // Calculate price deviation from VWAP
  const priceDeviation = vwapData && vwapData.vwap > 0
    ? ((currentPrice - vwapData.vwap) / vwapData.vwap * 100)
    : 0

  // Fetch VWAP data when output token or window changes
  useEffect(() => {
    const fetchVwapData = async () => {
      if (!outputMint) return
      setLoadingVwap(true)
      try {
        const res = await fetch(`/api/vwap/data?mint=${outputMint}&window=${vwapWindow}`)
        const data = await res.json()
        if (data.success) {
          setVwapData(data)
        }
      } catch (e) {
        console.error('Failed to fetch VWAP data:', e)
      } finally {
        setLoadingVwap(false)
      }
    }
    fetchVwapData()
  }, [outputMint, vwapWindow])

  const vwapTrades = useMemo(() => history.filter(t => t && t.source?.toLowerCase()?.includes('vwap')), [history])

  const handleDeploy = async () => {
    if (!totalAmount || !durationHours || !interval || hasInsufficientBalance) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/dca/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'VWAP',
          inputMint,
          outputMint,
          amount: baseAmountPerTrade, // Base amount (will be adjusted by volume weights)
          totalAmount: totalAmt,
          interval: tradeInterval,
          maxRuns: tradeCount,
          durationHours: totalDurationHours,
          vwapWindow: parseInt(vwapWindow),
          maxDeviation: maxDev > 0 ? maxDev : undefined,
          takeProfit: tpPercent > 0 ? tpPercent : undefined
        })
      })

      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setTotalAmount('')
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

  // Get current hour for highlighting
  const currentHour = new Date().getUTCHours()

  return (
    <div className="flex flex-col lg:flex-row gap-2 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-0">

      {/* COLUMN 1: Parameters */}
      <div className="lg:w-[380px] bg-background-card border border-accent-pink/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 shrink-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent" />

        <div className="flex items-center justify-between mb-1 border-b border-accent-pink/10 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <BarChart3 size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">VWAP CONFIG</h2>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono font-bold text-accent-cyan">${currentPrice !== undefined && currentPrice !== null ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00'}</div>
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

          {/* VWAP Window & Max Deviation */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">VWAP Window</label>
              <select
                value={vwapWindow}
                onChange={(e) => setVwapWindow(e.target.value)}
                className="w-full bg-background-elevated border border-white/10 rounded-xl p-2.5 text-sm font-mono font-bold text-white focus:outline-none focus:border-accent-cyan transition-colors h-12 appearance-none cursor-pointer"
              >
                <option value="1">1 Hour</option>
                <option value="4">4 Hours</option>
                <option value="24">24 Hours</option>
                <option value="168">1 Week</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">Max Deviation %</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-cyan transition-colors h-12">
                <input
                  type="number"
                  value={maxDeviation}
                  onChange={(e) => setMaxDeviation(e.target.value)}
                  placeholder="Optional"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5"
                />
              </div>
            </div>
          </div>

          {/* Duration & Interval */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-purple">Duration (Hours)</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-purple transition-colors h-12">
                <input
                  type="number"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  placeholder="24"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-purple">Interval (Mins)</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-purple transition-colors h-12">
                <input
                  type="number"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  placeholder="15"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5"
                />
              </div>
            </div>
          </div>

          {/* Investment & TP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-purple">Total Amount ({fromToken.symbol})</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2 flex items-center gap-3 h-12">
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-base font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5 text-center"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-cyan">Take Profit (%)</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-cyan transition-colors h-12">
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="Optional"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5"
                />
              </div>
            </div>
          </div>
        </div>

        {status === 'error' && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">{errorMsg}</div>}
        {hasInsufficientBalance && totalAmt > 0 && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">LOW BALANCE</div>}
        {status === 'success' && <div className="p-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-[8px] text-accent-green font-bold animate-in fade-in text-center uppercase tracking-widest">VWAP Deployed</div>}

        <button
          onClick={handleDeploy}
          disabled={status === 'loading' || !totalAmt || !durationHours || !interval || hasInsufficientBalance}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-base uppercase tracking-[0.2em] transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-3 shrink-0 group/launch",
            totalAmt > 0 && durationHours && interval && status !== 'loading' && !hasInsufficientBalance
              ? "bg-accent-cyan text-white hover:bg-white hover:text-black shadow-[0_0_30px_rgba(0,206,209,0.2)] hover:shadow-[0_0_50px_rgba(0,206,209,0.4)] border border-accent-cyan"
              : "bg-white/5 text-white/10 cursor-not-allowed border border-white/5 opacity-50"
          )}
        >
          {status === 'loading' ? (
            <div className="flex items-center gap-2">
              <Activity size={20} className="animate-spin" />
              <span className="animate-pulse text-xs tracking-widest">Broadcasting...</span>
            </div>
          ) : hasInsufficientBalance && totalAmt > 0 ? (
            <span className="text-xs">Liquidity Issue</span>
          ) : (
            <>
              <Play size={20} fill="currentColor" className="transition-transform group-hover/launch:scale-125" />
              Execute VWAP
            </>
          )}
        </button>
      </div>

      {/* COLUMN 2: VWAP Data & Volume Profile */}
      <div className="flex-1 bg-background-card border border-accent-pink/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent" />

        <div className="flex items-center justify-between mb-1 border-b border-accent-pink/10 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-tight">VWAP ANALYSIS</h2>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {/* VWAP Price Info */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-text-muted uppercase font-bold mb-1">VWAP Price</div>
              <div className="text-2xl font-black text-accent-cyan">
                {loadingVwap ? '...' : vwapData?.vwap ? `$${vwapData.vwap.toFixed(4)}` : 'N/A'}
              </div>
              <div className="text-[9px] text-text-muted uppercase tracking-widest mt-1">{vwapWindow}h Window</div>
            </div>
            <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Current Price</div>
              <div className="text-2xl font-black text-white">${currentPrice.toFixed(4)}</div>
              <div className="text-[9px] text-text-muted uppercase tracking-widest mt-1">Live</div>
            </div>
            <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Deviation</div>
              <div className={cn(
                "text-2xl font-black",
                priceDeviation > 0 ? "text-accent-green" : priceDeviation < 0 ? "text-accent-red" : "text-white"
              )}>
                {priceDeviation > 0 ? '+' : ''}{priceDeviation.toFixed(2)}%
              </div>
              <div className="text-[9px] text-text-muted uppercase tracking-widest mt-1">From VWAP</div>
            </div>
          </div>

          {/* Volume Profile Histogram */}
          <div className="bg-black/20 rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={14} className="text-accent-cyan" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">24H Volume Profile</span>
              <span className="text-[9px] text-text-muted ml-auto">Current: {currentHour}:00 UTC</span>
            </div>
            <div className="flex items-end gap-[2px] h-24">
              {(vwapData?.hourly_weights || Array(24).fill(1/24)).map((weight, hour) => {
                const maxWeight = Math.max(...(vwapData?.hourly_weights || [1/24]))
                const heightPct = maxWeight > 0 ? (weight / maxWeight) * 100 : 4
                const isCurrentHour = hour === currentHour
                return (
                  <div
                    key={hour}
                    className={cn(
                      "flex-1 rounded-t transition-all",
                      isCurrentHour ? "bg-accent-cyan" : "bg-accent-cyan/30 hover:bg-accent-cyan/50"
                    )}
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                    title={`${hour}:00 - ${(weight * 100).toFixed(2)}%`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between mt-1 text-[8px] text-text-muted">
              <span>0:00</span>
              <span>6:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>23:00</span>
            </div>
          </div>

          {/* Execution Preview */}
          <div className="bg-background-elevated/30 border border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-cyan/10 flex items-center justify-center text-accent-cyan border border-accent-cyan/20">
              <BarChart3 size={24} />
            </div>
            <div>
              <div className="text-sm font-bold text-white mb-1">Volume-Weighted Average Price</div>
              <div className="text-xs text-text-secondary max-w-xs leading-relaxed">
                Executing ~<span className="text-white font-bold">{baseAmountPerTrade.toFixed(4)} {fromToken.symbol}</span> (volume-adjusted) every <span className="text-white font-bold">{tradeInterval} minutes</span> over <span className="text-white font-bold">{totalDurationHours} hours</span>.
                {maxDev > 0 && <span className="text-accent-cyan"> Pauses if price deviates &gt;{maxDev}% from VWAP.</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COLUMN 3: Real-time Executions */}
      <div className="flex-1 bg-background-card border border-accent-pink/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0 h-full">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent" />

        <div className="flex items-center justify-between mb-1 border-b border-accent-pink/10 shrink-0 h-[55px] -mx-4 px-4 -mt-4">
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
          <div className="grid grid-cols-[100px_80px_1fr_80px_50px] gap-2 px-4 pt-3 pb-2 text-[8px] font-black text-text-muted uppercase tracking-widest shrink-0 border-b border-white/5 bg-white/[0.02]">
            <div>Time</div>
            <div>Type</div>
            <div>Details</div>
            <div>Price</div>
            <div className="text-right">Status</div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar p-2">
            {vwapTrades.length > 0 ? (
              <div className="space-y-1">
                {vwapTrades.map(trade => {
                  const isSuccess = trade.status === 'success'
                  const isOutputStable = ['USDC', 'USDT', 'USD'].includes(trade.output)
                  const targetAmount = isOutputStable ? trade.amount_in : trade.amount_out
                  const impliedPrice = trade.usd_value > 0 && targetAmount > 0
                    ? trade.usd_value / targetAmount
                    : 0

                  const source = (trade.source || '').toLowerCase()
                  const txType = source.includes('buy') ? 'BUY' : source.includes('sell') ? 'SELL' : 'EXEC'
                  const typeColor = txType === 'BUY' ? "text-accent-cyan" : txType === 'SELL' ? "text-accent-pink" : "text-accent-cyan"

                  return (
                    <div key={trade.id} className="grid grid-cols-[100px_80px_1fr_80px_50px] gap-2 items-end p-2 rounded-lg bg-background-elevated/30 border border-white/5 hover:border-white/10 transition-all group font-mono whitespace-nowrap overflow-hidden text-[10px]">
                      <div className={cn(
                        "font-black shrink-0 leading-none transition-colors duration-500 uppercase tracking-tight",
                        isSuccess ? "text-white/80" : "text-text-muted"
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

                      <div className={cn("font-black uppercase tracking-tight shrink-0 text-[10px] leading-none", typeColor)}>
                        {txType}
                      </div>

                      <div className={cn("flex items-end gap-1.5 min-w-0 overflow-hidden text-[10px] font-black uppercase tracking-tight leading-none", typeColor)}>
                        <span className="shrink-0">{trade.input}</span>
                        <span className="shrink-0">{trade.amount_in?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <span className="opacity-30 text-[8px] shrink-0 mx-0.5">&rarr;</span>
                        <span className="shrink-0">{trade.output}</span>
                        <span className="truncate">{trade.amount_out?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>

                      <div className="text-white/60 font-black uppercase tracking-tight leading-none shrink-0">
                        {impliedPrice > 0 ? `${impliedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
                      </div>

                      <div className="text-right shrink-0 leading-none">
                        <span className={cn(
                          "uppercase font-black text-[10px] tracking-tight px-1.5 py-0.5 rounded border leading-none inline-block",
                          isSuccess ? "text-accent-green border-accent-green/20 bg-accent-green/5" : "text-accent-red border-accent-red/20 bg-accent-red/5"
                        )}>
                          {isSuccess ? 'OK' : 'ERR'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
                <Activity size={32} strokeWidth={1} />
                <div className="text-center">
                  <div className="font-bold text-[10px] uppercase tracking-widest mb-1">No VWAP Activity</div>
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
