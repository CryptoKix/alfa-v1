import { useState, useMemo, useEffect } from 'react'
import { Plus, X, ChevronDown, Search } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { cn } from '@/lib/utils'

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
  const [searchQuery, setSearchQuery] = useState('')

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

  const inputToken = tokens.find(t => t.mint === newInputMint) || (newInputMint ? { symbol: 'CUSTOM', mint: newInputMint, logoURI: null } : null)
  const outputToken = tokens.find(t => t.mint === newOutputMint) || (newOutputMint ? { symbol: 'CUSTOM', mint: newOutputMint, logoURI: null } : null)

  useEffect(() => {
    if (!isOpen) {
        setIsInputTokenOpen(false)
        setIsOutputTokenOpen(false)
        setSearchQuery('')
    }
  }, [isOpen])

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

  const TokenSelector = ({ 
    isOpen, 
    onToggle, 
    selectedMint, 
    onSelect, 
    label 
  }: { 
    isOpen: boolean, 
    onToggle: () => void, 
    selectedMint: string, 
    onSelect: (mint: string) => void,
    label: string
  }) => {
    const selectedToken = tokens.find(t => t.mint === selectedMint) || (selectedMint ? { symbol: 'CUSTOM', mint: selectedMint, logoURI: null } : null)

    const filteredTokens = useMemo(() => {
        if (!searchQuery) return tokens
        return tokens.filter(t => 
            t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
            t.mint.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [tokens, searchQuery])

    const isCustomMint = searchQuery.length > 30 && !filteredTokens.find(t => t.mint === searchQuery)

    return (
        <div className="space-y-2 relative">
            <label className="text-[10px] uppercase text-text-muted font-bold px-1 tracking-widest">{label}</label>
            <button 
                onClick={() => {
                    onToggle()
                    setSearchQuery('')
                }}
                className={cn(
                    "w-full bg-black/40 border rounded-xl px-4 h-14 flex items-center justify-between text-white text-base font-bold transition-all outline-none",
                    isOpen ? "border-accent-cyan/50 bg-black/60" : "border-white/10 hover:bg-black/60"
                )}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                {selectedToken ? (
                  <>
                    <img 
                        src={selectedToken.logoURI || `https://static.jup.ag/tokens/gen/${selectedToken.mint}.png`} 
                        className="w-6 h-6 rounded-full shrink-0" 
                        onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')}
                    />
                    <div className="flex flex-col items-start truncate">
                        <span>{selectedToken.symbol}</span>
                        {selectedToken.symbol === 'CUSTOM' && <span className="text-[10px] text-text-muted font-mono">{selectedToken.mint.slice(0, 8)}...</span>}
                    </div>
                  </>
                ) : <span className="text-text-muted opacity-50">Select Token</span>}
              </div>
              <ChevronDown size={18} className={cn("text-text-muted transition-transform", isOpen && "rotate-180")} />
            </button>
            
            {isOpen && (
              <div className="absolute top-full left-0 right-0 z-50 bg-background-elevated border border-white/10 rounded-xl shadow-2xl p-2 mt-2 backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
                <div className="mb-2 px-2 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted w-3.5 h-3.5" />
                    <input 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search symbol or paste mint..."
                        autoFocus
                        className="w-full bg-black/20 border border-white/5 rounded-lg py-2 pl-8 pr-2 text-xs text-white focus:border-accent-cyan/30 outline-none placeholder:text-text-muted"
                    />
                </div>
                
                <div className="max-h-60 overflow-auto custom-scrollbar space-y-1">
                    {isCustomMint && (
                        <button 
                            onClick={() => onSelect(searchQuery)}
                            className="w-full flex items-center justify-between p-2 hover:bg-accent-cyan/10 rounded-lg transition-colors group border border-dashed border-accent-cyan/30 hover:border-accent-cyan/50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-accent-cyan/20 flex items-center justify-center text-[10px] text-accent-cyan font-bold">?</div>
                                <div className="flex flex-col items-start">
                                    <div className="text-sm font-bold text-accent-cyan">Use Custom Mint</div>
                                    <div className="text-[10px] font-mono text-text-muted">{searchQuery.slice(0, 16)}...</div>
                                </div>
                            </div>
                        </button>
                    )}

                    {filteredTokens.length === 0 && !isCustomMint ? (
                        <div className="p-4 text-center text-[10px] text-text-muted italic">No tokens found</div>
                    ) : (
                        filteredTokens.map(t => (
                            <button key={t.mint} onClick={() => onSelect(t.mint)} className="w-full flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group border border-transparent hover:border-white/5">
                                <div className="flex items-center gap-3 min-w-0">
                                    <img src={t.logoURI || `https://static.jup.ag/tokens/gen/${t.mint}.png`} alt={t.symbol} className="w-6 h-6 rounded-full shrink-0" onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')} />
                                    <div className="flex flex-col items-start min-w-0">
                                        <div className="text-sm font-bold text-white truncate">{t.symbol}</div>
                                        <div className="text-[10px] text-text-muted font-mono truncate max-w-[120px] opacity-0 group-hover:opacity-100 transition-opacity">{t.mint}</div>
                                    </div>
                                </div>
                                <div className="text-xs font-mono text-text-muted whitespace-nowrap">{t.balance?.toFixed(2) || ''}</div>
                            </button>
                        ))
                    )}
                </div>
              </div>
            )}
        </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose}
      />
      <div className="bg-background-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative z-10">
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
          <TokenSelector 
            label="Base Asset" 
            isOpen={isInputTokenOpen} 
            onToggle={() => { setIsInputTokenOpen(!isInputTokenOpen); setIsOutputTokenOpen(false) }}
            selectedMint={newInputMint}
            onSelect={(mint) => { setNewInputMint(mint); setIsInputTokenOpen(false) }}
          />

          <TokenSelector 
            label="Target Asset" 
            isOpen={isOutputTokenOpen} 
            onToggle={() => { setIsOutputTokenOpen(!isOutputTokenOpen); setIsInputTokenOpen(false) }}
            selectedMint={newOutputMint}
            onSelect={(mint) => { setNewOutputMint(mint); setIsOutputTokenOpen(false) }}
          />

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
