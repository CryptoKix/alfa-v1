import { useState } from 'react'
import { WidgetGrid } from '@/components/layout'
import { AlertsWidget } from '@/components/widgets'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector } from '@/app/hooks'
import { cn, formatNumber } from '@/lib/utils'
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
} from 'lucide-react'
import { Button, Badge, GlassCard } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'
import { ManualSnipeModal } from '@/components/modals/ManualSnipeModal'
import { TokenDetailModal } from '@/components/modals/TokenDetailModal'
import type { SnipedToken } from '@/features/sniper/sniperSlice'

function TokenSniperWidget() {
  const { settings, engineActive } = useAppSelector((state) => state.sniper)

  return (
    <WidgetContainer
      id="token-sniper"
      title="Token Sniper"
      icon={<Crosshair className="w-4 h-4" />}
      badge={engineActive ? 'Armed' : 'Standby'}
      badgeVariant={engineActive ? 'green' : 'yellow'}
      actions={
        <Button variant="ghost" size="icon-sm">
          <Settings className="w-4 h-4" />
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Status */}
        <GlassCard padding="md" className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                engineActive ? 'bg-[var(--accent-green)]/10' : 'bg-white/[0.04]'
              )}
            >
              <Crosshair
                className={cn(
                  'w-5 h-5',
                  engineActive ? 'text-[var(--accent-green)]' : 'text-white/40'
                )}
              />
            </div>
            <div>
              <p className="font-medium">{engineActive ? 'Sniper Armed' : 'Sniper Standby'}</p>
              <p className="text-xs text-white/50">
                {settings.autoSnipe ? 'Auto-snipe enabled' : 'Manual mode'}
              </p>
            </div>
          </div>
          <Button variant={engineActive ? 'danger' : 'primary'} size="sm">
            {engineActive ? 'Disarm' : 'Arm'}
          </Button>
        </GlassCard>

        {/* Settings */}
        <div className="space-y-3">
          <h4 className="text-xs text-white/50 uppercase">Snipe Settings</h4>

          <div className="grid grid-cols-2 gap-3">
            <GlassCard padding="sm">
              <p className="text-xs text-white/50 mb-1">Buy Amount</p>
              <p className="font-mono-numbers">{settings.buyAmount} SOL</p>
            </GlassCard>
            <GlassCard padding="sm">
              <p className="text-xs text-white/50 mb-1">Slippage</p>
              <p className="font-mono-numbers">{settings.slippage}%</p>
            </GlassCard>
            <GlassCard padding="sm">
              <p className="text-xs text-white/50 mb-1">Priority Fee</p>
              <p className="font-mono-numbers">{settings.priorityFee} SOL</p>
            </GlassCard>
            <GlassCard padding="sm">
              <p className="text-xs text-white/50 mb-1">Min Liquidity</p>
              <p className="font-mono-numbers">{settings.minLiquidity} SOL</p>
            </GlassCard>
          </div>

          {/* Safety Filters */}
          <div className="space-y-2">
            <h4 className="text-xs text-white/50 uppercase">Safety Filters</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant={settings.requireMintRenounced ? 'green' : 'default'}>
                <Shield className="w-3 h-3 mr-1" />
                Mint Renounced
              </Badge>
              <Badge variant={settings.requireLPBurned ? 'green' : 'default'}>
                <Shield className="w-3 h-3 mr-1" />
                LP Burned
              </Badge>
              <Badge variant={settings.requireSocials ? 'green' : 'default'}>
                <MessageCircle className="w-3 h-3 mr-1" />
                Has Socials
              </Badge>
            </div>
          </div>

          {/* Take Profit / Stop Loss */}
          <div className="space-y-2">
            <h4 className="text-xs text-white/50 uppercase">Exit Strategy</h4>
            <div className="grid grid-cols-3 gap-2">
              <GlassCard padding="sm" className={cn(
                settings.takeProfitEnabled && 'border-[var(--accent-green)]/20 bg-[var(--accent-green)]/[0.03]'
              )}>
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className={cn('w-3 h-3', settings.takeProfitEnabled ? 'text-[var(--accent-green)]' : 'text-white/30')} />
                  <p className="text-[9px] text-white/50">Take Profit</p>
                </div>
                <p className={cn('font-mono-numbers text-sm', settings.takeProfitEnabled ? 'text-[var(--accent-green)]' : 'text-white/30')}>
                  {settings.takeProfitEnabled ? `+${settings.takeProfitPct}%` : 'OFF'}
                </p>
              </GlassCard>
              <GlassCard padding="sm" className={cn(
                settings.stopLossEnabled && 'border-[var(--accent-red)]/20 bg-[var(--accent-red)]/[0.03]'
              )}>
                <div className="flex items-center gap-1 mb-1">
                  <TrendingDown className={cn('w-3 h-3', settings.stopLossEnabled ? 'text-[var(--accent-red)]' : 'text-white/30')} />
                  <p className="text-[9px] text-white/50">Stop Loss</p>
                </div>
                <p className={cn('font-mono-numbers text-sm', settings.stopLossEnabled ? 'text-[var(--accent-red)]' : 'text-white/30')}>
                  {settings.stopLossEnabled ? `-${settings.stopLossPct}%` : 'OFF'}
                </p>
              </GlassCard>
              <GlassCard padding="sm" className={cn(
                settings.trailingStopEnabled && 'border-[var(--accent-purple)]/20 bg-[var(--accent-purple)]/[0.03]'
              )}>
                <div className="flex items-center gap-1 mb-1">
                  <Activity className={cn('w-3 h-3', settings.trailingStopEnabled ? 'text-[var(--accent-purple)]' : 'text-white/30')} />
                  <p className="text-[9px] text-white/50">Trail Stop</p>
                </div>
                <p className={cn('font-mono-numbers text-sm', settings.trailingStopEnabled ? 'text-[var(--accent-purple)]' : 'text-white/30')}>
                  {settings.trailingStopEnabled ? `-${settings.trailingStopPct}%` : 'OFF'}
                </p>
              </GlassCard>
            </div>
          </div>
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
                      href={`https://solscan.io/token/${token.mint}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-[var(--accent-cyan)] transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
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

export default function SniperPage() {
  return (
    <WidgetGrid page="sniper">
      <div key="token-sniper">
        <TokenSniperWidget />
      </div>
      <div key="detected-tokens">
        <DetectedTokensWidget />
      </div>
      <div key="alerts">
        <AlertsWidget />
      </div>
    </WidgetGrid>
  )
}
