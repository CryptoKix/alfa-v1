import { useState, useMemo } from 'react'
import { ArrowUpDown, Zap, ChevronDown, Activity } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { useWalletMode } from '@/hooks/useWalletMode'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

export const QuickTradeWidget = () => {
  const { holdings } = useAppSelector(state => state.portfolio)
  const prices = useAppSelector(state => state.prices.prices)
  const { executeSwap } = useWalletMode()

  const tokens = useMemo(() => {
    const defaults = [
      { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
      { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
      { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', logoURI: 'https://static.jup.ag/jup/icon.png' },
    ]
    const combined = [...holdings]
    defaults.forEach(d => {
      if (!combined.find(c => c.mint === d.mint)) {
        combined.push({ ...d, balance: 0, price: 0, value: 0 } as any)
      }
    })
    return combined
  }, [holdings])

  const [fromMint, setFromMint] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  const [toMint, setToMint] = useState('So11111111111111111111111111111111111111112')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)

  const fromToken = tokens.find(t => t.mint === fromMint) || tokens[0]
  const toToken = tokens.find(t => t.mint === toMint) || tokens[1]
  const fromPrice = prices[fromMint] || fromToken.price || 0
  const toPrice = prices[toMint] || toToken.price || 0
  const estimatedOut = amount && fromPrice && toPrice ? (parseFloat(amount) * fromPrice) / toPrice : 0

  const togglePair = () => {
    setFromMint(toMint)
    setToMint(fromMint)
  }

  const handleSwap = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    setStatus('loading')
    try {
      const result = await executeSwap({
        inputMint: fromMint,
        outputMint: toMint,
        amount: parseFloat(amount),
        slippageBps: 50,
        strategy: 'Quick Trade'
      })
      if (result.success) {
        setStatus('success')
        setAmount('')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  const TokenPicker = ({ open, onClose, onSelect, exclude }: { open: boolean, onClose: () => void, onSelect: (mint: string) => void, exclude: string }) => {
    if (!open) return null
    return (
      <>
        <div className="fixed inset-0 z-20" onClick={onClose} />
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-background-card/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl p-2 max-h-48 overflow-auto custom-scrollbar">
          {tokens.filter(t => t.mint !== exclude).map(t => (
            <button
              key={t.mint}
              onClick={() => { onSelect(t.mint); onClose() }}
              className="w-full flex items-center gap-2 p-2 hover:bg-accent-cyan/10 rounded-lg transition-colors"
            >
              <img src={t.logoURI} alt={t.symbol} className="w-5 h-5 rounded-full" onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')} />
              <span className="text-sm font-bold text-white">{t.symbol}</span>
              <span className="text-xs text-text-muted ml-auto font-mono">{t.balance?.toFixed(4)}</span>
            </button>
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="bg-background-card border border-accent-pink/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-pink/60 via-accent-pink/20 to-transparent" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Zap className="text-accent-pink" size={16} />
        <h3 className="text-xs font-bold uppercase tracking-tight text-white">Quick Swap</h3>
      </div>

      {/* From Input */}
      <div className="space-y-1 relative mb-2">
        <div className="flex justify-between text-[9px] text-text-muted px-1">
          <span>You Pay</span>
          <span
            className="cursor-pointer hover:text-accent-pink"
            onClick={() => setAmount(fromToken.balance?.toString() || '0')}
          >
            Bal: {fromToken.balance?.toFixed(4) || 0}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-background-elevated border border-border rounded-xl px-3 py-2 focus-within:border-accent-pink/50">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-lg font-mono font-bold text-accent-pink focus:outline-none placeholder:text-accent-pink/20 min-w-0"
          />
          <button
            onClick={() => { setShowFromPicker(!showFromPicker); setShowToPicker(false) }}
            className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-border hover:border-accent-pink/30 transition-colors"
          >
            <img src={fromToken.logoURI} alt="" className="w-4 h-4 rounded-full" onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')} />
            <span className="text-xs font-bold">{fromToken.symbol}</span>
            <ChevronDown size={12} className={cn("transition-transform", showFromPicker && "rotate-180")} />
          </button>
        </div>
        <TokenPicker open={showFromPicker} onClose={() => setShowFromPicker(false)} onSelect={setFromMint} exclude={toMint} />
      </div>

      {/* Swap Button */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          onClick={togglePair}
          className="bg-background-card border border-accent-pink/20 p-1.5 rounded-lg text-accent-pink hover:text-white hover:border-accent-pink/50 transition-all"
        >
          <ArrowUpDown size={14} />
        </button>
      </div>

      {/* To Output */}
      <div className="space-y-1 relative mt-2">
        <div className="flex justify-between text-[9px] text-text-muted px-1">
          <span>You Receive</span>
          <span>Est.</span>
        </div>
        <div className="flex items-center gap-2 bg-background-elevated/50 border border-border/50 rounded-xl px-3 py-2">
          <span className="flex-1 text-lg font-mono font-bold text-accent-cyan">
            {estimatedOut > 0 ? estimatedOut.toFixed(6) : '0.00'}
          </span>
          <button
            onClick={() => { setShowToPicker(!showToPicker); setShowFromPicker(false) }}
            className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-border hover:border-accent-cyan/30 transition-colors"
          >
            <img src={toToken.logoURI} alt="" className="w-4 h-4 rounded-full" onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')} />
            <span className="text-xs font-bold">{toToken.symbol}</span>
            <ChevronDown size={12} className={cn("transition-transform", showToPicker && "rotate-180")} />
          </button>
        </div>
        <TokenPicker open={showToPicker} onClose={() => setShowToPicker(false)} onSelect={setToMint} exclude={fromMint} />
      </div>

      {/* Swap Button */}
      <Button
        onClick={handleSwap}
        disabled={!amount || parseFloat(amount) <= 0 || status === 'loading'}
        variant={status === 'success' ? 'success' : 'primary'}
        className="w-full mt-3"
      >
        {status === 'loading' ? (
          <><Activity size={16} className="animate-spin" /> Swapping...</>
        ) : status === 'success' ? (
          'Success!'
        ) : (
          <><Zap size={16} /> Swap</>
        )}
      </Button>
    </div>
  )
}
