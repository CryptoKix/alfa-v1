import React, { useState, useEffect } from 'react'
import { X, Zap, ShieldCheck, ShieldAlert, ExternalLink, Activity, Info } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { SnipedToken } from '@/features/sniper/sniperSlice'

interface ManualSnipeModalProps {
  isOpen: boolean
  onClose: () => void
  token: SnipedToken | null
}

export const ManualSnipeModal: React.FC<ManualSnipeModalProps> = ({ isOpen, onClose, token }) => {
  const dispatch = useAppDispatch()
  const { settings } = useAppSelector(state => state.sniper)
  
  const [buyAmount, setBuyAmount] = useState(settings.buyAmount.toString())
  const [slippage, setSlippage] = useState(settings.slippage.toString())
  const [priorityFee, setPriorityFee] = useState(settings.priorityFee.toString())
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (token) {
      setBuyAmount(settings.buyAmount.toString())
      setSlippage(settings.slippage.toString())
      setPriorityFee(settings.priorityFee.toString())
      setStatus('idle')
      setErrorMsg('')
    }
  }, [token, settings])

  if (!isOpen || !token) return null

  const handleExecute = async () => {
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: 'So11111111111111111111111111111111111111112', // SOL
          outputMint: token.mint,
          amount: parseFloat(buyAmount),
          strategy: `Manual Snipe: ${token.symbol}`,
          slippageBps: Math.floor(parseFloat(slippage) * 100),
          priorityFee: parseFloat(priorityFee)
        })
      })

      const data = await res.json()
      if (data.success) {
        setStatus('success')
        dispatch(addNotification({
          title: 'Snipe Successful',
          message: `Successfully sniped ${token.symbol}`,
          type: 'success'
        }))
        setTimeout(onClose, 2000)
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Execution failed')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg('Network error')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-background-card border border-white/10 rounded-3xl w-full max-w-md overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-background-elevated/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-cyan/10 rounded-xl text-accent-cyan">
              <Zap size={20} fill="currentColor" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Manual Snipe</h2>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-tighter">Tactical Execution Unit</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-text-muted hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Token Info Section */}
        <div className="p-6 space-y-6">
          <div className="bg-black/40 rounded-2xl border border-white/5 p-4 relative group">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-white tracking-tight">{token.symbol}</span>
                  {token.is_rug ? (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-pink/10 border border-accent-pink/20 text-accent-pink text-[8px] font-black uppercase">
                      <ShieldAlert size={10} /> High Risk
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-[8px] font-black uppercase">
                      <ShieldCheck size={10} /> Verified
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-text-muted font-mono">{token.mint}</span>
              </div>
              <a 
                href={`https://solscan.io/token/${token.mint}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-text-secondary hover:text-accent-cyan transition-all"
              >
                <ExternalLink size={16} />
              </a>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">DEX Venue</span>
                <span className="text-xs font-bold text-white">{token.dex_id}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Initial LP</span>
                <span className="text-xs font-bold text-accent-cyan">{token.initial_liquidity} SOL</span>
              </div>
            </div>
          </div>

          {/* Config Grid */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black/20 border border-white/5 rounded-2xl p-3 focus-within:border-accent-cyan/50 transition-colors">
                <label className="text-[8px] font-black text-text-muted uppercase tracking-widest block mb-1">Buy Amount</label>
                <div className="flex items-baseline gap-1">
                  <input 
                    type="number" 
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                    className="w-full bg-transparent border-none text-lg font-mono font-bold text-white outline-none"
                    placeholder="0.0"
                  />
                  <span className="text-[10px] font-bold text-text-muted uppercase">SOL</span>
                </div>
              </div>
              <div className="bg-black/20 border border-white/5 rounded-2xl p-3 focus-within:border-accent-pink/50 transition-colors">
                <label className="text-[8px] font-black text-text-muted uppercase tracking-widest block mb-1">Max Slippage</label>
                <div className="flex items-baseline gap-1">
                  <input 
                    type="number" 
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="w-full bg-transparent border-none text-lg font-mono font-bold text-white outline-none"
                    placeholder="15"
                  />
                  <span className="text-[10px] font-bold text-text-muted uppercase">%</span>
                </div>
              </div>
            </div>

            <div className="bg-accent-cyan/5 border border-accent-cyan/10 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <Activity size={12} className="text-accent-cyan" />
                  <span className="text-[9px] font-black text-white uppercase tracking-wider">Priority Tip (Jito)</span>
                </div>
                <span className="text-[8px] text-text-muted uppercase font-bold mt-0.5 tracking-tighter">Accelerated Inclusion</span>
              </div>
              <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
                <input 
                  type="number" 
                  value={priorityFee}
                  onChange={(e) => setPriorityFee(e.target.value)}
                  className="w-16 bg-transparent border-none text-xs font-mono font-bold text-accent-cyan outline-none text-right"
                  step="0.001"
                />
                <span className="text-[8px] font-bold text-text-muted uppercase">SOL</span>
              </div>
            </div>

            {status === 'error' && (
              <div className="bg-accent-pink/10 border border-accent-pink/20 rounded-xl p-3 flex items-start gap-2 animate-in slide-in-from-top-2">
                <ShieldAlert size={14} className="text-accent-pink shrink-0 mt-0.5" />
                <span className="text-[10px] text-accent-pink font-bold">{errorMsg}</span>
              </div>
            )}
            
            <div className="flex items-start gap-2 px-1">
              <Info size={12} className="text-text-muted shrink-0 mt-0.5" />
              <p className="text-[9px] text-text-muted leading-tight uppercase tracking-tighter">
                Manual execution bypasses automated filters. Verify token safety before confirming the transaction.
              </p>
            </div>
          </div>

          <button 
            onClick={handleExecute}
            disabled={status === 'loading' || status === 'success'}
            className={cn(
              "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.3em] transition-all relative overflow-hidden active:scale-95 group",
              status === 'loading' 
                ? "bg-white/5 text-white/20 cursor-not-allowed" 
                : status === 'success'
                  ? "bg-accent-green text-black"
                  : "bg-accent-cyan text-black hover:bg-white shadow-[0_0_30px_rgba(0,255,255,0.2)] hover:shadow-[0_0_50px_rgba(0,255,255,0.4)]"
            )}
          >
            {status === 'loading' ? (
              <div className="flex items-center justify-center gap-2">
                <Activity size={18} className="animate-spin" />
                <span>Broadcasting...</span>
              </div>
            ) : status === 'success' ? (
              "Transaction Confirmed"
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Zap size={18} fill="currentColor" />
                <span>Confirm Snipe</span>
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
