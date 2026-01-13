import { useState, useMemo } from 'react'
import { X, Send, ChevronDown, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

interface SendModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SendModal = ({ isOpen, onClose }: SendModalProps) => {
  const { holdings } = useAppSelector(state => state.portfolio)
  const prices = useAppSelector(state => state.prices.prices)
  
  // Available Tokens: Merge current holdings with defaults if needed, but mainly use holdings
  const tokens = useMemo(() => {
    // Ensure SOL is always available even if 0 balance (though usually it is in holdings)
    const defaults = [
      { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL' }
    ]
    
    const combined = [...holdings]
    defaults.forEach(d => {
      if (!combined.find(c => c.mint === d.mint)) {
        combined.push({ ...d, balance: 0, price: 0, value: 0 } as any)
      }
    })
    return combined.sort((a, b) => (b.value || 0) - (a.value || 0))
  }, [holdings])

  const [selectedMint, setSelectedMint] = useState('So11111111111111111111111111111111111111112')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [isTokenOpen, setIsTokenOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [txSignature, setTxSignature] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const selectedToken = tokens.find(t => t.mint === selectedMint) || tokens[0]
  const currentPrice = prices[selectedMint] || selectedToken.price || 0
  const usdValue = amount ? parseFloat(amount) * currentPrice : 0

  const handleSend = async () => {
    if (!recipient || !amount) return
    setStatus('loading')
    setErrorMsg('')
    setTxSignature('')

    try {
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient,
          amount: parseFloat(amount),
          mint: selectedMint
        })
      })

      const data = await res.json()
      
      if (data.success) {
        setStatus('success')
        setTxSignature(data.signature)
        // Reset form after delay? Or keep open to show success?
        // Let's keep open with success state.
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Transfer failed')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg('Network error')
    }
  }

  const handleMax = () => {
    if (selectedToken) {
      setAmount(selectedToken.balance.toString())
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-background-card border border-white/15 rounded-3xl w-full max-w-md flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-accent-purple to-accent-cyan z-20" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0 bg-background-card relative z-10">
          <h2 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
            <div className="p-2 bg-accent-purple/10 rounded-xl text-accent-purple shadow-[0_0_15px_rgba(153,69,255,0.1)]">
              <Send size={20} />
            </div>
            Send Assets
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-text-muted hover:text-white transition-all transform hover:rotate-90"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {status === 'success' ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="w-16 h-16 bg-accent-green/10 rounded-full flex items-center justify-center text-accent-green mb-2">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">Transfer Sent</h3>
              <p className="text-sm text-text-secondary">
                Successfully sent <span className="text-white font-bold">{amount} {selectedToken.symbol}</span>
              </p>
              <div className="flex items-center gap-2 mt-4">
                <a 
                  href={`https://solscan.io/tx/${txSignature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent-cyan hover:underline font-mono"
                >
                  View on Explorer
                </a>
              </div>
              <button 
                onClick={() => {
                  setStatus('idle')
                  setAmount('')
                  setRecipient('')
                  setTxSignature('')
                }}
                className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Send Another
              </button>
            </div>
          ) : (
            <>
              {/* Asset Selection */}
              <div className="space-y-2 relative">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Asset</label>
                <button 
                  onClick={() => setIsTokenOpen(!isTokenOpen)}
                  className="w-full bg-background-elevated border border-white/10 rounded-xl p-3 flex items-center justify-between hover:border-accent-purple/50 transition-colors h-14 group"
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={selectedToken.logoURI || 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png'}
                      alt={selectedToken.symbol}
                      className="w-8 h-8 rounded-full shadow-sm"
                      onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')}
                    />
                    <div className="text-left">
                      <div className="text-sm font-bold text-white group-hover:text-accent-purple transition-colors">{selectedToken.symbol}</div>
                      <div className="text-[10px] text-text-muted">Balance: {selectedToken.balance.toLocaleString()}</div>
                    </div>
                  </div>
                  <ChevronDown size={16} className={cn("text-text-muted transition-transform", isTokenOpen && "rotate-180")} />
                </button>

                {isTokenOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsTokenOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-2 z-30 bg-background-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 max-h-60 overflow-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                      <div className="text-[8px] uppercase tracking-widest text-text-muted font-bold px-2 py-1 mb-1 border-b border-white/5">Select Token</div>
                      {tokens.map(t => (
                        <button 
                          key={t.mint} 
                          onClick={() => { setSelectedMint(t.mint); setIsTokenOpen(false); }}
                          className={cn(
                            "w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group",
                            selectedMint === t.mint && "bg-accent-purple/10"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <img 
                              src={t.logoURI}
                              alt={t.symbol}
                              className="w-6 h-6 rounded-full"
                              onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')}
                            />
                            <div className="text-left">
                              <div className="text-xs font-bold text-white group-hover:text-accent-purple">{t.symbol}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono text-white">{t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Recipient */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Recipient Address</label>
                <div className="bg-background-elevated border border-white/10 rounded-xl px-3 flex items-center h-12 focus-within:border-accent-purple transition-colors">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Solana Address..."
                    className="bg-transparent text-sm font-mono text-white w-full focus:outline-none placeholder:text-text-muted/50"
                  />
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Amount</label>
                  <div className="text-[10px] text-text-muted">
                    Max: <span onClick={handleMax} className="text-accent-cyan cursor-pointer hover:underline">{selectedToken.balance}</span>
                  </div>
                </div>
                <div className="bg-background-elevated border border-white/10 rounded-xl px-3 flex items-center gap-3 h-14 focus-within:border-accent-purple transition-colors">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-transparent text-xl font-mono font-bold text-white w-full focus:outline-none placeholder:text-white/10"
                  />
                  <div className="text-xs font-bold text-text-muted px-2 py-1 bg-black/20 rounded border border-white/5">
                    {selectedToken.symbol}
                  </div>
                </div>
                <div className="text-right text-[10px] text-text-muted font-mono">
                  ≈ ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Error Message */}
              {status === 'error' && (
                <div className="p-3 bg-accent-red/10 border border-accent-red/20 rounded-xl flex items-center gap-3 animate-in fade-in">
                  <AlertCircle size={16} className="text-accent-red shrink-0" />
                  <span className="text-xs font-bold text-accent-red">{errorMsg}</span>
                </div>
              )}

              {/* Send Button */}
              <button 
                onClick={handleSend}
                disabled={status === 'loading' || !recipient || !amount}
                className={cn(
                  "w-full py-4 rounded-xl font-black text-sm uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-3 mt-4",
                  status === 'loading' || !recipient || !amount
                    ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                    : "bg-accent-purple text-white hover:bg-white hover:text-black shadow-[0_0_20px_rgba(153,69,255,0.3)] hover:shadow-[0_0_35px_rgba(153,69,255,0.5)] border border-accent-purple"
                )}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Processing Transfer...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Confirm Transfer
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
