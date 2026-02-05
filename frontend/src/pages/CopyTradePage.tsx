import { WidgetGrid } from '@/components/layout'
import { AlertsWidget } from '@/components/widgets'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setTargets } from '@/features/copytrade/copytradeSlice'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { cn, shortenAddress, formatTimestamp, formatNumber } from '@/lib/utils'
import {
  Users,
  Activity,
  Plus,
  Eye,
  EyeOff,
  ArrowRight,
  ExternalLink,
  X,
} from 'lucide-react'
import { Button, Badge, Tooltip } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

function WhaleTrackerWidget() {
  const dispatch = useAppDispatch()
  const { targets = [] } = useAppSelector((state) => state.copytrade) || {}
  const [isAdding, setIsAdding] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [newAlias, setNewAlias] = useState('')
  const [loading, setLoading] = useState(false)

  // Fetch targets on mount
  useEffect(() => {
    fetch('/api/copytrade/targets')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          dispatch(setTargets(data))
        }
      })
      .catch(console.error)
  }, [dispatch])

  const handleAddWhale = async () => {
    if (!newAddress.trim() || !newAlias.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/copytrade/targets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: newAddress.trim(), alias: newAlias.trim() })
      })
      if (res.ok) {
        setNewAddress('')
        setNewAlias('')
        setIsAdding(false)
        dispatch(addNotification({ title: 'Whale Added', message: `Now tracking ${newAlias}`, type: 'success' }))
        // Refresh targets
        const targetsRes = await fetch('/api/copytrade/targets')
        const data = await targetsRes.json()
        if (Array.isArray(data)) dispatch(setTargets(data))
      }
    } catch (e) {
      console.error('Failed to add whale:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <WidgetContainer
      id="whale-tracker"
      title="Whale Tracker"
      icon={<Users className="w-4 h-4" />}
      badge={`${targets.filter((t) => t.status === 'active').length} active`}
      badgeVariant="green"
      actions={
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40 hover:text-accent-cyan transition-colors font-semibold"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      }
      noPadding
    >
      <div className="h-full flex flex-col">
        {/* Add Whale Form */}
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-white/[0.04] overflow-hidden"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/70 uppercase tracking-wider">Add New Whale</span>
                  <button onClick={() => setIsAdding(false)} className="text-white/40 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Wallet address..."
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent-cyan/50"
                />
                <input
                  type="text"
                  placeholder="Alias (e.g. Whale #1)..."
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent-cyan/50"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={handleAddWhale}
                  disabled={loading || !newAddress.trim() || !newAlias.trim()}
                >
                  {loading ? 'Adding...' : 'Add Whale'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
          {/* Table Header */}
          <div className="grid grid-cols-[24px_1fr_90px_70px_70px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
            <div></div>
            <div>Whale</div>
            <div>Address</div>
            <div>Profit</div>
            <div>Win Rate</div>
          </div>

          {targets.length === 0 && !isAdding ? (
            <div className="flex flex-col items-center justify-center h-32 text-white/30">
              <Users size={24} strokeWidth={1} className="mb-2 opacity-50" />
              <span className="text-xs">No whales tracked</span>
              <Button variant="primary" size="sm" className="mt-3" onClick={() => setIsAdding(true)}>
                <Plus className="w-3 h-3 mr-1" />
                Add Whale
              </Button>
            </div>
          ) : (
            targets.map((target) => (
              <div
                key={target.address}
                className={cn(
                  'grid grid-cols-[24px_1fr_90px_70px_70px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                  'hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
              >
                {/* Status */}
                <div className="flex justify-center">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full',
                    target.status === 'active'
                      ? 'bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                      : 'bg-white/30'
                  )} />
                </div>

                {/* Whale Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-semibold text-white truncate">
                    {target.alias || 'Unknown Whale'}
                  </span>
                  {target.tags && target.tags.length > 0 && (
                    <Badge variant="default" size="sm" className="shrink-0">
                      {target.tags[0]}
                    </Badge>
                  )}
                </div>

                {/* Address */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-mono text-white/50 truncate">
                    {shortenAddress(target.address, 4)}
                  </span>
                  <a
                    href={`https://solscan.io/account/${target.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-accent-cyan transition-all shrink-0"
                  >
                    <ExternalLink size={10} />
                  </a>
                </div>

                {/* Profit */}
                <div className={cn(
                  'text-[12px] font-mono truncate',
                  (target.performance?.total_profit_sol || 0) >= 0
                    ? 'text-accent-green'
                    : 'text-accent-red'
                )}>
                  {(target.performance?.total_profit_sol || 0) >= 0 ? '+' : ''}
                  {formatNumber(target.performance?.total_profit_sol || 0)}
                </div>

                {/* Win Rate */}
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-white/70">
                    {target.performance?.win_rate?.toFixed(0) || 0}%
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip content={target.status === 'active' ? 'Pause' : 'Resume'}>
                      <button className="p-1 hover:bg-white/10 rounded transition-colors">
                        {target.status === 'active' ? (
                          <EyeOff className="w-3 h-3 text-white/50 hover:text-white" />
                        ) : (
                          <Eye className="w-3 h-3 text-white/50 hover:text-white" />
                        )}
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </WidgetContainer>
  )
}

function SignalFeedWidget() {
  const { signals = [] } = useAppSelector((state) => state.copytrade) || {}

  return (
    <WidgetContainer
      id="signal-feed"
      title="Signal Feed"
      icon={<Activity className="w-4 h-4" />}
      badge={signals.length > 0 ? 'Live' : undefined}
      badgeVariant="pink"
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[60px_50px_1fr_1fr_50px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div>Time</div>
          <div>Type</div>
          <div>Whale</div>
          <div>Trade</div>
          <div></div>
        </div>

        {signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <Activity size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">Waiting for whale activity...</span>
          </div>
        ) : (
          signals.slice(0, 50).map((signal) => (
            <div
              key={signal.id || signal.signature}
              className={cn(
                'grid grid-cols-[60px_50px_1fr_1fr_50px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                'hover:bg-white/[0.04] hover:border-accent-cyan/30'
              )}
            >
              {/* Time */}
              <div className="text-[11px] text-white/50">
                {formatTimestamp(signal.timestamp)}
              </div>

              {/* Type */}
              <div>
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded leading-none',
                  'bg-accent-pink/10 text-accent-pink'
                )}>
                  {signal.type || 'SWAP'}
                </span>
              </div>

              {/* Whale */}
              <div className="text-[12px] font-semibold text-white truncate">
                {signal.alias || shortenAddress(signal.wallet, 4)}
              </div>

              {/* Trade */}
              <div className="flex items-center gap-2 min-w-0">
                {signal.sent && signal.received ? (
                  <>
                    <span className="text-[11px] font-mono text-white/70 truncate">
                      {formatNumber(signal.sent.amount)} {signal.sent.symbol}
                    </span>
                    <ArrowRight className="w-3 h-3 text-white/30 shrink-0" />
                    <span className="text-[11px] font-mono text-accent-green truncate">
                      {formatNumber(signal.received.amount)} {signal.received.symbol}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-white/50">-</span>
                )}
              </div>

              {/* Link */}
              <div className="flex justify-end">
                <a
                  href={`https://solscan.io/tx/${signal.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-accent-cyan transition-all"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  )
}

export default function CopyTradePage() {
  return (
    <WidgetGrid page="copytrade">
      <div key="whale-tracker">
        <WhaleTrackerWidget />
      </div>
      <div key="signal-feed">
        <SignalFeedWidget />
      </div>
      <div key="alerts">
        <AlertsWidget />
      </div>
    </WidgetGrid>
  )
}
