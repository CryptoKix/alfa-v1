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
  Settings,
  ArrowRight,
  ExternalLink,
  X,
} from 'lucide-react'
import { Button, Badge, Tooltip, StatusDot } from '@/components/ui'
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

        <div className="flex-1 overflow-auto glass-scrollbar">
          <AnimatePresence>
            {targets.length === 0 && !isAdding ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
                <Users className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm mb-3">No whales tracked</p>
                <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Whale
                </Button>
              </div>
            ) : targets.length > 0 && (
              <div className="divide-y divide-white/[0.04]">
                {targets.map((target, index) => (
                  <motion.div
                    key={target.address}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    className="p-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--accent-pink)]/10 flex items-center justify-center text-[var(--accent-pink)] font-bold">
                        {target.alias?.[0] || 'W'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{target.alias || 'Unknown Whale'}</span>
                          <StatusDot
                            status={target.status === 'active' ? 'active' : 'paused'}
                          />
                        </div>
                        <p className="text-xs text-white/50 font-mono">
                          {shortenAddress(target.address, 6)}
                        </p>
                        {target.tags && target.tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {target.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="default" size="sm">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {target.performance && (
                          <>
                            <p
                              className={cn(
                                'text-sm font-mono-numbers',
                                (target.performance.total_profit_sol || 0) >= 0
                                  ? 'text-[var(--accent-green)]'
                                  : 'text-[var(--accent-red)]'
                              )}
                            >
                              {(target.performance.total_profit_sol || 0) >= 0 ? '+' : ''}
                              {formatNumber(target.performance.total_profit_sol || 0)} SOL
                            </p>
                            <p className="text-xs text-white/50">
                              {target.performance.win_rate?.toFixed(0) || 0}% win rate
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip content={target.status === 'active' ? 'Pause' : 'Resume'}>
                          <Button variant="ghost" size="icon-sm">
                            {target.status === 'active' ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                        </Tooltip>
                        <Tooltip content="Settings">
                          <Button variant="ghost" size="icon-sm">
                            <Settings className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
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
      <div className="h-full overflow-auto glass-scrollbar">
        <AnimatePresence>
          {signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
              <Activity className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">Waiting for whale activity...</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {signals.slice(0, 50).map((signal, index) => (
                <motion.div
                  key={signal.id || signal.signature}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.02 }}
                  className="p-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent-pink)]/10 flex items-center justify-center flex-shrink-0">
                      <Activity className="w-4 h-4 text-[var(--accent-pink)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {signal.alias || shortenAddress(signal.wallet, 4)}
                        </span>
                        <Badge variant="pink" size="sm">
                          {signal.type || 'SWAP'}
                        </Badge>
                      </div>
                      {signal.sent && signal.received && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-white/50">
                            {formatNumber(signal.sent.amount)} {signal.sent.symbol}
                          </span>
                          <ArrowRight className="w-3 h-3 text-white/30" />
                          <span className="text-[var(--accent-green)]">
                            {formatNumber(signal.received.amount)} {signal.received.symbol}
                          </span>
                        </div>
                      )}
                      <p className="text-[10px] text-white/30 mt-1">
                        {formatTimestamp(signal.timestamp)}
                      </p>
                    </div>
                    <Tooltip content="View on Solscan">
                      <a
                        href={`https://solscan.io/tx/${signal.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/30 hover:text-white/60"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Tooltip>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
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
