import { WidgetGrid } from '@/components/layout'
import { AlertsWidget } from '@/components/widgets'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector } from '@/app/hooks'
import { cn, formatTimestamp, formatNumber } from '@/lib/utils'
import {
  Crosshair,
  Radar,
  Settings,
  Zap,
  Shield,
  AlertTriangle,
  ExternalLink,
  Twitter,
  MessageCircle,
} from 'lucide-react'
import { Button, Badge, GlassCard } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'

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
        </div>
      </div>
    </WidgetContainer>
  )
}

function DetectedTokensWidget() {
  const { trackedTokens } = useAppSelector((state) => state.sniper)

  return (
    <WidgetContainer
      id="detected-tokens"
      title="Detected Tokens"
      icon={<Radar className="w-4 h-4" />}
      badge={trackedTokens.length > 0 ? `${trackedTokens.length} found` : undefined}
      badgeVariant="cyan"
      noPadding
    >
      <div className="h-full overflow-auto glass-scrollbar">
        <AnimatePresence>
          {trackedTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-white/40">
              <Radar className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">Scanning for new tokens...</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {trackedTokens.map((token, index) => {
                let socials: Record<string, string> = {}
                try {
                  socials = token.socials_json ? JSON.parse(token.socials_json) : {}
                } catch {
                  socials = {}
                }

                return (
                  <motion.div
                    key={token.mint}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    className="p-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{token.symbol}</span>
                          <Badge
                            variant={token.is_rug ? 'red' : token.status === 'sniped' ? 'green' : 'default'}
                            size="sm"
                          >
                            {token.is_rug ? 'RUG' : token.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/50">{token.name}</p>
                      </div>
                      {!token.is_rug && (
                        <Button
                          variant="primary"
                          size="xs"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Snipe
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-white/50">
                      <span>Liq: {formatNumber(token.initial_liquidity)} SOL</span>
                      <span>DEX: {token.dex_id}</span>
                      <span>{formatTimestamp(token.detected_at)}</span>
                    </div>

                    {/* Socials */}
                    {(socials.twitter || socials.telegram || socials.website) && (
                      <div className="flex items-center gap-2 mt-2">
                        {socials.twitter && (
                          <a
                            href={socials.twitter}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[var(--accent-cyan)]"
                          >
                            <Twitter className="w-4 h-4" />
                          </a>
                        )}
                        {socials.telegram && (
                          <a
                            href={socials.telegram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[var(--accent-cyan)]"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                        {socials.website && (
                          <a
                            href={socials.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[var(--accent-cyan)]"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    )}

                    {token.is_rug && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--accent-red)]">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Potential rug detected</span>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </AnimatePresence>
      </div>
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
