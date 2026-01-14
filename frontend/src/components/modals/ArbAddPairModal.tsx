import { useState, useMemo } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { addNotification } from '@/features/notifications/notificationsSlice'

interface ArbAddPairModalProps {
  isOpen: boolean
  onClose: () => void
  dbTokens: any[]
}

export const ArbAddPairModal = ({ isOpen, onClose, dbTokens }: ArbAddPairModalProps) => {
  const dispatch = useAppDispatch()
  const { holdings } = useAppSelector(state => state.portfolio)
  
  const [newInputMint, setNewInputMint] = useState('')
  const [newOutputMint, setNewOutputMint] = useState('')
  const [newAmount, setNewAmount] = useState('')
  
  const [isInputTokenOpen, setIsInputTokenOpen] = useState(false)
  const [isOutputTokenOpen, setIsOutputTokenOpen] = useState(false)

  // Merge DB tokens with current holdings for a comprehensive list
  const tokens = useMemo(() => {
    const combined = [...dbTokens]
    holdings.forEach(h => {
      if (!combined.find(c => c.mint === h.mint)) {
        combined.push({ ...h, balance: h.balance } as any)
      }
    })
    // Sort so tokens with balance are higher or SOL is first
    return combined.sort((a, b) => {
      if (a.symbol === 'SOL') return -1
      if (b.symbol === 'SOL') return 1
      return (b.balance || 0) - (a.balance || 0)
    })
  }, [dbTokens, holdings])

  const inputToken = tokens.find(t => t.mint === newInputMint)
  const outputToken = tokens.find(t => t.mint === newOutputMint)

  const handleAddPair = async () => {
    if (!newInputMint || !newOutputMint || !newAmount) return

    try {
      const res = await fetch('/api/arb/pairs/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputMint: newInputMint, outputMint: newOutputMint, amount: parseFloat(newAmount) })
      })
      if (res.ok) {
        dispatch(addNotification({ title: 'Pair Added', message: 'Monitoring target updated', type: 'success' }))
        onClose()
      } else {
        dispatch(addNotification({ title: 'Error', message: 'Failed to add pair', type: 'error' }))
      }
    } catch (e) {
      dispatch(addNotification({ title: 'Error', message: 'Network error', type: 'error' }))
    }
  }

  const TokenItem = ({ token, onClick }: { token: any, onClick: () => void }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition-colors group border border-transparent hover:border-white/5">
      <div className="flex items-center gap-3">
        <img src={token.logoURI || `https://static.jup.ag/tokens/gen/${token.mint}.png`} alt={token.symbol} className="w-6 h-6 rounded-full" onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')} />
        <div className="text-sm font-bold text-white">{token.symbol}</div>
      </div>
      <div className="text-xs font-mono text-text-muted">{token.balance?.toFixed(2) || '0.00'}</div>
    </button>
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
          <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Plus size={16} className="text-accent-cyan" />
            Add Target Pair
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Base Asset */}
          <div className="space-y-2 relative">
            <label className="text-[10px] uppercase text-text-muted font-bold px-1 tracking-widest">Base Asset</label>
            <button onClick={() => setIsInputTokenOpen(!isInputTokenOpen)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 h-14 flex items-center justify-between text-white text-base font-bold hover:bg-black/60 transition-all focus:border-accent-cyan/50 outline-none">
              <div className="flex items-center gap-3">
                {inputToken ? (
                  <>
                    <img src={inputToken.logoURI || `https://static.jup.ag/tokens/gen/${inputToken.mint}.png`} className="w-6 h-6 rounded-full" />
                    <span>{inputToken.symbol}</span>
                  </>
                ) : <span className="text-text-muted opacity-50">Select Base Token</span>}
              </div>
              <ChevronDown size={18} className="text-text-muted" />
            </button>
            {isInputTokenOpen && (
              <div className="absolute top-full left-0 right-0 z-50 bg-background-elevated border border-white/10 rounded-xl shadow-2xl p-2 max-h-60 overflow-auto mt-2 backdrop-blur-xl custom-scrollbar">
                {tokens.map(t => <TokenItem key={t.mint} token={t} onClick={() => { setNewInputMint(t.mint); setIsInputTokenOpen(false) }} />)}
              </div>
            )}
          </div>

          {/* Target Asset */}
          <div className="space-y-2 relative">
            <label className="text-[10px] uppercase text-text-muted font-bold px-1 tracking-widest">Target Asset</label>
            <button onClick={() => setIsOutputTokenOpen(!isOutputTokenOpen)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 h-14 flex items-center justify-between text-white text-base font-bold hover:bg-black/60 transition-all focus:border-accent-cyan/50 outline-none">
              <div className="flex items-center gap-3">
                {outputToken ? (
                  <>
                    <img src={outputToken.logoURI || `https://static.jup.ag/tokens/gen/${outputToken.mint}.png`} className="w-6 h-6 rounded-full" />
                    <span>{outputToken.symbol}</span>
                  </>
                ) : <span className="text-text-muted opacity-50">Select Target Token</span>}
              </div>
              <ChevronDown size={18} className="text-text-muted" />
            </button>
            {isOutputTokenOpen && (
              <div className="absolute top-full left-0 right-0 z-50 bg-background-elevated border border-white/10 rounded-xl shadow-2xl p-2 max-h-60 overflow-auto mt-2 backdrop-blur-xl custom-scrollbar">
                {tokens.map(t => <TokenItem key={t.mint} token={t} onClick={() => { setNewOutputMint(t.mint); setIsOutputTokenOpen(false) }} />)}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase text-text-muted font-bold px-1 tracking-widest">Test Amount</label>
            <div className="relative">
              <input 
                value={newAmount} 
                onChange={e => setNewAmount(e.target.value)} 
                placeholder="0.00" 
                type="number" 
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 h-14 text-lg font-mono font-bold text-white focus:border-accent-cyan/50 outline-none placeholder:text-white/10" 
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                {inputToken?.symbol || ''}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-white/[0.02]">
          <button 
            onClick={handleAddPair} 
            disabled={!newInputMint || !newOutputMint || !newAmount}
            className="w-full bg-accent-cyan text-black rounded-xl font-black uppercase text-sm h-12 shadow-[0_0_20px_rgba(0,255,255,0.3)] hover:shadow-[0_0_30px_rgba(0,255,255,0.5)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Add Monitoring Pair
          </button>
        </div>
      </div>
    </div>
  )
}
