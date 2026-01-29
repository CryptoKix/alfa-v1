import { useState, useEffect } from 'react'
import { useAppDispatch } from '@/app/hooks'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { DLMMPool, CalculatedStrategy } from '@/features/dlmm/dlmmSlice'
import {
  X, Layers, Shield, TrendingUp, Zap, AlertTriangle,
  Info, ArrowRight, Loader2, Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axios from 'axios'
import { useWallet } from '@jup-ag/wallet-adapter'

interface DLMMPositionWidgetProps {
  pool: DLMMPool
  strategy: CalculatedStrategy | null
  wallet: string | null
  onClose: () => void
  onSuccess: () => void
}

type RiskProfile = 'high' | 'medium' | 'low'
type StrategyType = 'spot' | 'curve' | 'bidask'

const riskProfiles: { id: RiskProfile; label: string; icon: any; description: string }[] = [
  { id: 'high', label: 'Aggressive', icon: Zap, description: '5-10% range, highest fees, frequent rebalancing' },
  { id: 'medium', label: 'Balanced', icon: TrendingUp, description: '15-25% range, good fees, moderate management' },
  { id: 'low', label: 'Conservative', icon: Shield, description: '40-60% range, steady fees, minimal IL' },
]

const strategyTypes: { id: StrategyType; label: string; description: string }[] = [
  { id: 'spot', label: 'Uniform', description: 'Equal distribution across bins' },
  { id: 'curve', label: 'Bell Curve', description: 'Concentrated in middle' },
  { id: 'bidask', label: 'Bid-Ask', description: 'Heavy at edges' },
]

const riskColors = {
  high: 'text-accent-pink border-accent-pink/30 bg-accent-pink/10',
  medium: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  low: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10'
}

export default function DLMMPositionWidget({ pool, strategy, wallet, onClose, onSuccess }: DLMMPositionWidgetProps) {
  const dispatch = useAppDispatch()
  const jupiterWallet = useWallet()

  const [riskProfile, setRiskProfile] = useState<RiskProfile>('medium')
  const [strategyType, setStrategyType] = useState<StrategyType>('spot')
  const [amountX, setAmountX] = useState('')
  const [amountY, setAmountY] = useState('')
  const [localStrategy, setLocalStrategy] = useState<CalculatedStrategy | null>(strategy)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'configure' | 'confirm' | 'signing' | 'success'>('configure')

  useEffect(() => {
    if (pool) {
      calculateStrategy()
    }
  }, [riskProfile, strategyType, amountX, amountY])

  const calculateStrategy = async () => {
    try {
      const depositUsd = (parseFloat(amountX) || 0) * pool.price + (parseFloat(amountY) || 0)
      const res = await axios.post('/api/dlmm/strategy/calculate', {
        pool_address: pool.address,
        risk_profile: riskProfile,
        strategy_type: strategyType,
        deposit_usd: depositUsd || 100
      })
      if (res.data.success) {
        setLocalStrategy(res.data)
      }
    } catch (e) {
      console.error('Failed to calculate strategy:', e)
    }
  }

  const handleCreatePosition = async () => {
    if (!wallet || !jupiterWallet.signTransaction) {
      dispatch(addNotification({
        title: 'Wallet Required',
        message: 'Please connect your wallet to create a position',
        type: 'error'
      }))
      return
    }

    if (!amountX && !amountY) {
      dispatch(addNotification({
        title: 'Invalid Amount',
        message: 'Please enter deposit amounts',
        type: 'error'
      }))
      return
    }

    setStep('signing')
    setLoading(true)

    try {
      // Build unsigned transaction
      const buildRes = await axios.post('/api/dlmm/position/create', {
        pool_address: pool.address,
        user_wallet: wallet,
        risk_profile: riskProfile,
        strategy_type: strategyType,
        amount_x: parseFloat(amountX) || 0,
        amount_y: parseFloat(amountY) || 0,
        token_x_decimals: 9, // SOL decimals
        token_y_decimals: 6  // USDC decimals typically
      })

      if (!buildRes.data.success) {
        throw new Error(buildRes.data.error || 'Failed to build transaction')
      }

      const { transaction: txBase64, position_pubkey, bin_range, pool_info, position_secret: _position_secret } = buildRes.data

      // Decode and sign transaction with Jupiter wallet
      const { VersionedTransaction } = await import('@solana/web3.js')
      const txBuffer = Buffer.from(txBase64, 'base64')
      const transaction = VersionedTransaction.deserialize(txBuffer)

      // Also need to sign with position keypair if available
      // For now, frontend only signs with user wallet
      const signedTx = await jupiterWallet.signTransaction(transaction)

      // Serialize and submit
      // Submit to RPC (this would typically go through backend)
      const { Connection } = await import('@solana/web3.js')
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
      const signature = await connection.sendRawTransaction(signedTx.serialize())

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')

      // Record in database
      const depositUsd = (parseFloat(amountX) || 0) * pool.price + (parseFloat(amountY) || 0)
      await axios.post('/api/dlmm/position/submit-signed', {
        action: 'create',
        signature,
        user_wallet: wallet,
        position_pubkey,
        pool_address: pool.address,
        risk_profile: riskProfile,
        strategy_type: strategyType,
        bin_range,
        deposit_x: parseFloat(amountX) || 0,
        deposit_y: parseFloat(amountY) || 0,
        deposit_usd: depositUsd,
        pool_info
      })

      setStep('success')
      dispatch(addNotification({
        title: 'Position Created',
        message: `Successfully created DLMM position in ${pool.name}`,
        type: 'success'
      }))

      setTimeout(() => {
        onSuccess()
      }, 1500)

    } catch (e: any) {
      console.error('Create position error:', e)
      dispatch(addNotification({
        title: 'Transaction Failed',
        message: e.message || 'Failed to create position',
        type: 'error'
      }))
      setStep('configure')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-background-card border border-accent-purple/30 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-purple/60 via-accent-purple/30 to-transparent" />

        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="text-accent-purple" size={20} />
            <div>
              <h2 className="text-sm font-bold text-text-primary">Create Position</h2>
              <p className="text-xs text-text-secondary">{pool.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-all"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] custom-scrollbar">
          {step === 'configure' && (
            <div className="space-y-4">
              {/* Risk Profile */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 block">
                  Risk Profile
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {riskProfiles.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => setRiskProfile(profile.id)}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-left",
                        riskProfile === profile.id
                          ? riskColors[profile.id]
                          : "bg-background-dark border-white/10 text-text-secondary hover:border-white/20"
                      )}
                    >
                      <profile.icon size={16} className="mb-1" />
                      <p className="text-xs font-bold">{profile.label}</p>
                      <p className="text-[9px] opacity-70">{profile.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategy Type */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 block">
                  Distribution Strategy
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {strategyTypes.map(strat => (
                    <button
                      key={strat.id}
                      onClick={() => setStrategyType(strat.id)}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-left",
                        strategyType === strat.id
                          ? "bg-accent-purple/20 border-accent-purple/40 text-accent-purple"
                          : "bg-background-dark border-white/10 text-text-secondary hover:border-white/20"
                      )}
                    >
                      <p className="text-xs font-bold">{strat.label}</p>
                      <p className="text-[9px] opacity-70">{strat.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Deposit Amounts */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 block">
                    {pool.token_x_symbol || 'Token X'} Amount
                  </label>
                  <input
                    type="number"
                    value={amountX}
                    onChange={(e) => setAmountX(e.target.value)}
                    placeholder="0.0"
                    className="w-full px-4 py-3 bg-background-dark border border-white/10 rounded-xl text-text-primary placeholder:text-text-secondary focus:border-accent-purple/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 block">
                    {pool.token_y_symbol || 'Token Y'} Amount
                  </label>
                  <input
                    type="number"
                    value={amountY}
                    onChange={(e) => setAmountY(e.target.value)}
                    placeholder="0.0"
                    className="w-full px-4 py-3 bg-background-dark border border-white/10 rounded-xl text-text-primary placeholder:text-text-secondary focus:border-accent-purple/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Strategy Preview */}
              {localStrategy && (
                <div className="bg-background-dark/50 border border-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                    <Info size={12} />
                    Strategy Preview
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div>
                      <p className="text-[10px] text-text-secondary">Bin Range</p>
                      <p className="text-sm font-mono font-bold text-text-primary">
                        {localStrategy.bin_range.min_bin_id} - {localStrategy.bin_range.max_bin_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-secondary">Range Width</p>
                      <p className="text-sm font-mono font-bold text-accent-cyan">
                        {localStrategy.bin_range.range_pct}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-secondary">Bins Used</p>
                      <p className="text-sm font-mono font-bold text-text-primary">
                        {localStrategy.bin_range.num_bins}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-secondary">Est. APR</p>
                      <p className="text-sm font-mono font-bold text-accent-pink">
                        {localStrategy.fee_potential.adjusted_apr.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-text-secondary">
                    <AlertTriangle size={12} className="text-amber-400" />
                    Max IL at range edge: {localStrategy.price_impact.il_at_max_move_pct.toFixed(2)}%
                  </div>
                </div>
              )}

              {/* Fee Estimates */}
              {localStrategy && (parseFloat(amountX) > 0 || parseFloat(amountY) > 0) && (
                <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-accent-cyan mb-2">
                    Estimated Earnings
                  </h3>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[10px] text-text-secondary">Daily</p>
                      <p className="text-lg font-mono font-bold text-text-primary">
                        ${localStrategy.fee_potential.daily_estimate_usd.toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-secondary">Weekly</p>
                      <p className="text-lg font-mono font-bold text-text-primary">
                        ${localStrategy.fee_potential.weekly_estimate_usd.toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-secondary">Monthly</p>
                      <p className="text-lg font-mono font-bold text-accent-cyan">
                        ${localStrategy.fee_potential.monthly_estimate_usd.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'signing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={48} className="text-accent-purple animate-spin mb-4" />
              <p className="text-lg font-bold text-text-primary">Awaiting Signature</p>
              <p className="text-sm text-text-secondary">Please confirm the transaction in your wallet</p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-accent-cyan/20 flex items-center justify-center mb-4">
                <Check size={32} className="text-accent-cyan" />
              </div>
              <p className="text-lg font-bold text-text-primary">Position Created!</p>
              <p className="text-sm text-text-secondary">Your DLMM position is now active</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'configure' && (
          <div className="p-4 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePosition}
              disabled={loading || (!amountX && !amountY)}
              className="flex items-center gap-2 px-6 py-2 bg-accent-purple hover:bg-accent-purple/80 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Position
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
