import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { clearRebalanceSuggestion, DLMMPosition } from '@/features/dlmm/dlmmSlice'
import {
  Wallet, RefreshCw, TrendingUp, TrendingDown, DollarSign,
  AlertTriangle, ChevronDown, ChevronUp, Coins, X, Loader2, ArrowDownToLine
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axios from 'axios'
import { useWallet } from '@jup-ag/wallet-adapter'

interface DLMMManagerWidgetProps {
  positions: DLMMPosition[]
  wallet: string | null
  onRefresh: () => void
}

export default function DLMMManagerWidget({ positions, wallet, onRefresh }: DLMMManagerWidgetProps) {
  const dispatch = useAppDispatch()
  const jupiterWallet = useWallet()
  const rebalanceSuggestions = useAppSelector(state => state.dlmm.rebalanceSuggestions)

  const [expandedPosition, setExpandedPosition] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [refreshingPosition, setRefreshingPosition] = useState<string | null>(null)

  const activePositions = positions.filter(p => p.status === 'active')
  const closedPositions = positions.filter(p => p.status === 'closed')

  const handleRefreshPosition = async (position: DLMMPosition) => {
    setRefreshingPosition(position.position_pubkey)
    try {
      await axios.post(`/api/dlmm/positions/${position.position_pubkey}/refresh`)
      onRefresh()
    } catch (e) {
      console.error('Failed to refresh position:', e)
    } finally {
      setRefreshingPosition(null)
    }
  }

  const handleClaimFees = async (position: DLMMPosition) => {
    if (!wallet || !jupiterWallet.signTransaction) {
      dispatch(addNotification({
        title: 'Wallet Required',
        message: 'Please connect your wallet',
        type: 'error'
      }))
      return
    }

    setLoadingAction(`claim-${position.position_pubkey}`)
    try {
      // Build claim transaction
      const buildRes = await axios.post('/api/dlmm/position/claim-fees', {
        pool_address: position.pool_address,
        position_pubkey: position.position_pubkey,
        user_wallet: wallet
      })

      if (!buildRes.data.success) {
        throw new Error(buildRes.data.error)
      }

      // Sign and submit
      const { VersionedTransaction } = await import('@solana/web3.js')
      const txBuffer = Buffer.from(buildRes.data.transaction, 'base64')
      const transaction = VersionedTransaction.deserialize(txBuffer)
      const signedTx = await jupiterWallet.signTransaction(transaction)

      const { Connection } = await import('@solana/web3.js')
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      await connection.confirmTransaction(signature, 'confirmed')

      // Record
      await axios.post('/api/dlmm/position/submit-signed', {
        action: 'claim_fees',
        signature,
        user_wallet: wallet,
        position_pubkey: position.position_pubkey,
        claimed_x: position.unclaimed_fees_x,
        claimed_y: position.unclaimed_fees_y
      })

      dispatch(addNotification({
        title: 'Fees Claimed',
        message: `Successfully claimed fees from ${position.pool_name || 'position'}`,
        type: 'success'
      }))

      onRefresh()
    } catch (e: any) {
      dispatch(addNotification({
        title: 'Claim Failed',
        message: e.message || 'Failed to claim fees',
        type: 'error'
      }))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleClosePosition = async (position: DLMMPosition) => {
    if (!wallet || !jupiterWallet.signTransaction) {
      dispatch(addNotification({
        title: 'Wallet Required',
        message: 'Please connect your wallet',
        type: 'error'
      }))
      return
    }

    if (!confirm('Are you sure you want to close this position? This will withdraw all liquidity and claim all fees.')) {
      return
    }

    setLoadingAction(`close-${position.position_pubkey}`)
    try {
      // Build close transaction
      const buildRes = await axios.post('/api/dlmm/position/close', {
        pool_address: position.pool_address,
        position_pubkey: position.position_pubkey,
        user_wallet: wallet
      })

      if (!buildRes.data.success) {
        throw new Error(buildRes.data.error)
      }

      // Sign and submit
      const { VersionedTransaction } = await import('@solana/web3.js')
      const txBuffer = Buffer.from(buildRes.data.transaction, 'base64')
      const transaction = VersionedTransaction.deserialize(txBuffer)
      const signedTx = await jupiterWallet.signTransaction(transaction)

      const { Connection } = await import('@solana/web3.js')
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      await connection.confirmTransaction(signature, 'confirmed')

      // Record closure
      await axios.post('/api/dlmm/position/submit-signed', {
        action: 'close',
        signature,
        user_wallet: wallet,
        position_pubkey: position.position_pubkey
      })

      dispatch(addNotification({
        title: 'Position Closed',
        message: `Successfully closed ${position.pool_name || 'position'} and reclaimed rent`,
        type: 'success'
      }))

      onRefresh()
    } catch (e: any) {
      dispatch(addNotification({
        title: 'Close Failed',
        message: e.message || 'Failed to close position',
        type: 'error'
      }))
    } finally {
      setLoadingAction(null)
    }
  }

  const formatAmount = (amount: number, decimals: number = 4) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
    return amount.toFixed(decimals)
  }

  const getRebalanceSuggestion = (pubkey: string) => {
    return rebalanceSuggestions.find(s => s.position_pubkey === pubkey)
  }

  if (!wallet) {
    return (
      <div className="h-full bg-background-card border border-accent-cyan/20 rounded-xl flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 to-transparent" />
        <Wallet size={48} className="text-text-secondary opacity-30 mb-4" />
        <p className="text-lg font-bold text-text-primary">Connect Wallet</p>
        <p className="text-sm text-text-secondary">Connect your wallet to view positions</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Rebalance Alerts */}
      {rebalanceSuggestions.length > 0 && (
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-xl p-3 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <span className="text-xs font-bold uppercase text-amber-400">Rebalance Suggested</span>
          </div>
          {rebalanceSuggestions.map(suggestion => (
            <div key={suggestion.position_pubkey} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">
                {suggestion.position_pubkey.slice(0, 8)}... - {suggestion.reason}
              </span>
              <button
                onClick={() => dispatch(clearRebalanceSuggestion(suggestion.position_pubkey))}
                className="text-text-secondary hover:text-text-primary"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Positions */}
      <div className="flex-1 bg-background-card border border-accent-cyan/20 rounded-xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 to-transparent" />
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary flex items-center gap-2">
            <Wallet size={16} className="text-accent-cyan" />
            Active Positions ({activePositions.length})
          </h2>
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-white/5 rounded-lg transition-all"
          >
            <RefreshCw size={14} className="text-text-secondary" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-56px)] custom-scrollbar">
          {activePositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary">
              <DollarSign size={32} className="opacity-30 mb-2" />
              <p className="text-sm">No active positions</p>
              <p className="text-xs">Create a position from the Pools tab</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activePositions.map(position => {
                const isExpanded = expandedPosition === position.position_pubkey
                const rebalanceAlert = getRebalanceSuggestion(position.position_pubkey)
                const roi = position.roi

                return (
                  <div
                    key={position.position_pubkey}
                    className={cn(
                      "bg-background-dark/50 border rounded-xl overflow-hidden transition-all",
                      rebalanceAlert ? "border-amber-400/30" : "border-white/5",
                      isExpanded && "ring-1 ring-accent-purple/30"
                    )}
                  >
                    {/* Header */}
                    <div
                      onClick={() => setExpandedPosition(isExpanded ? null : position.position_pubkey)}
                      className="p-4 cursor-pointer hover:bg-white/5 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-sm font-bold text-text-primary">
                              {position.pool_name || `${position.token_x_symbol}/${position.token_y_symbol}`}
                            </p>
                            <p className="text-[10px] text-text-secondary">
                              {position.risk_profile?.toUpperCase()} | {position.strategy_type?.toUpperCase()}
                            </p>
                          </div>
                          {rebalanceAlert && (
                            <span className="px-2 py-1 bg-amber-400/10 border border-amber-400/30 rounded text-[9px] font-bold text-amber-400 uppercase">
                              Rebalance
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-mono font-bold text-text-primary">
                              ${position.current_usd_value?.toFixed(2) || '0.00'}
                            </p>
                            {roi && (
                              <p className={cn(
                                "text-[10px] font-mono flex items-center justify-end gap-1",
                                roi.pnl_usd >= 0 ? "text-accent-cyan" : "text-accent-pink"
                              )}>
                                {roi.pnl_usd >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {roi.roi_pct >= 0 ? '+' : ''}{roi.roi_pct.toFixed(2)}%
                              </p>
                            )}
                          </div>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-white/5 pt-4">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div className="bg-background-dark rounded-lg p-3">
                            <p className="text-[10px] text-text-secondary uppercase">Deposited</p>
                            <p className="text-sm font-mono font-bold text-text-primary">
                              ${position.deposit_usd_value?.toFixed(2) || '0.00'}
                            </p>
                          </div>
                          <div className="bg-background-dark rounded-lg p-3">
                            <p className="text-[10px] text-text-secondary uppercase">Current Value</p>
                            <p className="text-sm font-mono font-bold text-text-primary">
                              ${position.current_usd_value?.toFixed(2) || '0.00'}
                            </p>
                          </div>
                          <div className="bg-background-dark rounded-lg p-3">
                            <p className="text-[10px] text-text-secondary uppercase">Unclaimed Fees</p>
                            <p className="text-sm font-mono font-bold text-accent-cyan">
                              {formatAmount(position.unclaimed_fees_x || 0)} / {formatAmount(position.unclaimed_fees_y || 0)}
                            </p>
                          </div>
                          <div className="bg-background-dark rounded-lg p-3">
                            <p className="text-[10px] text-text-secondary uppercase">Total Claimed</p>
                            <p className="text-sm font-mono font-bold text-text-primary">
                              {formatAmount(position.total_fees_claimed_x || 0)} / {formatAmount(position.total_fees_claimed_y || 0)}
                            </p>
                          </div>
                        </div>

                        {/* Bin Range */}
                        <div className="bg-background-dark rounded-lg p-3 mb-4">
                          <p className="text-[10px] text-text-secondary uppercase mb-1">Bin Range</p>
                          <p className="text-sm font-mono text-text-primary">
                            {position.min_bin_id} - {position.max_bin_id}
                            <span className="text-text-secondary ml-2">
                              ({(position.max_bin_id - position.min_bin_id + 1)} bins, step: {position.bin_step})
                            </span>
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRefreshPosition(position)}
                            disabled={!!refreshingPosition}
                            className="flex items-center gap-2 px-3 py-2 bg-background-dark border border-white/10 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary hover:border-white/20 transition-all disabled:opacity-50"
                          >
                            <RefreshCw size={12} className={cn(refreshingPosition === position.position_pubkey && "animate-spin")} />
                            Refresh
                          </button>
                          <button
                            onClick={() => handleClaimFees(position)}
                            disabled={loadingAction === `claim-${position.position_pubkey}` || (position.unclaimed_fees_x === 0 && position.unclaimed_fees_y === 0)}
                            className="flex items-center gap-2 px-3 py-2 bg-accent-cyan/10 border border-accent-cyan/30 rounded-lg text-xs font-bold text-accent-cyan hover:bg-accent-cyan/20 transition-all disabled:opacity-50"
                          >
                            {loadingAction === `claim-${position.position_pubkey}` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Coins size={12} />
                            )}
                            Claim Fees
                          </button>
                          <button
                            onClick={() => handleClosePosition(position)}
                            disabled={!!loadingAction}
                            className="flex items-center gap-2 px-3 py-2 bg-accent-pink/10 border border-accent-pink/30 rounded-lg text-xs font-bold text-accent-pink hover:bg-accent-pink/20 transition-all disabled:opacity-50"
                          >
                            {loadingAction === `close-${position.position_pubkey}` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <ArrowDownToLine size={12} />
                            )}
                            Close Position
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Closed Positions (Collapsed) */}
      {closedPositions.length > 0 && (
        <div className="bg-background-card border border-white/10 rounded-xl p-4 shrink-0">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Closed Positions: {closedPositions.length}
          </p>
        </div>
      )}
    </div>
  )
}
