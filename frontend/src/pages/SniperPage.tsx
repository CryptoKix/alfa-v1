import { useState, useEffect, useCallback } from 'react'
import { WidgetGrid } from '@/components/layout'
import { AlertsWidget } from '@/components/widgets'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { updateSniperSettings } from '@/features/sniper/sniperSlice'
import { cn, formatNumber } from '@/lib/utils'
import { socketManager } from '@/services/socket/SocketManager'
import {
  Crosshair,
  Radar,
  Settings,
  Zap,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Twitter,
  MessageCircle,
  Globe,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  X,
  Copy,
  BarChart3,
} from 'lucide-react'
import { Button, Badge, GlassCard } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'
import { ManualSnipeModal } from '@/components/modals/ManualSnipeModal'
import { TokenDetailModal } from '@/components/modals/TokenDetailModal'
import { addNotification } from '@/features/notifications/notificationsSlice'
import type { SnipedToken, SnipePosition } from '@/features/sniper/sniperSlice'

/** Editable number input — local state while focused, syncs to Redux on blur */
function NumberField({
  value,
  onCommit,
  className,
  min,
  ...props
}: {
  value: number
  onCommit: (v: number) => void
  min?: string | number
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onFocus' | 'type'>) {
  const [local, setLocal] = useState(value.toString())
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setLocal(value.toString())
  }, [value, focused])
  return (
    <input
      type="number"
      className={className}
      min={min}
      {...props}
      value={focused ? local : value}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => { setFocused(true); e.target.select() }}
      onBlur={() => {
        setFocused(false)
        const num = parseFloat(local)
        const minVal = min !== undefined ? parseFloat(String(min)) : 0
        if (!isNaN(num) && num >= minVal) {
          onCommit(num)
        } else {
          setLocal(value.toString())
        }
      }}
    />
  )
}

function TokenSniperWidget() {
  const dispatch = useAppDispatch()
  const { settings, armed, detecting } = useAppSelector((state) => state.sniper)

  const saveSettings = useCallback(async (patch: Record<string, unknown>) => {
    dispatch(updateSniperSettings(patch))
    try {
      await fetch('/api/sniper/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, ...patch }),
      })
    } catch (e) {
      console.error('Failed to save sniper settings', e)
    }
  }, [dispatch, settings])

  const toggleSetting = (key: string) => saveSettings({ [key]: !settings[key as keyof typeof settings] })

  const handleArm = () => {
    // Send current settings along with arm command to ensure backend has latest
    socketManager.getSocket('sniper')?.emit('arm_sniper', { settings })
  }

  // Status label logic
  const statusLabel = armed ? 'Armed — Auto-Executing' : detecting ? 'Detecting Only' : 'Standby'
  const statusColor = armed ? 'accent-green' : detecting ? 'accent-cyan' : 'white/40'

  return (
    <WidgetContainer
      id="token-sniper"
      title="Token Sniper"
      icon={<Crosshair className="w-4 h-4" />}
      badge={armed ? 'Armed' : detecting ? 'Scanning' : 'Off'}
      badgeVariant={armed ? 'green' : detecting ? 'cyan' : 'yellow'}
      actions={
        <Button variant="ghost" size="icon-sm">
          <Settings className="w-4 h-4" />
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Status + Arm */}
        <GlassCard padding="md" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  armed ? 'bg-[var(--accent-green)]/10' : detecting ? 'bg-[var(--accent-cyan)]/10' : 'bg-white/[0.04]'
                )}
              >
                <Crosshair className={cn('w-5 h-5', `text-[var(--${statusColor})]`)} />
              </div>
              <div>
                <p className="font-medium">{statusLabel}</p>
                <p className="text-[9px] text-white/40">
                  {!detecting && 'Start detection in Control Panel first'}
                  {detecting && !armed && 'Configure params below, then Arm'}
                  {armed && settings.snipeMode === 'graduated' && `Graduated · ${settings.buyAmount} SOL · ${settings.slippage}% slip`}
                  {armed && settings.snipeMode === 'hft' && `HFT · ${settings.hftBuyAmount} SOL · ${settings.hftMaxHoldSeconds}s hold`}
                  {armed && settings.snipeMode === 'both' && `Both · Grad ${settings.buyAmount} / HFT ${settings.hftBuyAmount} SOL`}
                </p>
              </div>
            </div>
            <Button
              variant={armed ? 'danger' : 'primary'}
              size="sm"
              onClick={handleArm}
              disabled={!detecting}
            >
              {armed ? 'Disarm' : 'Arm'}
            </Button>
          </div>
          {!detecting && (
            <div className="text-[9px] text-[var(--accent-red)]/80 bg-[var(--accent-red)]/[0.05] rounded-md px-2 py-1.5 text-center">
              Detection engine not running — enable Token Sniper in Control Panel
            </div>
          )}
        </GlassCard>

        {/* Mode Selector */}
        <div className="space-y-2">
          <h4 className="text-xs text-white/50 uppercase">Snipe Mode</h4>
          <div className="grid grid-cols-3 gap-2">
            {([
              { mode: 'graduated' as const, label: 'Graduated', color: 'accent-cyan', desc: 'Raydium only · Full safety · Hold targets' },
              { mode: 'hft' as const, label: 'HFT', color: 'accent-pink', desc: 'Pump.fun · Fast in/out · Auto-sell' },
              { mode: 'both' as const, label: 'Both', color: 'accent-purple', desc: 'Graduated + HFT simultaneously' },
            ] as const).map(({ mode, label, color, desc }) => (
              <button
                key={mode}
                onClick={() => saveSettings({ snipeMode: mode })}
                className="text-left"
              >
                <GlassCard padding="sm" className={cn(
                  'transition-all h-full',
                  settings.snipeMode === mode
                    ? `border-[var(--${color})]/30 bg-[var(--${color})]/[0.06]`
                    : 'hover:border-white/[0.08]'
                )}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Zap className={cn('w-3 h-3', settings.snipeMode === mode ? `text-[var(--${color})]` : 'text-white/30')} />
                    <span className={cn('text-[10px] font-bold', settings.snipeMode === mode ? `text-[var(--${color})]` : 'text-white/50')}>
                      {label}
                    </span>
                  </div>
                  <p className="text-[8px] text-white/30 leading-tight">{desc}</p>
                </GlassCard>
              </button>
            ))}
          </div>
        </div>

        {/* Settings — conditional on mode */}
        <div className="space-y-3">

          {/* Graduated Settings */}
          {(settings.snipeMode === 'graduated' || settings.snipeMode === 'both') && (
            <div className="space-y-3">
              <h4 className="text-xs text-white/50 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)]" />
                Graduated Settings
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Buy Amount</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.buyAmount}
                      onCommit={(v) => saveSettings({ buyAmount: v })}
                      className="w-14 bg-transparent font-mono-numbers text-sm text-white outline-none"
                      step="0.1"
                      min="0.01"
                    />
                    <span className="text-[10px] text-white/40">SOL</span>
                  </div>
                </GlassCard>
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Slippage</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.slippage}
                      onCommit={(v) => saveSettings({ slippage: v })}
                      className="w-12 bg-transparent font-mono-numbers text-sm text-white outline-none"
                      step="1"
                      min="1"
                      max="50"
                    />
                    <span className="text-[10px] text-white/40">%</span>
                  </div>
                </GlassCard>
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Priority Fee</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.priorityFee}
                      onCommit={(v) => saveSettings({ priorityFee: v })}
                      className="w-14 bg-transparent font-mono-numbers text-sm text-white outline-none"
                      step="0.001"
                      min="0.001"
                    />
                    <span className="text-[10px] text-white/40">SOL</span>
                  </div>
                </GlassCard>
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Min Liquidity</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.minLiquidity}
                      onCommit={(v) => saveSettings({ minLiquidity: v })}
                      className="w-14 bg-transparent font-mono-numbers text-sm text-white outline-none"
                      step="0.1"
                      min="0"
                    />
                    <span className="text-[10px] text-white/40">SOL</span>
                  </div>
                </GlassCard>
              </div>

              {/* Safety Filters */}
              <div className="space-y-2">
                <h4 className="text-xs text-white/50 uppercase">Safety Filters</h4>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => toggleSetting('requireMintRenounced')}>
                    <Badge variant={settings.requireMintRenounced ? 'green' : 'default'} className="cursor-pointer">
                      <Shield className="w-3 h-3 mr-1" />
                      Mint Renounced
                    </Badge>
                  </button>
                  <button onClick={() => toggleSetting('requireLPBurned')}>
                    <Badge variant={settings.requireLPBurned ? 'green' : 'default'} className="cursor-pointer">
                      <Shield className="w-3 h-3 mr-1" />
                      LP Burned
                    </Badge>
                  </button>
                  <button onClick={() => toggleSetting('requireSocials')}>
                    <Badge variant={settings.requireSocials ? 'green' : 'default'} className="cursor-pointer">
                      <MessageCircle className="w-3 h-3 mr-1" />
                      Has Socials
                    </Badge>
                  </button>
                  <button onClick={() => toggleSetting('rugcheckEnabled')}>
                    <Badge variant={settings.rugcheckEnabled ? 'green' : 'default'} className="cursor-pointer">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      RugCheck API
                    </Badge>
                  </button>
                  <button onClick={() => toggleSetting('creatorBalanceCheckEnabled')}>
                    <Badge variant={settings.creatorBalanceCheckEnabled ? 'green' : 'default'} className="cursor-pointer">
                      <ShieldAlert className="w-3 h-3 mr-1" />
                      Creator Balance
                    </Badge>
                  </button>
                </div>

                {(settings.rugcheckEnabled || settings.minMarketCapSOL > 0) && (
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    {settings.rugcheckEnabled && (
                      <GlassCard padding="sm">
                        <p className="text-[9px] text-white/50 mb-1">Max Risk Score</p>
                        <div className="flex items-center gap-1">
                          <NumberField
                            value={settings.rugcheckMinScore}
                            onCommit={(v) => saveSettings({ rugcheckMinScore: v })}
                            className="w-16 bg-transparent font-mono-numbers text-sm text-white outline-none"
                            step="1000"
                            min="1"
                          />
                          <span className="text-[10px] text-white/40">risk</span>
                        </div>
                      </GlassCard>
                    )}
                    <GlassCard padding="sm">
                      <p className="text-[9px] text-white/50 mb-1">Min Market Cap</p>
                      <div className="flex items-center gap-1">
                        <NumberField
                          value={settings.minMarketCapSOL}
                          onCommit={(v) => saveSettings({ minMarketCapSOL: v })}
                          className="w-14 bg-transparent font-mono-numbers text-sm text-white outline-none"
                          step="1"
                          min="0"
                        />
                        <span className="text-[10px] text-white/40">SOL</span>
                      </div>
                    </GlassCard>
                  </div>
                )}
              </div>

              {/* Exit Strategy */}
              <div className="space-y-2">
                <h4 className="text-xs text-white/50 uppercase">Exit Strategy</h4>
                <div className="grid grid-cols-3 gap-2">
                  <GlassCard padding="sm" className={cn(
                    'cursor-pointer transition-all',
                    settings.takeProfitEnabled
                      ? 'border-[var(--accent-green)]/20 bg-[var(--accent-green)]/[0.03]'
                      : 'hover:border-white/[0.08]'
                  )}>
                    <div className="flex items-center gap-1 mb-1" onClick={() => toggleSetting('takeProfitEnabled')}>
                      <TrendingUp className={cn('w-3 h-3', settings.takeProfitEnabled ? 'text-[var(--accent-green)]' : 'text-white/30')} />
                      <p className="text-[9px] text-white/50">Take Profit</p>
                    </div>
                    {settings.takeProfitEnabled ? (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] font-bold text-[var(--accent-green)]">+</span>
                        <NumberField
                          value={settings.takeProfitPct}
                          onCommit={(v) => saveSettings({ takeProfitPct: v })}
                          className="w-10 bg-transparent text-sm font-mono-numbers text-[var(--accent-green)] outline-none"
                          step="10"
                          min="1"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>
                    ) : (
                      <p className="font-mono-numbers text-sm text-white/30 cursor-pointer" onClick={() => toggleSetting('takeProfitEnabled')}>OFF</p>
                    )}
                  </GlassCard>

                  <GlassCard padding="sm" className={cn(
                    'cursor-pointer transition-all',
                    settings.stopLossEnabled
                      ? 'border-[var(--accent-red)]/20 bg-[var(--accent-red)]/[0.03]'
                      : 'hover:border-white/[0.08]'
                  )}>
                    <div className="flex items-center gap-1 mb-1" onClick={() => toggleSetting('stopLossEnabled')}>
                      <TrendingDown className={cn('w-3 h-3', settings.stopLossEnabled ? 'text-[var(--accent-red)]' : 'text-white/30')} />
                      <p className="text-[9px] text-white/50">Stop Loss</p>
                    </div>
                    {settings.stopLossEnabled ? (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] font-bold text-[var(--accent-red)]">-</span>
                        <NumberField
                          value={settings.stopLossPct}
                          onCommit={(v) => saveSettings({ stopLossPct: v })}
                          className="w-10 bg-transparent text-sm font-mono-numbers text-[var(--accent-red)] outline-none"
                          step="5"
                          min="1"
                          max="99"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>
                    ) : (
                      <p className="font-mono-numbers text-sm text-white/30 cursor-pointer" onClick={() => toggleSetting('stopLossEnabled')}>OFF</p>
                    )}
                  </GlassCard>

                  <GlassCard padding="sm" className={cn(
                    'cursor-pointer transition-all',
                    settings.trailingStopEnabled
                      ? 'border-[var(--accent-purple)]/20 bg-[var(--accent-purple)]/[0.03]'
                      : 'hover:border-white/[0.08]'
                  )}>
                    <div className="flex items-center gap-1 mb-1" onClick={() => toggleSetting('trailingStopEnabled')}>
                      <Activity className={cn('w-3 h-3', settings.trailingStopEnabled ? 'text-[var(--accent-purple)]' : 'text-white/30')} />
                      <p className="text-[9px] text-white/50">Trail Stop</p>
                    </div>
                    {settings.trailingStopEnabled ? (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] font-bold text-[var(--accent-purple)]">-</span>
                        <NumberField
                          value={settings.trailingStopPct}
                          onCommit={(v) => saveSettings({ trailingStopPct: v })}
                          className="w-10 bg-transparent text-sm font-mono-numbers text-[var(--accent-purple)] outline-none"
                          step="5"
                          min="1"
                          max="50"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>
                    ) : (
                      <p className="font-mono-numbers text-sm text-white/30 cursor-pointer" onClick={() => toggleSetting('trailingStopEnabled')}>OFF</p>
                    )}
                  </GlassCard>
                </div>
              </div>
            </div>
          )}

          {/* HFT Settings */}
          {(settings.snipeMode === 'hft' || settings.snipeMode === 'both') && (
            <div className="space-y-3">
              <h4 className="text-xs text-white/50 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-pink)]" />
                HFT Settings
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Buy Amount</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.hftBuyAmount}
                      onCommit={(v) => saveSettings({ hftBuyAmount: v })}
                      className="w-14 bg-transparent font-mono-numbers text-sm text-[var(--accent-pink)] outline-none"
                      step="0.05"
                      min="0.01"
                      max="0.2"
                    />
                    <span className="text-[10px] text-white/40">SOL</span>
                  </div>
                </GlassCard>
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Slippage</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.hftSlippage}
                      onCommit={(v) => saveSettings({ hftSlippage: v })}
                      className="w-12 bg-transparent font-mono-numbers text-sm text-[var(--accent-pink)] outline-none"
                      step="5"
                      min="5"
                      max="50"
                    />
                    <span className="text-[10px] text-white/40">%</span>
                  </div>
                </GlassCard>
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Jito Tip</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.hftPriorityFee}
                      onCommit={(v) => saveSettings({ hftPriorityFee: v })}
                      className="w-20 bg-transparent font-mono-numbers text-sm text-[var(--accent-pink)] outline-none"
                      step="0.00005"
                      min="0.00001"
                    />
                    <span className="text-[10px] text-white/40">SOL</span>
                  </div>
                </GlassCard>
                <GlassCard padding="sm">
                  <p className="text-[9px] text-white/50 mb-1">Max Hold</p>
                  <div className="flex items-center gap-1">
                    <NumberField
                      value={settings.hftMaxHoldSeconds}
                      onCommit={(v) => saveSettings({ hftMaxHoldSeconds: v })}
                      className="w-14 bg-transparent font-mono-numbers text-sm text-[var(--accent-pink)] outline-none"
                      step="10"
                      min="10"
                      max="300"
                    />
                    <span className="text-[10px] text-white/40">sec</span>
                  </div>
                </GlassCard>
              </div>

              {/* HFT Auto-Sell Targets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs text-white/50 uppercase">Auto-Sell Targets</h4>
                  <button onClick={() => toggleSetting('hftAutoSellEnabled')}>
                    <Badge variant={settings.hftAutoSellEnabled ? 'pink' : 'default'} size="sm" className="cursor-pointer">
                      {settings.hftAutoSellEnabled ? 'ON' : 'OFF'}
                    </Badge>
                  </button>
                </div>
                {settings.hftAutoSellEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <GlassCard padding="sm" className="border-[var(--accent-green)]/10 bg-[var(--accent-green)]/[0.02]">
                      <div className="flex items-center gap-1 mb-1">
                        <TrendingUp className="w-3 h-3 text-[var(--accent-green)]" />
                        <p className="text-[9px] text-white/50">Take Profit</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] font-bold text-[var(--accent-green)]">+</span>
                        <NumberField
                          value={settings.hftTakeProfitPct}
                          onCommit={(v) => saveSettings({ hftTakeProfitPct: v })}
                          className="w-10 bg-transparent text-sm font-mono-numbers text-[var(--accent-green)] outline-none"
                          step="5"
                          min="1"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>
                    </GlassCard>
                    <GlassCard padding="sm" className="border-[var(--accent-red)]/10 bg-[var(--accent-red)]/[0.02]">
                      <div className="flex items-center gap-1 mb-1">
                        <TrendingDown className="w-3 h-3 text-[var(--accent-red)]" />
                        <p className="text-[9px] text-white/50">Stop Loss</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] font-bold text-[var(--accent-red)]">-</span>
                        <NumberField
                          value={settings.hftStopLossPct}
                          onCommit={(v) => saveSettings({ hftStopLossPct: v })}
                          className="w-10 bg-transparent text-sm font-mono-numbers text-[var(--accent-red)] outline-none"
                          step="5"
                          min="1"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>
                    </GlassCard>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </WidgetContainer>
  )
}

function DetectedTokensWidget() {
  const { trackedTokens } = useAppSelector((state) => state.sniper)
  const [selectedToken, setSelectedToken] = useState<SnipedToken | null>(null)
  const [isSnipeModalOpen, setIsSnipeModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  const handleSnipeClick = (e: React.MouseEvent, token: SnipedToken) => {
    e.stopPropagation()
    setSelectedToken(token)
    setIsSnipeModalOpen(true)
  }

  const handleRowClick = (token: SnipedToken) => {
    setSelectedToken(token)
    setIsDetailModalOpen(true)
  }

  const parseSocials = (json: string): Record<string, string> => {
    try {
      return json ? JSON.parse(json) : {}
    } catch {
      return {}
    }
  }

  return (
    <WidgetContainer
      id="detected-tokens"
      title="Detected Tokens"
      icon={<Radar className="w-4 h-4" />}
      badge={trackedTokens.length > 0 ? `${trackedTokens.length} found` : undefined}
      badgeVariant="cyan"
      noPadding
    >
      {/* Column Headers */}
      <div className="grid grid-cols-[1fr_90px_50px_70px_80px_100px] gap-2 px-4 py-2 text-[9px] font-bold text-white/40 uppercase tracking-wider border-b border-white/[0.04] shrink-0">
        <div>Asset</div>
        <div className="text-right">Liquidity</div>
        <div className="text-center">Safe</div>
        <div>DEX</div>
        <div className="text-right">Detected</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Rows */}
      <div className="h-full overflow-auto glass-scrollbar p-2 space-y-1">
        <AnimatePresence>
          {trackedTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/30">
              <Radar className="w-8 h-8 mb-2" strokeWidth={1} />
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5">Scanning</p>
              <p className="text-[9px] text-white/20">Waiting for new pools...</p>
            </div>
          ) : (
            trackedTokens.map((token, index) => {
              const socials = parseSocials(token.socials_json)
              const hasSocials = !!(socials.twitter || socials.telegram || socials.website)

              return (
                <motion.div
                  key={token.mint}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => handleRowClick(token)}
                  className={cn(
                    'grid grid-cols-[1fr_90px_50px_70px_80px_100px] gap-2 items-center px-3 py-2.5 rounded-lg cursor-pointer transition-all group',
                    'bg-white/[0.02] border border-white/[0.04]',
                    'hover:bg-white/[0.04] hover:border-white/[0.08]',
                    token.is_rug && 'border-[var(--accent-red)]/20 bg-[var(--accent-red)]/[0.03]'
                  )}
                >
                  {/* Asset */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">{token.symbol}</span>
                      {token.is_rug && (
                        <Badge variant="red" size="sm">RUG</Badge>
                      )}
                      {token.status === 'sniped' && !token.is_rug && (
                        <Badge variant="green" size="sm">SNIPED</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-white/30 font-mono truncate">
                        {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                      </span>
                      {hasSocials && (
                        <div className="flex items-center gap-1">
                          {socials.twitter && (
                            <a
                              href={socials.twitter}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-white/20 hover:text-[var(--accent-cyan)] transition-colors"
                            >
                              <Twitter className="w-3 h-3" />
                            </a>
                          )}
                          {socials.telegram && (
                            <a
                              href={socials.telegram}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-white/20 hover:text-[var(--accent-cyan)] transition-colors"
                            >
                              <MessageCircle className="w-3 h-3" />
                            </a>
                          )}
                          {socials.website && (
                            <a
                              href={socials.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-white/20 hover:text-[var(--accent-cyan)] transition-colors"
                            >
                              <Globe className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Liquidity */}
                  <div className="text-right">
                    <span className="text-[11px] font-mono font-bold text-[var(--accent-cyan)]">
                      {formatNumber(token.initial_liquidity)} SOL
                    </span>
                  </div>

                  {/* Security */}
                  <div className="flex justify-center">
                    {token.is_rug ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent-red)]" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
                    )}
                  </div>

                  {/* DEX */}
                  <div>
                    <span className="text-[10px] text-white/50 truncate block">{token.dex_id}</span>
                  </div>

                  {/* Detected */}
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-white/40">
                      {new Date(token.detected_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      })}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-1.5">
                    <a
                      href={`https://dexscreener.com/solana/${token.mint}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-[var(--accent-cyan)] transition-colors"
                    >
                      <BarChart3 className="w-3 h-3" />
                    </a>
                    {!token.is_rug && (
                      <button
                        onClick={(e) => handleSnipeClick(e, token)}
                        className="px-2.5 py-1 rounded-md bg-[var(--accent-cyan)]/10 hover:bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] text-[9px] font-bold uppercase tracking-wide transition-colors"
                      >
                        <Zap className="w-3 h-3 inline mr-0.5 -mt-px" />
                        Snipe
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      <ManualSnipeModal
        isOpen={isSnipeModalOpen}
        onClose={() => setIsSnipeModalOpen(false)}
        token={selectedToken}
      />
      <TokenDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        token={selectedToken}
      />
    </WidgetContainer>
  )
}

interface PositionDetailModalProps {
  isOpen: boolean
  onClose: () => void
  position: SnipePosition | null
  onSell: (pos: SnipePosition) => void
  sellingMint: string | null
}

function PositionDetailModal({ isOpen, onClose, position, onSell, sellingMint }: PositionDetailModalProps) {
  const dispatch = useAppDispatch()
  const priceMap = useAppSelector((state) => state.prices.prices)

  if (!isOpen || !position) return null

  const entryPrice = position.tokens_received > 0
    ? position.sol_spent / position.tokens_received
    : 0

  // Current price from Redux prices slice (SOL-denominated price per token)
  const currentPrice = priceMap[position.mint] ?? 0
  const currentValue = currentPrice * position.tokens_received
  const pnlSol = currentValue - position.sol_spent
  const pnlPct = position.sol_spent > 0 ? (pnlSol / position.sol_spent) * 100 : 0
  const isProfit = pnlSol >= 0
  const hasPriceData = currentPrice > 0

  const method = position.source.match(/\((.+)\)/)?.[1] || position.source
  const methodLabel = method.replace('_direct', '').replace('_fallback', '')

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    dispatch(addNotification({ title: 'Copied', message: `${label} copied to clipboard`, type: 'info' }))
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-background-card border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-background-elevated/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-cyan/10 flex items-center justify-center text-accent-cyan border border-accent-cyan/20">
              <Target size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">{position.symbol}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={method.includes('pumpfun') ? 'pink' : method.includes('raydium') ? 'purple' : 'cyan'} size="sm">
                  {methodLabel}
                </Badge>
                <div className="w-1 h-1 rounded-full bg-white/20" />
                <span className="text-[10px] text-text-muted font-bold uppercase">Snipe Position</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* PnL Hero */}
          {hasPriceData ? (
            <div className={cn(
              'rounded-2xl border p-4 text-center',
              isProfit
                ? 'bg-[var(--accent-green)]/[0.05] border-[var(--accent-green)]/20'
                : 'bg-[var(--accent-red)]/[0.05] border-[var(--accent-red)]/20'
            )}>
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Unrealized P&L</span>
              <div className={cn('text-2xl font-black font-mono mt-1', isProfit ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]')}>
                {isProfit ? '+' : ''}{pnlSol.toFixed(4)} SOL
              </div>
              <div className={cn('text-sm font-bold font-mono', isProfit ? 'text-[var(--accent-green)]/70' : 'text-[var(--accent-red)]/70')}>
                {isProfit ? '+' : ''}{pnlPct.toFixed(1)}%
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Unrealized P&L</span>
              <div className="text-sm font-bold text-white/30 mt-1">No price data available</div>
              <div className="text-[9px] text-white/20 mt-0.5">Token may not be tracked by price feed</div>
            </div>
          )}

          {/* Entry / Current Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/40 rounded-2xl border border-white/5 p-4 flex flex-col gap-1">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">SOL Invested</span>
              <div className="text-xl font-black text-[var(--accent-cyan)] font-mono">
                {position.sol_spent.toFixed(4)} <span className="text-xs">SOL</span>
              </div>
              {position.usd_value > 0 && (
                <span className="text-[10px] text-white/30 font-mono">${position.usd_value.toFixed(2)}</span>
              )}
            </div>
            <div className="bg-black/40 rounded-2xl border border-white/5 p-4 flex flex-col gap-1">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Tokens Received</span>
              <div className="text-xl font-black text-white font-mono">
                {formatNumber(position.tokens_received)}
              </div>
              <span className="text-[10px] text-white/30">{position.symbol}</span>
            </div>
          </div>

          {/* Price Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Entry Price</span>
              <div className="text-sm font-black text-white font-mono">
                {entryPrice > 0 ? entryPrice.toExponential(4) : '—'} <span className="text-[10px] text-white/40">SOL</span>
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Current Price</span>
              <div className={cn('text-sm font-black font-mono', hasPriceData ? (isProfit ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]') : 'text-white/30')}>
                {hasPriceData ? currentPrice.toExponential(4) : '—'} <span className="text-[10px] text-white/40">SOL</span>
              </div>
            </div>
          </div>

          {hasPriceData && (
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Current Value</span>
              <div className="text-lg font-black text-white font-mono">
                {currentValue.toFixed(4)} <span className="text-xs text-white/40">SOL</span>
              </div>
            </div>
          )}

          {/* Mint Address */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Mint Address</span>
                <span className="text-[11px] font-mono text-white mt-0.5 truncate">{position.mint}</span>
              </div>
              <button onClick={() => copyToClipboard(position.mint, 'Mint Address')} className="p-2 hover:bg-white/5 rounded-lg text-text-muted hover:text-accent-cyan transition-colors shrink-0 ml-2">
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* Timestamp + Links */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest ml-1">Sniped At</span>
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                <span className="text-xs font-mono text-white">
                  {new Date(position.timestamp).toLocaleString([], {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                  })}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest ml-1">Explore</span>
              <div className="flex gap-2">
                <a href={`https://dexscreener.com/solana/${position.mint}`} target="_blank" rel="noreferrer" className="flex-1 p-3 bg-accent-cyan/10 hover:bg-accent-cyan/20 rounded-xl border border-accent-cyan/20 flex items-center justify-center gap-1.5 text-accent-cyan font-black text-[10px] uppercase transition-all">
                  <BarChart3 size={14} /> Chart
                </a>
                <a href={`https://solscan.io/tx/${position.signature}`} target="_blank" rel="noreferrer" className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex items-center justify-center text-text-secondary hover:text-white transition-all">
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — Sell button */}
        <div className="p-5 bg-background-elevated/50 border-t border-white/5">
          <button
            onClick={() => onSell(position)}
            disabled={sellingMint === position.mint}
            className={cn(
              'w-full py-3 font-black uppercase tracking-widest text-xs rounded-2xl border transition-all',
              sellingMint === position.mint
                ? 'bg-white/5 text-white/30 border-white/10 cursor-wait'
                : 'bg-[var(--accent-red)]/10 hover:bg-[var(--accent-red)]/20 text-[var(--accent-red)] border-[var(--accent-red)]/20'
            )}
          >
            {sellingMint === position.mint ? 'Selling Position...' : `Sell All ${position.symbol}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function HftPositionsSection() {
  const { hftPositions } = useAppSelector((state) => state.sniper)

  if (hftPositions.length === 0) return null

  return (
    <div className="mx-2 mb-2">
      <div className="rounded-lg border border-[var(--accent-pink)]/20 bg-[var(--accent-pink)]/[0.03] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--accent-pink)]/10">
          <Zap className="w-3 h-3 text-[var(--accent-pink)]" />
          <span className="text-[9px] font-bold text-[var(--accent-pink)] uppercase tracking-wider">HFT Positions</span>
          <Badge variant="pink" size="sm">{hftPositions.length}</Badge>
        </div>
        <div className="p-2 space-y-1">
          {hftPositions.map((pos) => {
            const isProfit = pos.current_pnl_pct >= 0
            const pnlColor = isProfit ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'
            return (
              <div
                key={pos.mint}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-black/20 border border-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-white">{pos.symbol}</span>
                    <span className="text-[9px] text-white/30 font-mono">
                      {pos.mint.slice(0, 4)}...{pos.mint.slice(-4)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={cn('text-[11px] font-mono font-bold', pnlColor)}>
                      {isProfit ? '+' : ''}{pos.current_pnl_pct.toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-white/30 font-mono">
                      peak {pos.peak_pnl_pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono text-[var(--accent-pink)]">
                      {pos.seconds_remaining}s
                    </span>
                    <span className="text-[8px] text-white/30 uppercase">remaining</span>
                  </div>
                  <Badge
                    variant={pos.status === 'selling' ? 'yellow' : pos.status === 'monitoring' ? 'pink' : 'default'}
                    size="sm"
                  >
                    {pos.status}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ActivePositionsWidget({ onSelectPosition }: { onSelectPosition: (pos: SnipePosition) => void }) {
  const { snipePositions, settings } = useAppSelector((state) => state.sniper)
  const priceMap = useAppSelector((state) => state.prices.prices)
  const [sellingMint, setSellingMint] = useState<string | null>(null)

  const handleSell = (pos: SnipePosition) => {
    if (sellingMint) return // prevent double-click
    setSellingMint(pos.mint)
    const socket = socketManager.getSocket('sniper')
    if (socket) {
      socket.emit('sell_snipe_position', {
        mint: pos.mint,
        symbol: pos.symbol,
        slippage_bps: Math.round(settings.slippage * 100),
      })
      // Listen for completion once
      const handler = (data: { success: boolean; status?: string; mint?: string }) => {
        if (data.status === 'pending') return // ignore ack
        setSellingMint(null)
        socket.off('sell_result', handler)
      }
      socket.on('sell_result', handler)
      // Safety timeout
      setTimeout(() => { setSellingMint(null); socket.off('sell_result', handler) }, 30000)
    }
  }

  const extractMethod = (source: string) => {
    const match = source.match(/\((.+)\)/)
    return match ? match[1] : source
  }

  const methodColor = (method: string) => {
    if (method.includes('pumpfun')) return 'pink'
    if (method.includes('raydium')) return 'purple'
    return 'cyan'
  }

  return (
    <WidgetContainer
      id="active-positions"
      title="Active Positions"
      icon={<Target className="w-4 h-4" />}
      badge={snipePositions.length > 0 ? `${snipePositions.length}` : undefined}
      badgeVariant="green"
      noPadding
    >
      {/* HFT Positions — live monitoring */}
      <HftPositionsSection />

      {/* Column Headers */}
      <div className="grid grid-cols-[1fr_80px_80px_70px_80px_90px] gap-2 px-4 py-2 text-[9px] font-bold text-white/40 uppercase tracking-wider border-b border-white/[0.04] shrink-0">
        <div>Token</div>
        <div className="text-right">SOL In</div>
        <div className="text-right">P&L</div>
        <div>Method</div>
        <div className="text-right">Time</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Rows */}
      <div className="h-full overflow-auto glass-scrollbar p-2 space-y-1">
        <AnimatePresence>
          {snipePositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/30">
              <Target className="w-8 h-8 mb-2" strokeWidth={1} />
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5">No Active Positions</p>
              <p className="text-[9px] text-white/20">Sniped tokens will appear here</p>
            </div>
          ) : (
            snipePositions.map((pos, index) => {
              const method = extractMethod(pos.source)
              const currentPrice = priceMap[pos.mint] ?? 0
              const currentValue = currentPrice * pos.tokens_received
              const pnlSol = currentValue - pos.sol_spent
              const pnlPct = pos.sol_spent > 0 ? (pnlSol / pos.sol_spent) * 100 : 0
              const hasPriceData = currentPrice > 0
              const isProfit = pnlSol >= 0
              return (
                <motion.div
                  key={pos.signature}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onSelectPosition(pos)}
                  className={cn(
                    'grid grid-cols-[1fr_80px_80px_70px_80px_90px] gap-2 items-center px-3 py-2.5 rounded-lg cursor-pointer transition-all',
                    'bg-white/[0.02] border border-white/[0.04]',
                    'hover:bg-white/[0.04] hover:border-white/[0.08]',
                  )}
                >
                  {/* Token */}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-white truncate">{pos.symbol}</span>
                    <span className="text-[9px] text-white/30 font-mono truncate">
                      {pos.mint.slice(0, 4)}...{pos.mint.slice(-4)}
                    </span>
                  </div>

                  {/* SOL In */}
                  <div className="text-right">
                    <span className="text-[11px] font-mono font-bold text-[var(--accent-cyan)]">
                      {pos.sol_spent?.toFixed(3)}
                    </span>
                    <span className="text-[9px] text-white/30 ml-0.5">SOL</span>
                  </div>

                  {/* PnL (replaces Tokens Out) */}
                  <div className="text-right">
                    {hasPriceData ? (
                      <div className="flex flex-col items-end">
                        <span className={cn('text-[11px] font-mono font-bold', isProfit ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]')}>
                          {isProfit ? '+' : ''}{pnlPct.toFixed(1)}%
                        </span>
                        <span className={cn('text-[9px] font-mono', isProfit ? 'text-[var(--accent-green)]/60' : 'text-[var(--accent-red)]/60')}>
                          {isProfit ? '+' : ''}{pnlSol.toFixed(3)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-white/20">—</span>
                    )}
                  </div>

                  {/* Method */}
                  <div>
                    <Badge variant={methodColor(method)} size="sm">
                      {method.replace('_direct', '').replace('_fallback', '')}
                    </Badge>
                  </div>

                  {/* Time */}
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-white/40">
                      {new Date(pos.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      })}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-1.5">
                    <a
                      href={`https://solscan.io/tx/${pos.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-[var(--accent-cyan)] transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSell(pos) }}
                      disabled={sellingMint === pos.mint}
                      className={cn(
                        'px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide transition-colors',
                        sellingMint === pos.mint
                          ? 'bg-white/[0.04] text-white/30 cursor-wait'
                          : 'bg-[var(--accent-red)]/10 hover:bg-[var(--accent-red)]/20 text-[var(--accent-red)]'
                      )}
                    >
                      {sellingMint === pos.mint ? 'Selling...' : 'Sell'}
                    </button>
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

    </WidgetContainer>
  )
}

export default function SniperPage() {
  const { settings } = useAppSelector((state) => state.sniper)
  const [selectedPosition, setSelectedPosition] = useState<SnipePosition | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [sellingMint, setSellingMint] = useState<string | null>(null)

  const handleSelectPosition = (pos: SnipePosition) => {
    setSelectedPosition(pos)
    setIsDetailOpen(true)
  }

  const handleSellFromModal = (pos: SnipePosition) => {
    if (sellingMint) return
    setSellingMint(pos.mint)
    const socket = socketManager.getSocket('sniper')
    if (socket) {
      socket.emit('sell_snipe_position', {
        mint: pos.mint,
        symbol: pos.symbol,
        slippage_bps: Math.round(settings.slippage * 100),
      })
      const handler = (data: { success: boolean; status?: string }) => {
        if (data.status === 'pending') return
        setSellingMint(null)
        setIsDetailOpen(false)
        socket.off('sell_result', handler)
      }
      socket.on('sell_result', handler)
      setTimeout(() => { setSellingMint(null); socket.off('sell_result', handler) }, 30000)
    }
  }

  return (
    <>
      <WidgetGrid page="sniper">
        <div key="token-sniper">
          <TokenSniperWidget />
        </div>
        <div key="active-positions">
          <ActivePositionsWidget onSelectPosition={handleSelectPosition} />
        </div>
        <div key="detected-tokens">
          <DetectedTokensWidget />
        </div>
        <div key="alerts">
          <AlertsWidget />
        </div>
      </WidgetGrid>

      <PositionDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        position={selectedPosition}
        onSell={handleSellFromModal}
        sellingMint={sellingMint}
      />
    </>
  )
}
