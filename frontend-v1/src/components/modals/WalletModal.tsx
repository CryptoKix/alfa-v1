import { useState } from 'react'
import { X, Copy, CheckCircle, AlertCircle, ArrowRight, Wallet } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

interface WalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export const WalletModal = ({ isOpen, onClose }: WalletModalProps) => {
  const { wallet, totalUsd } = useAppSelector(state => state.portfolio)
  const [activeTab, setActiveTab] = useState<'details' | 'send'>('details')
  
  // Send Form State
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [txSignature, setTxSignature] = useState('')

  if (!isOpen) return null

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet)
  }

  const handleSend = async () => {
    if (!recipient || !amount) return
    setStatus('sending')
    setErrorMsg('')
    
    try {
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient,
          amount: parseFloat(amount),
          mint: "So11111111111111111111111111111111111111112" // Default SOL
        })
      })
      
      const data = await res.json()
      
      if (data.success) {
        setStatus('success')
        setTxSignature(data.signature)
        setRecipient('')
        setAmount('')
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Transfer failed')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg('Network error')
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-background-card border border-accent-pink/30 rounded-lg w-full max-w-md relative overflow-hidden shadow-floating animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-accent-pink/30">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Wallet className="text-accent-cyan" size={20} />
            Wallet Manager
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-accent-pink/30">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              "flex-1 py-3 text-sm font-bold transition-colors relative",
              activeTab === 'details' ? "text-white" : "text-text-muted hover:text-text-secondary"
            )}
          >
            Overview
            {activeTab === 'details' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-purple" />}
          </button>
          <button
            onClick={() => setActiveTab('send')}
            className={cn(
              "flex-1 py-3 text-sm font-bold transition-colors relative",
              activeTab === 'send' ? "text-white" : "text-text-muted hover:text-text-secondary"
            )}
          >
            Send SOL
            {activeTab === 'send' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-cyan" />}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px]">
          {activeTab === 'details' ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-text-muted">Wallet Address</label>
                <div className="flex items-center justify-between p-3 bg-background-elevated rounded-lg border border-accent-pink/30 group">
                  <code className="text-sm text-accent-cyan break-all font-mono">{wallet}</code>
                  <button onClick={copyAddress} className="p-2 hover:bg-white/10 rounded-md transition-colors text-text-secondary hover:text-white">
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-text-muted">Total Balance</label>
                <div className="text-4xl font-black text-white tracking-tight">
                  ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              
              <div className="p-4 bg-accent-cyan/10 border border-accent-purple/20 rounded-xl text-xs text-text-secondary leading-relaxed">
                This is your primary bot wallet. Ensure it is funded with enough SOL for gas fees to execute automated strategies properly.
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {status === 'success' ? (
                 <div className="flex flex-col items-center justify-center text-center h-full py-8 space-y-4">
                   <div className="w-16 h-16 rounded-full bg-accent-green/20 flex items-center justify-center text-accent-green mb-2">
                     <CheckCircle size={32} />
                   </div>
                   <div>
                     <h3 className="text-xl font-bold text-white">Transfer Sent!</h3>
                     <a href={`https://solscan.io/tx/${txSignature}`} target="_blank" rel="noreferrer" className="text-xs text-accent-cyan hover:underline mt-2 block">
                       View Transaction
                     </a>
                   </div>
                   <button 
                     onClick={() => setStatus('idle')}
                     className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 border border-accent-pink/30 rounded-lg text-sm font-bold transition-colors"
                   >
                     Send Another
                   </button>
                 </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-widest text-text-muted">Recipient Address</label>
                      <input 
                        type="text" 
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="Solana Address..."
                        className="w-full bg-background-elevated border border-accent-pink/30 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-accent-cyan transition-colors font-mono placeholder:text-text-muted/50"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-widest text-text-muted">Amount (SOL)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-background-elevated border border-accent-pink/30 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-accent-cyan transition-colors font-mono"
                        />
                        <div className="absolute right-3 top-3 text-xs font-bold text-text-muted">SOL</div>
                      </div>
                    </div>
                  </div>

                  {status === 'error' && (
                    <div className="flex items-center gap-2 text-accent-red text-xs p-3 bg-accent-red/10 rounded-lg border border-accent-red/20">
                      <AlertCircle size={14} />
                      {errorMsg}
                    </div>
                  )}

                  <button
                    onClick={handleSend}
                    disabled={status === 'sending' || !recipient || !amount}
                    className="w-full py-3 bg-accent-cyan text-black font-bold rounded-xl hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-4"
                  >
                    {status === 'sending' ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        Confirm Transfer
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
