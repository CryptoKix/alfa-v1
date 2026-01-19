import { useState, useEffect, useCallback } from 'react'
import { X, Wallet, Server, Globe, CheckCircle, AlertCircle, Unplug, Key, ChevronRight, Loader2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setWalletMode, setSessionKeyActive, WalletMode } from '@/features/wallet/walletSlice'
import { createSessionKey, revokeSessionKey, getSessionKeyStatus } from '@/services/delegation'
import { cn } from '@/lib/utils'

interface WalletConnectModalProps {
  isOpen: boolean
  onClose: () => void
}

export const WalletConnectModal = ({ isOpen, onClose }: WalletConnectModalProps) => {
  const walletContext = useWallet()
  const { connected, publicKey, disconnect, wallet } = walletContext
  const { setVisible } = useWalletModal()
  const dispatch = useAppDispatch()

  const {
    mode,
    browserWalletAddress,
    serverWalletAddress,
    sessionKeyActive,
    sessionKeyInfo
  } = useAppSelector(state => state.wallet)

  const { walletAlias, totalUsd } = useAppSelector(state => state.portfolio)

  const [delegationLoading, setDelegationLoading] = useState(false)
  const [delegationError, setDelegationError] = useState<string | null>(null)

  // Check session key status when wallet connects
  const checkSessionStatus = useCallback(async () => {
    if (browserWalletAddress) {
      const status = await getSessionKeyStatus(browserWalletAddress)
      dispatch(setSessionKeyActive({
        active: status.active,
        info: status.info
      }))
    }
  }, [browserWalletAddress, dispatch])

  useEffect(() => {
    if (isOpen && connected) {
      checkSessionStatus()
    }
  }, [isOpen, connected, checkSessionStatus])

  const handleModeChange = (newMode: WalletMode) => {
    dispatch(setWalletMode(newMode))
  }

  const handleConnectWallet = () => {
    setVisible(true)
  }

  const handleDisconnect = async () => {
    await disconnect()
    dispatch(setWalletMode('server'))
    dispatch(setSessionKeyActive({ active: false }))
  }

  const handleEnableDelegation = async () => {
    if (!connected || !publicKey) return

    setDelegationLoading(true)
    setDelegationError(null)

    const result = await createSessionKey(walletContext, {
      durationHours: 24,
      maxTradeSize: 1000
    })

    setDelegationLoading(false)

    if (result.success) {
      dispatch(setSessionKeyActive({
        active: true,
        info: {
          sessionPubkey: result.sessionPubkey!,
          expiresAt: result.expiresAt!,
          permissions: result.permissions!
        }
      }))
    } else {
      setDelegationError(result.error || 'Failed to enable delegation')
    }
  }

  const handleRevokeDelegation = async () => {
    if (!browserWalletAddress) return

    setDelegationLoading(true)
    setDelegationError(null)

    const result = await revokeSessionKey(browserWalletAddress)

    setDelegationLoading(false)

    if (result.success) {
      dispatch(setSessionKeyActive({ active: false }))
    } else {
      setDelegationError(result.error || 'Failed to revoke delegation')
    }
  }

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-background-card border border-white/15 rounded-3xl w-full max-w-lg flex flex-col shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink z-20" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
          <h2 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
            <div className="p-2 bg-accent-purple/10 rounded-xl text-accent-purple">
              <Wallet size={20} />
            </div>
            Wallet Mode
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
          {/* Mode Selection */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest px-1">
              Active Wallet Mode
            </label>

            {/* Server Mode */}
            <button
              onClick={() => handleModeChange('server')}
              className={cn(
                "w-full p-4 rounded-xl border transition-all text-left group",
                mode === 'server'
                  ? "bg-accent-cyan/10 border-accent-cyan/30 shadow-[0_0_20px_rgba(0,255,255,0.1)]"
                  : "bg-background-elevated border-white/10 hover:border-white/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-2.5 rounded-xl transition-colors",
                    mode === 'server' ? "bg-accent-cyan/20 text-accent-cyan" : "bg-white/5 text-text-muted"
                  )}>
                    <Server size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      Server Wallet
                      {mode === 'server' && (
                        <span className="text-[8px] bg-accent-cyan/20 text-accent-cyan px-2 py-0.5 rounded-full font-black uppercase">Active</span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      Trades signed by server keypair (bots auto-execute)
                    </div>
                  </div>
                </div>
                {mode === 'server' && <CheckCircle size={18} className="text-accent-cyan" />}
              </div>
              {serverWalletAddress && (
                <div
                  className="mt-3 pt-3 border-t border-white/5 font-mono text-[10px] text-text-secondary cursor-pointer hover:text-accent-cyan transition-colors"
                  onClick={(e) => { e.stopPropagation(); copyAddress(serverWalletAddress) }}
                >
                  {serverWalletAddress.slice(0, 20)}...{serverWalletAddress.slice(-8)}
                </div>
              )}
            </button>

            {/* Browser Mode */}
            <button
              onClick={() => connected ? handleModeChange('browser') : handleConnectWallet()}
              className={cn(
                "w-full p-4 rounded-xl border transition-all text-left group",
                mode === 'browser'
                  ? "bg-accent-pink/10 border-accent-pink/30 shadow-[0_0_20px_rgba(255,0,255,0.1)]"
                  : "bg-background-elevated border-white/10 hover:border-white/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-2.5 rounded-xl transition-colors",
                    mode === 'browser' ? "bg-accent-pink/20 text-accent-pink" : "bg-white/5 text-text-muted"
                  )}>
                    <Globe size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      Browser Wallet
                      {mode === 'browser' && (
                        <span className="text-[8px] bg-accent-pink/20 text-accent-pink px-2 py-0.5 rounded-full font-black uppercase">Active</span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {connected ? 'Manual approval for each transaction' : 'Connect Phantom, Solflare, or Jupiter'}
                    </div>
                  </div>
                </div>
                {mode === 'browser' ? (
                  <CheckCircle size={18} className="text-accent-pink" />
                ) : !connected ? (
                  <ChevronRight size={18} className="text-text-muted group-hover:text-white transition-colors" />
                ) : null}
              </div>
              {connected && browserWalletAddress && (
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                  <div
                    className="font-mono text-[10px] text-text-secondary cursor-pointer hover:text-accent-pink transition-colors"
                    onClick={(e) => { e.stopPropagation(); copyAddress(browserWalletAddress) }}
                  >
                    {browserWalletAddress.slice(0, 20)}...{browserWalletAddress.slice(-8)}
                  </div>
                  {wallet?.adapter.icon && (
                    <img src={wallet.adapter.icon} alt={wallet.adapter.name} className="w-5 h-5 rounded" />
                  )}
                </div>
              )}
            </button>
          </div>

          {/* Session Key Delegation Status */}
          {connected && (
            <div className="p-4 bg-background-elevated rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key size={16} className={sessionKeyActive ? "text-accent-green" : "text-text-muted"} />
                  <span className="text-xs font-bold uppercase tracking-widest text-white">
                    Bot Delegation
                  </span>
                </div>
                {sessionKeyActive ? (
                  <span className="text-[9px] bg-accent-green/20 text-accent-green px-2 py-1 rounded-full font-black uppercase">
                    Active
                  </span>
                ) : (
                  <span className="text-[9px] bg-white/10 text-text-muted px-2 py-1 rounded-full font-black uppercase">
                    Disabled
                  </span>
                )}
              </div>

              <p className="text-[10px] text-text-secondary leading-relaxed">
                {sessionKeyActive
                  ? `Bots can auto-execute trades for your browser wallet. Expires: ${new Date(sessionKeyInfo?.expiresAt || 0).toLocaleString()}`
                  : 'Enable delegation to allow bots to trade from your browser wallet without manual approval for each transaction.'
                }
              </p>

              {delegationError && (
                <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-center gap-2">
                  <AlertCircle size={12} className="text-accent-red" />
                  <span className="text-[9px] text-accent-red">{delegationError}</span>
                </div>
              )}

              <button
                onClick={sessionKeyActive ? handleRevokeDelegation : handleEnableDelegation}
                disabled={delegationLoading}
                className={cn(
                  "w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  sessionKeyActive
                    ? "bg-accent-red/10 border border-accent-red/20 text-accent-red hover:bg-accent-red/20"
                    : "bg-accent-green/10 border border-accent-green/20 text-accent-green hover:bg-accent-green/20",
                  delegationLoading && "opacity-50 cursor-not-allowed"
                )}
              >
                {delegationLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {sessionKeyActive ? 'Revoking...' : 'Enabling...'}
                  </>
                ) : (
                  sessionKeyActive ? 'Revoke Delegation' : 'Enable Delegation'
                )}
              </button>
            </div>
          )}

          {/* Portfolio Summary */}
          <div className="p-4 bg-gradient-to-r from-accent-purple/10 to-accent-cyan/10 rounded-xl border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-widest">
                  {mode === 'server' ? 'Server' : 'Browser'} Wallet Balance
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-text-muted uppercase tracking-widest">Alias</div>
                <div className="text-sm font-bold text-white mt-1">{walletAlias}</div>
              </div>
            </div>
          </div>

          {/* Disconnect Button (only when browser wallet connected) */}
          {connected && (
            <button
              onClick={handleDisconnect}
              className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-text-secondary hover:text-accent-red hover:border-accent-red/30 hover:bg-accent-red/5 transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
            >
              <Unplug size={14} />
              Disconnect Browser Wallet
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
