import { useState, useMemo } from 'react'
import { Settings2, Play, Plus, Minus, Clock, Target, ChevronDown, Activity } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

export const TWAPConfigWidget = () => {
  const { holdings, history } = useAppSelector(state => state.portfolio)
  const prices = useAppSelector(state => state.prices.prices)

  // Asset Selection
  const tokens = useMemo(() => {
    const defaults = [
      { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL' },
      { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' },
      { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT' },
      { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP' }
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
  const [duration, setDuration] = useState('') // Total minutes
  const [interval, setInterval] = useState('') // Minutes between trades
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Derived Calculations
  const currentPrice = prices[outputMint] || toToken.price || 0
  const totalDuration = parseInt(duration) || 0
  const tradeInterval = parseInt(interval) || 1
  const totalAmt = parseFloat(totalAmount) || 0
  
  const tradeCount = Math.max(1, Math.floor(totalDuration / tradeInterval))
  const amountPerTrade = tradeCount > 0 ? totalAmt / tradeCount : 0

  const hasInsufficientBalance = totalAmt > (fromToken.balance || 0)

  const twapTrades = useMemo(() => history.filter(t => t && t.source?.toLowerCase()?.includes('twap')), [history])

  const handleDeploy = async () => {
    if (!totalAmount || !duration || !interval || hasInsufficientBalance) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/dca/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'TWAP',
          inputMint,
          outputMint,
          amount: amountPerTrade,
          totalAmount: totalAmt,
          interval: tradeInterval,
          maxRuns: tradeCount
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

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-0">
      
      {/* COLUMN 1: Parameters */}
      <div className="lg:w-[380px] bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 shrink-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-purple to-accent-cyan opacity-50" />
        
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-none">TWAP CONFIG</h2>
              <span className="text-[9px] text-text-muted uppercase tracking-widest">Parameters</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] text-text-muted uppercase tracking-widest font-bold">Price</div>
            <div className="text-xs font-mono font-bold text-accent-purple">${currentPrice !== undefined && currentPrice !== null ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00'}</div>
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

          {/* Execution Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1 text-accent-purple">Duration (Mins)</label>
              <div className="bg-background-elevated border border-white/10 rounded-xl p-2.5 flex items-center gap-2 focus-within:border-accent-purple transition-colors h-12">
                <input 
                  type="number" 
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="60"
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
                  placeholder="5"
                  className="bg-transparent text-sm font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/5"
                />
              </div>
            </div>
          </div>

          {/* Investment */}
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
        </div>

        {status === 'error' && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">{errorMsg}</div>}
        {hasInsufficientBalance && totalAmt > 0 && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[8px] text-accent-red font-bold animate-in fade-in">LOW BALANCE</div>}
        {status === 'success' && <div className="p-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-[8px] text-accent-green font-bold animate-in fade-in text-center uppercase tracking-widest">TWAP Deployed</div>}

        <button 
          onClick={handleDeploy}
          disabled={status === 'loading' || !totalAmt || !duration || !interval || hasInsufficientBalance}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-base uppercase tracking-[0.2em] transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-3 shrink-0 group/launch",
            totalAmt > 0 && duration && interval && status !== 'loading' && !hasInsufficientBalance
              ? "bg-accent-purple text-white hover:bg-white hover:text-black shadow-[0_0_30px_rgba(153,69,255,0.2)] hover:shadow-[0_0_50px_rgba(153,69,255,0.4)] border border-accent-purple"
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
              Execute TWAP
            </>
          )}
        </button>
      </div>

      {/* COLUMN 2: Execution Plan Preview */}
      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan to-accent-purple opacity-50" />
        
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <Target size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-none">PREVIEW</h2>
              <span className="text-[9px] text-text-muted uppercase tracking-widest">Execution Plan</span>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Trades</div>
              <div className="text-2xl font-black text-white">{tradeCount}</div>
              <div className="text-[9px] text-accent-cyan uppercase tracking-widest mt-1">Total Executions</div>
            </div>
            <div className="bg-background-elevated/50 border border-white/5 rounded-xl p-4">
              <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Per Trade</div>
              <div className="text-2xl font-black text-white">{amountPerTrade.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              <div className="text-[9px] text-accent-purple uppercase tracking-widest mt-1">{fromToken.symbol} per order</div>
            </div>
          </div>

          <div className="bg-background-elevated/30 border border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-purple/10 flex items-center justify-center text-accent-purple border border-accent-purple/20">
              <Clock size={24} />
            </div>
            <div>
              <div className="text-sm font-bold text-white mb-1">Time-Weighted Average Price</div>
              <div className="text-xs text-text-secondary max-w-xs leading-relaxed">
                Executing <span className="text-white font-bold">{amountPerTrade.toLocaleString()} {fromToken.symbol}</span> every <span className="text-white font-bold">{tradeInterval} minutes</span> until a total of <span className="text-white font-bold">{totalAmt} {fromToken.symbol}</span> is traded.
              </div>
            </div>
          </div>

          <div className="bg-black/20 rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-accent-green" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Timeline</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-text-muted">Start Time</span>
                <span className="text-white font-mono">Immediate</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-text-muted">Estimated End</span>
                <span className="text-white font-mono">{Math.floor(totalDuration / 60)}h {totalDuration % 60}m from now</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-accent-purple w-1/3 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COLUMN 3: Real-time Executions */}
      <div className="flex-1 bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-4 min-h-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-purple to-accent-pink opacity-50" />
        
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent-purple/10 rounded-lg text-accent-purple">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-none">EXECUTIONS</h2>
              <span className="text-[9px] text-text-muted uppercase tracking-widest">TWAP Log</span>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto custom-scrollbar p-3">
            {twapTrades.length > 0 ? (
              <div className="space-y-2">
                {twapTrades.map(trade => (
                  <div key={trade.id} className="p-2.5 bg-background-elevated/30 border border-white/5 rounded-lg hover:bg-white/5 transition-colors flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[7px] font-black px-1 py-0.5 rounded border leading-none uppercase tracking-tighter",
                            trade.output === 'SOL' ? "text-accent-cyan border-accent-cyan/20 bg-accent-cyan/10" : "text-accent-pink border-accent-pink/20 bg-accent-pink/10"
                          )}>
                            {trade.output === 'SOL' ? 'BUY' : 'SELL'}
                          </span>
                          <div className="text-[10px] font-mono text-white flex items-center gap-1">
                            <span className="text-accent-cyan">{trade.output}</span>
                            <span className="text-text-muted">/</span>
                            <span className="text-accent-pink">{trade.input}</span>
                          </div>
                        </div>
                        <div className="text-[8px] text-text-muted uppercase tracking-widest mt-1">
                          {(() => {
                            if (!trade.timestamp) return '-'
                            const isoStr = trade.timestamp.replace(' ', 'T') + (trade.timestamp.includes('Z') ? '' : 'Z')
                            const date = new Date(isoStr)
                            return isNaN(date.getTime()) ? '-' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                          })()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-mono font-bold text-white">
                          ${trade.usd_value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                        <div className={cn("text-[8px] font-bold uppercase", trade.status === 'success' ? 'text-accent-green' : 'text-accent-red')}>{trade.status}</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                      <div>
                        <div className="text-[7px] text-text-muted uppercase font-bold">Amount Traded</div>
                        <div className="text-[9px] font-mono text-white/80">{trade.amount_out?.toLocaleString(undefined, { maximumFractionDigits: 6 })} {trade.output}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[7px] text-text-muted uppercase font-bold">Signature</div>
                        <div className="text-[9px] font-mono text-accent-cyan/60 truncate">{trade.signature?.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3 opacity-50">
                <Activity size={32} strokeWidth={1} />
                <div className="text-center">
                  <div className="font-bold text-[10px] uppercase tracking-widest mb-1">No TWAP Activity</div>
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
