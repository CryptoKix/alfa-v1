import { useState, useMemo } from 'react'
import { ArrowUpDown, Info, Zap, ChevronDown, Plus, Minus, Activity } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

export const TradeEntryWidget = () => {
  const { holdings } = useAppSelector(state => state.portfolio)
  const prices = useAppSelector(state => state.prices.prices)
  
  // Available Tokens: Merge current holdings with defaults
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

  const [fromTokenMint, setFromTokenMint] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') // Default USDC
  const [toTokenMint, setToTokenMint] = useState('So11111111111111111111111111111111111111112') // Default SOL
  
  const [isFromOpen, setIsFromOpen] = useState(false)
  const [isToOpen, setIsToOpen] = useState(false)

  const fromToken = tokens.find(t => t.mint === fromTokenMint) || tokens[0]
  const toToken = tokens.find(t => t.mint === toTokenMint) || tokens[1]

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  
  // Advanced Params
  const [slippage, setSlippage] = useState('0.5')
  const [priorityFee, setPriorityFee] = useState('0')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const toggleSide = () => {
    const temp = fromTokenMint
    setFromTokenMint(toTokenMint)
    setToTokenMint(temp)
    setSide(prev => prev === 'buy' ? 'sell' : 'buy')
  }

  const handleTrade = async () => {
    if (!amount) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: fromTokenMint,
          outputMint: toTokenMint,
          amount: parseFloat(amount),
          strategy: 'Manual Swap',
          slippageBps: Math.floor(parseFloat(slippage) * 100),
          priorityFee: parseFloat(priorityFee)
        })
      })

      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setAmount('')
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Trade failed')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg('Network error')
    }
  }

  const adjustAmount = (delta: number) => {
    setAmount(prev => {
      const val = parseFloat(prev) || 0
      return Math.max(0, val + delta).toString()
    })
  }

  const fromPrice = prices[fromTokenMint] || fromToken.price || 0
  const toPrice = prices[toTokenMint] || toToken.price || 0
  const estimatedOut = (amount && fromPrice && toPrice) ? (parseFloat(amount) * fromPrice) / toPrice : 0

  const TokenItem = ({ token, onClick }: { token: any, onClick: () => void }) => (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group"
    >
      <div className="flex items-center gap-3">
        <img 
          src={token.logoURI || 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png'}
          alt={token.symbol}
          className="w-6 h-6 rounded-full"
          onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')}
        />
        <div className="text-left">
          <div className="text-sm font-bold text-white group-hover:text-accent-cyan">{token.symbol}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-mono text-white">{token.balance?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
        <div className="text-[9px] text-text-muted">${((token.balance || 0) * (prices[token.mint] || token.price || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      </div>
    </button>
  )

  return (
    <div className="bg-background-card border border-white/5 rounded-2xl p-4 shadow-xl flex flex-col h-[600px] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-10" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2 border-b border-white/5 shrink-0 h-[55px] z-10 -mx-4 px-4 -mt-4">
        <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-white">
          <Zap className="text-accent-cyan" size={18} />
          Execute Trade
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex bg-background-elevated rounded-xl p-1.5 mb-4 border border-white/5 relative group/tabs">
        <button
          onClick={() => setSide('buy')}
          className={cn(
            "flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all duration-300 relative z-10",
            side === 'buy' ? "bg-accent-cyan text-black shadow-glow-cyan" : "text-text-muted hover:text-white"
          )}
        >
          BUY
        </button>
        <button
          onClick={() => setSide('sell')}
          className={cn(
            "flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all duration-300 relative z-10",
            side === 'sell' ? "bg-accent-pink text-black shadow-glow-pink" : "text-text-muted hover:text-white"
          )}
        >
          SELL
        </button>
      </div>

      {/* Input Section */}
      <div className="space-y-3 flex-1 overflow-visible">
        
        {/* From */}
        <div className="space-y-1 relative">
          <div className="flex justify-between text-[10px] text-text-secondary uppercase tracking-widest px-1">
            <span>You Pay</span>
            <span 
              className="cursor-pointer hover:text-accent-cyan transition-colors"
              onClick={() => setAmount(fromToken.balance.toString())}
            >
              Balance: {fromToken.balance?.toLocaleString()}
            </span>
          </div>
          <div className="bg-background-elevated border border-white/10 rounded-xl px-3 flex items-center gap-3 focus-within:border-accent-cyan transition-colors relative group/input h-14">
            <div className="flex flex-col gap-0.5 pr-2 border-r border-white/5">
              <button onClick={() => adjustAmount(1)} className="p-0.5 hover:bg-white/5 rounded text-text-muted hover:text-accent-cyan transition-colors"><Plus size={12} /></button>
              <button onClick={() => adjustAmount(-1)} className="p-0.5 hover:bg-white/5 rounded text-text-muted hover:text-accent-pink transition-colors"><Minus size={12} /></button>
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="bg-transparent text-xl font-mono font-bold text-accent-cyan w-full focus:outline-none placeholder:text-accent-cyan/20"
            />
            <div 
              onClick={() => { setIsFromOpen(!isFromOpen); setIsToOpen(false); }}
              className="flex items-center gap-2 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5 shrink-0 hover:bg-black/60 transition-colors cursor-pointer group w-[90px]"
            >
              <img 
                src={fromToken.logoURI || 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png'}
                alt={fromToken.symbol}
                className="w-4 h-4 rounded-full shadow-sm"
                onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')}
              />
              <span className="font-bold text-xs">{fromToken.symbol}</span>
              <ChevronDown size={12} className={cn("transition-transform", isFromOpen && "rotate-180")} />
            </div>
          </div>

          {isFromOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsFromOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 z-30 bg-background-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 max-h-64 overflow-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                <div className="text-[8px] uppercase tracking-widest text-text-muted font-bold px-2 py-1 mb-1 border-b border-white/5">Select Asset</div>
                {tokens.map(t => (
                  <TokenItem key={t.mint} token={t} onClick={() => { setFromTokenMint(t.mint); setIsFromOpen(false); }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Arrow Divider */}
        <div className="flex justify-center -my-2.5 relative z-10">
          <button 
            onClick={toggleSide}
            className="bg-background-card border border-white/10 p-1.5 rounded-xl text-accent-cyan hover:text-white hover:border-accent-cyan/50 transition-all shadow-xl active:scale-90 group"
          >
            <ArrowUpDown size={14} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        {/* To */}
        <div className="space-y-1 relative">
          <div className="flex justify-between text-[10px] text-text-secondary uppercase tracking-widest px-1">
            <span>You Receive</span>
            <span>Est.</span>
          </div>
          <div className="bg-background-elevated/50 border border-white/5 rounded-xl px-3 flex items-center gap-3 h-14">
            <div className="w-[27px] pr-2 border-r border-transparent shrink-0" />
            <div className="text-xl font-mono font-bold text-accent-cyan w-full truncate">
              {estimatedOut > 0 ? estimatedOut.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0.00'}
            </div>
            <div 
              onClick={() => { setIsToOpen(!isToOpen); setIsFromOpen(false); }}
              className="flex items-center gap-2 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5 shrink-0 hover:bg-black/60 transition-colors cursor-pointer group w-[90px]"
            >
              <img 
                src={toToken.logoURI || 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png'}
                alt={toToken.symbol}
                className="w-4 h-4 rounded-full shadow-sm"
                onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')}
              />
              <span className="font-bold text-xs">{toToken.symbol}</span>
              <ChevronDown size={12} className={cn("transition-transform", isToOpen && "rotate-180")} />
            </div>
          </div>

          {isToOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsToOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 z-30 bg-background-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 max-h-64 overflow-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                <div className="text-[8px] uppercase tracking-widest text-text-muted font-bold px-2 py-1 mb-1 border-b border-white/5">Select Asset</div>
                {tokens.map(t => (
                  <TokenItem key={t.mint} token={t} onClick={() => { setToTokenMint(t.mint); setIsToOpen(false); }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Advanced Params Row */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-black/20 border border-white/5 rounded-xl px-3 flex flex-col justify-center h-14">
            <label className="text-[8px] uppercase tracking-[0.2em] text-text-muted font-bold">Slippage</label>
            <div className="flex items-center gap-2">
              <input type="number" value={slippage} onChange={(e) => setSlippage(e.target.value)} className="bg-transparent text-[11px] font-mono font-bold text-white w-full focus:outline-none" />
              <span className="text-[9px] text-text-muted font-bold">%</span>
            </div>
          </div>
          <div className="bg-black/20 border border-white/5 rounded-xl px-3 flex flex-col justify-center h-14">
            <div className="flex justify-between items-center mb-0.5">
              <label className="text-[8px] uppercase tracking-[0.2em] text-text-muted font-bold">Priority</label>
              <div className="flex gap-1">
                {['0', '0.001', '0.005'].map(val => (
                  <button key={val} onClick={() => setPriorityFee(val)} className={cn("text-[7px] px-1 rounded border", priorityFee === val ? "bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan" : "bg-white/5 border-white/5 text-text-muted")}>{val === '0' ? 'N' : val === '0.001' ? 'L' : 'M'}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" value={priorityFee} onChange={(e) => setPriorityFee(e.target.value)} className="bg-transparent text-[11px] font-mono font-bold text-white w-full focus:outline-none" />
              <span className="text-[9px] text-text-muted font-bold">SOL</span>
            </div>
          </div>
        </div>

        {/* Feedback */}
        {status === 'error' && <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg text-[9px] text-accent-red font-bold animate-in fade-in">{errorMsg}</div>}
        {status === 'success' && <div className="p-2 bg-accent-green/10 border border-accent-green/20 rounded-lg text-[9px] text-accent-green font-bold animate-in fade-in text-center">TRADE EXECUTED</div>}

        <div className="p-2 bg-accent-cyan/5 border border-accent-cyan/10 rounded-lg flex items-start gap-2">
          <Info className="text-accent-cyan shrink-0 mt-0.5" size={12} />
          <div className="text-[9px] text-text-secondary leading-relaxed">Best price via <span className="text-accent-cyan font-bold">JUPITER</span></div>
        </div>
      </div>

      <button 
        onClick={handleTrade}
        disabled={!amount || status === 'loading'}
        className={cn(
          "w-full py-4.5 mt-4 rounded-2xl font-black text-lg uppercase tracking-[0.25em] transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-3",
          !amount || status === 'loading' 
            ? "bg-white/5 text-white/10 cursor-not-allowed border border-white/5 opacity-50" 
            : side === 'buy' 
              ? "bg-accent-cyan text-black hover:bg-white shadow-[0_0_35px_rgba(0,255,255,0.25)] hover:shadow-[0_0_55px_rgba(0,255,255,0.45)] border border-accent-cyan" 
              : "bg-accent-pink text-black hover:bg-white shadow-[0_0_35px_rgba(255,0,128,0.25)] hover:shadow-[0_0_55px_rgba(255,0,128,0.45)] border border-accent-pink"
        )}
      >
        {status === 'loading' ? (
          <div className="flex items-center gap-2">
            <Activity size={22} className="animate-spin" />
            <span className="animate-pulse">Confirming...</span>
          </div>
        ) : (
          <>
            <Zap size={22} fill="currentColor" />
            {side.toUpperCase()} {toToken.symbol}
          </>
        )}
      </button>
    </div>
  )
}
