import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Percent, CheckCircle, AlertCircle, Loader2, TrendingUp, Shield, DollarSign, Server, Wallet, ChevronDown } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { useWalletMode } from '@/hooks/useWalletMode'
import { useUnifiedWallet, useUnifiedWalletContext } from '@jup-ag/wallet-adapter'
import { VersionedTransaction, Connection } from '@solana/web3.js'

interface YieldOpportunity {
  protocol: string
  vault_address: string
  name: string
  deposit_token: string
  deposit_symbol: string
  apy: number
  tvl: number
  risk_level: 'low' | 'medium' | 'high'
  risk_factors: string[]
  min_deposit: number
  protocol_logo: string
  token_logo: string
}

interface YieldDepositModalProps {
  isOpen: boolean
  onClose: () => void
  opportunity: YieldOpportunity | null
}

const riskConfig = {
  high: { color: 'text-accent-purple', bg: 'bg-accent-purple/10', border: 'border-accent-purple/30', label: 'High Risk' },
  medium: { color: 'text-accent-pink', bg: 'bg-accent-pink/10', border: 'border-accent-pink/30', label: 'Medium Risk' },
  low: { color: 'text-accent-cyan', bg: 'bg-accent-cyan/10', border: 'border-accent-cyan/30', label: 'Low Risk' }
}

export const YieldDepositModal = ({ isOpen, onClose, opportunity }: YieldDepositModalProps) => {
  const { holdings } = useAppSelector(state => state.portfolio)
  const {
    mode,
    setMode,
    serverWalletAddress,
    browserWalletAddress,
    browserWalletConnected,
    canUseBrowserWallet,
    activeWalletAddress
  } = useWalletMode()

  const jupiterWallet = useUnifiedWallet()
  const { setShowModal } = useUnifiedWalletContext()

  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'building' | 'signing' | 'submitting' | 'success' | 'error'>('idle')
  const [txSignature, setTxSignature] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [showWalletSelector, setShowWalletSelector] = useState(false)

  // Server wallet is operational if we have an address
  const serverWalletOperational = !!serverWalletAddress

  // Determine which wallet to use
  const useServerWallet = mode === 'server' && serverWalletOperational
  const useBrowserWallet = mode === 'browser' && canUseBrowserWallet

  // Can deposit if either wallet mode is available
  const canDeposit = useServerWallet || useBrowserWallet

  // Find matching token in holdings
  const depositToken = useMemo(() => {
    if (!opportunity) return null
    return holdings.find(h =>
      h.symbol?.toLowerCase() === opportunity.deposit_symbol?.toLowerCase() ||
      h.mint === opportunity.deposit_token
    )
  }, [holdings, opportunity])

  const balance = depositToken?.balance || 0
  const tokenPrice = depositToken?.price || 0
  const depositValue = amount ? parseFloat(amount) * tokenPrice : 0

  // Calculate estimated returns
  const estimatedDaily = opportunity && amount ? (parseFloat(amount) * (opportunity.apy / 100) / 365) : 0
  const estimatedMonthly = estimatedDaily * 30
  const estimatedYearly = opportunity && amount ? parseFloat(amount) * (opportunity.apy / 100) : 0

  const formatApy = (apy: number) => {
    if (apy >= 100) return `${apy.toFixed(0)}%`
    if (apy >= 10) return `${apy.toFixed(1)}%`
    return `${apy.toFixed(2)}%`
  }

  const formatTvl = (tvl: number) => {
    if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`
    if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`
    if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(0)}K`
    return `$${tvl.toFixed(0)}`
  }

  const formatAddress = (addr: string | null) => {
    if (!addr) return ''
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`
  }

  const handleDeposit = async () => {
    if (!opportunity || !amount || parseFloat(amount) <= 0) return

    if (!canDeposit) {
      setStatus('error')
      setErrorMsg('No wallet available. Connect browser wallet or check server wallet.')
      return
    }

    const walletAddress = useServerWallet ? serverWalletAddress : browserWalletAddress

    setStatus('building')
    setStatusMessage('Building transaction...')
    setErrorMsg('')

    try {
      // Step 1: Build transaction from backend
      const buildRes = await fetch('/api/yield/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault_address: opportunity.vault_address,
          protocol: opportunity.protocol,
          amount: parseFloat(amount),
          deposit_token: opportunity.deposit_token,
          wallet_address: walletAddress
        })
      })

      const buildData = await buildRes.json()

      if (!buildData.success || !buildData.transaction) {
        setStatus('error')
        setErrorMsg(buildData.error || 'Failed to build transaction')
        return
      }

      let signature: string

      if (useServerWallet) {
        // Server wallet mode - send to backend for signing
        setStatus('submitting')
        setStatusMessage('Signing with server wallet...')

        const executeRes = await fetch('/api/yield/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction: buildData.transaction,
            action: 'deposit',
            positionData: {
              wallet_address: walletAddress,
              protocol: opportunity.protocol,
              vault_address: opportunity.vault_address,
              vault_name: opportunity.name,
              deposit_token: opportunity.deposit_token,
              deposit_symbol: opportunity.deposit_symbol,
              amount: parseFloat(amount),
              apy_at_deposit: opportunity.apy
            }
          })
        })

        const executeData = await executeRes.json()
        if (!executeData.success) {
          setStatus('error')
          setErrorMsg(executeData.error || 'Transaction failed')
          return
        }
        signature = executeData.signature

      } else {
        // Browser wallet mode - sign with Jupiter
        setStatus('signing')
        setStatusMessage('Please sign in your wallet...')

        if (!jupiterWallet.signTransaction) {
          setStatus('error')
          setErrorMsg('Wallet does not support signing')
          return
        }

        const txBuffer = Buffer.from(buildData.transaction, 'base64')
        const transaction = VersionedTransaction.deserialize(txBuffer)
        const signedTx = await jupiterWallet.signTransaction(transaction)

        // Submit
        setStatus('submitting')
        setStatusMessage('Submitting transaction...')

        const connection = new Connection(
          import.meta.env.VITE_RPC_URL || 'https://api.mainnet-beta.solana.com',
          'confirmed'
        )
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        })

        setStatusMessage('Confirming...')
        await connection.confirmTransaction(signature, 'confirmed')

        // Record position
        await fetch('/api/yield/positions/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: walletAddress,
            protocol: opportunity.protocol,
            vault_address: opportunity.vault_address,
            vault_name: opportunity.name,
            deposit_token: opportunity.deposit_token,
            deposit_symbol: opportunity.deposit_symbol,
            amount: parseFloat(amount),
            shares: 0,
            apy_at_deposit: opportunity.apy,
            signature,
            action: 'deposit'
          })
        })
      }

      setStatus('success')
      setTxSignature(signature)
    } catch (e: any) {
      console.error('Deposit error:', e)
      setStatus('error')
      if (e.message?.includes('User rejected') || e.message?.includes('rejected')) {
        setErrorMsg('Transaction cancelled')
      } else {
        setErrorMsg(e.message || 'Deposit failed')
      }
    }
  }

  const handleReset = () => {
    setStatus('idle')
    setAmount('')
    setTxSignature('')
    setErrorMsg('')
  }

  if (!isOpen || !opportunity) return null

  const risk = riskConfig[opportunity.risk_level]

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-background-card border border-accent-cyan/20 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient Top Line */}
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple via-accent-pink to-accent-cyan z-20" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-accent-cyan/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent-cyan/10 rounded-xl border border-accent-cyan/20">
              <Percent size={20} className="text-accent-cyan" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Deposit</h2>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">{opportunity.protocol.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-text-muted hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {status === 'success' ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="w-16 h-16 bg-accent-cyan/10 rounded-full flex items-center justify-center border border-accent-cyan/30">
                <CheckCircle size={32} className="text-accent-cyan" />
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">Deposit Successful</h3>
              <p className="text-sm text-text-secondary">
                Deposited <span className="text-accent-cyan font-bold">{amount} {opportunity.deposit_symbol}</span> into {opportunity.name}
              </p>
              {txSignature && (
                <a
                  href={`https://solscan.io/tx/${txSignature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent-cyan hover:underline font-mono"
                >
                  View on Explorer
                </a>
              )}
              <button
                onClick={() => { handleReset(); onClose(); }}
                className="mt-4 px-6 py-2 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 rounded-xl text-xs font-bold uppercase tracking-widest text-accent-cyan transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Wallet Mode Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowWalletSelector(!showWalletSelector)}
                  className="w-full bg-background-dark/50 border border-accent-cyan/10 rounded-xl p-3 flex items-center justify-between hover:border-accent-cyan/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {mode === 'server' ? (
                      <Server size={16} className={serverWalletOperational ? 'text-accent-cyan' : 'text-text-muted'} />
                    ) : (
                      <Wallet size={16} className={canUseBrowserWallet ? 'text-accent-cyan' : 'text-text-muted'} />
                    )}
                    <div className="text-left">
                      <p className="text-xs font-bold text-white">
                        {mode === 'server' ? 'Server Wallet' : 'Browser Wallet'}
                      </p>
                      <p className="text-[10px] text-text-muted font-mono">
                        {mode === 'server'
                          ? (serverWalletOperational ? formatAddress(serverWalletAddress) : 'Not configured')
                          : (canUseBrowserWallet ? formatAddress(browserWalletAddress) : 'Not connected')
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      (mode === 'server' && serverWalletOperational) || (mode === 'browser' && canUseBrowserWallet)
                        ? "bg-accent-cyan animate-pulse"
                        : "bg-text-muted"
                    )} />
                    <ChevronDown size={14} className={cn("text-text-muted transition-transform", showWalletSelector && "rotate-180")} />
                  </div>
                </button>

                {/* Dropdown */}
                {showWalletSelector && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-background-card border border-accent-cyan/20 rounded-xl overflow-hidden z-10 animate-in fade-in slide-in-from-top-2">
                    {/* Server Wallet Option */}
                    <button
                      onClick={() => { setMode('server'); setShowWalletSelector(false); }}
                      className={cn(
                        "w-full p-3 flex items-center gap-3 hover:bg-accent-cyan/5 transition-colors",
                        mode === 'server' && "bg-accent-cyan/10"
                      )}
                    >
                      <Server size={16} className={serverWalletOperational ? 'text-accent-cyan' : 'text-text-muted'} />
                      <div className="text-left flex-1">
                        <p className="text-xs font-bold text-white">Server Wallet</p>
                        <p className="text-[10px] text-text-muted">
                          {serverWalletOperational
                            ? `Auto-sign • ${formatAddress(serverWalletAddress)}`
                            : 'Not configured'
                          }
                        </p>
                      </div>
                      {serverWalletOperational && (
                        <span className="w-2 h-2 rounded-full bg-accent-cyan" />
                      )}
                    </button>

                    {/* Browser Wallet Option */}
                    <button
                      onClick={() => {
                        setMode('browser')
                        setShowWalletSelector(false)
                        if (!browserWalletConnected) {
                          // Close this modal first, then open Jupiter wallet modal
                          onClose()
                          setTimeout(() => setShowModal(true), 100)
                        }
                      }}
                      className={cn(
                        "w-full p-3 flex items-center gap-3 hover:bg-accent-cyan/5 transition-colors border-t border-accent-cyan/10",
                        mode === 'browser' && "bg-accent-cyan/10"
                      )}
                    >
                      <Wallet size={16} className={canUseBrowserWallet ? 'text-accent-pink' : 'text-text-muted'} />
                      <div className="text-left flex-1">
                        <p className="text-xs font-bold text-white">Browser Wallet</p>
                        <p className="text-[10px] text-text-muted">
                          {canUseBrowserWallet
                            ? `Manual sign • ${formatAddress(browserWalletAddress)}`
                            : 'Click to connect'
                          }
                        </p>
                      </div>
                      {canUseBrowserWallet && (
                        <span className="w-2 h-2 rounded-full bg-accent-pink" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Vault Info Card */}
              <div className="bg-background-dark/50 border border-accent-cyan/10 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={opportunity.protocol_logo}
                      alt={opportunity.protocol}
                      className="w-10 h-10 rounded-xl bg-accent-cyan/10 p-1.5"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    <div>
                      <p className="text-base font-bold text-white">{opportunity.name}</p>
                      <p className="text-xs text-text-muted">{opportunity.deposit_symbol}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-mono font-black text-accent-cyan">{formatApy(opportunity.apy)}</p>
                    <p className="text-[10px] text-text-muted uppercase">APY</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-accent-cyan/10">
                  <span className={cn("px-2 py-1 rounded-lg text-[10px] font-bold uppercase border", risk.bg, risk.border, risk.color)}>
                    {risk.label}
                  </span>
                  <span className="text-[10px] text-text-muted">TVL: {formatTvl(opportunity.tvl)}</span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Deposit Amount</label>
                  <div className="text-[10px] text-text-muted">
                    Balance: <span
                      onClick={() => setAmount(balance.toString())}
                      className="text-accent-cyan cursor-pointer hover:underline font-mono"
                    >
                      {balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {opportunity.deposit_symbol}
                    </span>
                  </div>
                </div>
                <div className="bg-background-dark border border-accent-cyan/10 rounded-xl px-4 flex items-center gap-3 h-14 focus-within:border-accent-cyan/40 transition-colors">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-transparent text-xl font-mono font-bold text-white w-full focus:outline-none placeholder:text-text-muted/30"
                  />
                  <div className="text-xs font-bold text-text-muted px-3 py-1.5 bg-accent-cyan/5 rounded-lg border border-accent-cyan/10">
                    {opportunity.deposit_symbol}
                  </div>
                </div>
                {depositValue > 0 && (
                  <div className="text-right text-[10px] text-text-muted font-mono">
                    ≈ ${depositValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
              </div>

              {/* Estimated Returns */}
              {amount && parseFloat(amount) > 0 && (
                <div className="bg-background-dark/50 border border-accent-cyan/10 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp size={12} className="text-accent-cyan" />
                    Estimated Returns
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-background-card/50 rounded-lg p-3 text-center border border-accent-cyan/5">
                      <p className="text-lg font-mono font-bold text-accent-cyan">
                        {estimatedDaily.toFixed(4)}
                      </p>
                      <p className="text-[9px] text-text-muted uppercase">Daily</p>
                    </div>
                    <div className="bg-background-card/50 rounded-lg p-3 text-center border border-accent-cyan/5">
                      <p className="text-lg font-mono font-bold text-accent-cyan">
                        {estimatedMonthly.toFixed(2)}
                      </p>
                      <p className="text-[9px] text-text-muted uppercase">Monthly</p>
                    </div>
                    <div className="bg-background-card/50 rounded-lg p-3 text-center border border-accent-cyan/5">
                      <p className="text-lg font-mono font-bold text-accent-cyan">
                        {estimatedYearly.toFixed(2)}
                      </p>
                      <p className="text-[9px] text-text-muted uppercase">Yearly</p>
                    </div>
                  </div>
                  <p className="text-[9px] text-text-muted text-center italic">
                    *Estimates based on current APY. Actual returns may vary.
                  </p>
                </div>
              )}

              {/* Risk Factors */}
              {opportunity.risk_factors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-2 px-1">
                    <Shield size={12} />
                    Risk Factors
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {opportunity.risk_factors.map((factor, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-accent-cyan/5 border border-accent-cyan/10 rounded-lg text-[10px] text-text-secondary"
                      >
                        {factor.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {status === 'error' && (
                <div className="p-3 bg-accent-pink/10 border border-accent-pink/20 rounded-xl flex items-center gap-3 animate-in fade-in">
                  <AlertCircle size={16} className="text-accent-pink shrink-0" />
                  <span className="text-xs font-bold text-accent-pink">{errorMsg}</span>
                </div>
              )}

              {/* Deposit Button */}
              <button
                onClick={handleDeposit}
                disabled={!canDeposit || (status !== 'idle' && status !== 'error') || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
                className={cn(
                  "w-full py-4 rounded-xl font-black text-sm uppercase tracking-[0.15em] transition-all duration-300 flex items-center justify-center gap-3",
                  !canDeposit || (status !== 'idle' && status !== 'error') || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance
                    ? "bg-white/5 text-white/20 cursor-not-allowed border border-accent-cyan/10"
                    : "bg-accent-cyan text-black hover:bg-white border border-accent-cyan shadow-[0_0_20px_rgba(0,255,255,0.2)]"
                )}
              >
                {status === 'building' || status === 'signing' || status === 'submitting' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {statusMessage || 'Processing...'}
                  </>
                ) : (
                  <>
                    <DollarSign size={18} />
                    Confirm Deposit
                  </>
                )}
              </button>

              {parseFloat(amount) > balance && balance > 0 && (
                <p className="text-[10px] text-accent-pink text-center">Insufficient balance</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
