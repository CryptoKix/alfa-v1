import { useState } from 'react'
import { WidgetGrid } from '@/components/layout'
import { ActiveBotsWidget } from '@/components/widgets'
import { TradeHistoryWidget } from '@/components/widgets/portfolio/TradeHistoryWidget'
import { BotPreviewWidget } from '@/components/widgets/BotPreviewWidget'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { Plus, ChevronDown, ChevronUp, Shield, TrendingUp, Sliders, Grid3X3, Repeat, Clock, BarChart3, Sparkles, Zap, Loader2 } from 'lucide-react'
import { GlassCard, Select, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'

// Token mint addresses
const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
}

const strategyInfo = {
  grid: { icon: Grid3X3, label: 'Grid', desc: 'Range trading' },
  dca: { icon: Repeat, label: 'DCA', desc: 'Dollar cost avg' },
  twap: { icon: Clock, label: 'TWAP', desc: 'Time weighted' },
  vwap: { icon: BarChart3, label: 'VWAP', desc: 'Volume weighted' },
}

type Strategy = 'grid' | 'dca' | 'twap' | 'vwap'

function StrategySelector({
  strategy,
  onSelect
}: {
  strategy: Strategy
  onSelect: (s: Strategy) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {(['grid', 'dca', 'twap', 'vwap'] as const).map((s) => {
        const info = strategyInfo[s]
        const Icon = info.icon
        const isActive = strategy === s
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-200 group",
              isActive
                ? "bg-gradient-to-br from-[var(--accent-cyan)]/15 to-[var(--accent-cyan)]/5 border-[var(--accent-cyan)]/40 shadow-[0_0_20px_rgba(0,255,255,0.15)]"
                : "bg-[#0a0a0a] border-[rgba(0,255,255,0.1)] hover:bg-white/[0.04] hover:border-[rgba(0,255,255,0.2)]"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-lg transition-colors",
              isActive
                ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                : "bg-white/[0.05] text-white/40 group-hover:text-white/60"
            )}>
              <Icon size={14} strokeWidth={2} />
            </div>
            <div className="flex flex-col items-start">
              <span className={cn(
                "text-xs font-bold uppercase tracking-wide leading-none",
                isActive ? "text-[var(--accent-cyan)]" : "text-white/70 group-hover:text-white/90"
              )}>
                {info.label}
              </span>
              <span className="text-[8px] text-white/40 leading-none mt-0.5">
                {info.desc}
              </span>
            </div>
            {isActive && (
              <Sparkles size={10} className="text-[var(--accent-cyan)] ml-1" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// Shared state type for bot configuration
interface BotConfig {
  strategy: 'grid' | 'dca' | 'twap' | 'vwap'
  alias: string
  inputToken: string
  outputToken: string
  // Grid
  lowerPrice: number
  upperPrice: number
  gridLevels: number
  investment: number
  // Grid - Advanced
  floorPrice: number | null
  floorAction: 'sell_all' | 'pause'
  trailingEnabled: boolean
  trailingMaxCycles: number
  hysteresis: number
  slippageBps: number
  stopLossPct: number | null
  stopLossAction: 'sell_all' | 'pause'
  takeProfit: number | null
  // DCA
  amountPerBuy: number
  interval: string
  maxBuys: number
  // TWAP/VWAP
  totalAmount: number
  duration: number
  maxDeviation: number
}

const defaultConfig: BotConfig = {
  strategy: 'grid',
  alias: '',
  inputToken: 'SOL',
  outputToken: 'USDC',
  lowerPrice: 100,
  upperPrice: 200,
  gridLevels: 10,
  investment: 1000,
  // Grid - Advanced
  floorPrice: null,
  floorAction: 'sell_all',
  trailingEnabled: false,
  trailingMaxCycles: 0,
  hysteresis: 0.01,
  slippageBps: 50,
  stopLossPct: null,
  stopLossAction: 'sell_all',
  takeProfit: null,
  // DCA
  amountPerBuy: 100,
  interval: '1d',
  maxBuys: 10,
  // TWAP/VWAP
  totalAmount: 1000,
  duration: 24,
  maxDeviation: 2,
}

function BotCreatorWidget({ config, setConfig }: {
  config: BotConfig
  setConfig: React.Dispatch<React.SetStateAction<BotConfig>>
}) {
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deploySuccess, setDeploySuccess] = useState(false)

  const updateConfig = (key: keyof BotConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleLaunchBot = async () => {
    console.log('handleLaunchBot called with config:', config)

    // Validation
    if (config.strategy === 'grid') {
      if (!config.lowerPrice || !config.upperPrice || !config.investment || !config.gridLevels) {
        const missing = []
        if (!config.lowerPrice) missing.push('lowerPrice')
        if (!config.upperPrice) missing.push('upperPrice')
        if (!config.investment) missing.push('investment')
        if (!config.gridLevels) missing.push('gridLevels')
        setDeployError(`Missing required fields: ${missing.join(', ')}`)
        return
      }
    }

    setIsDeploying(true)
    setDeployError(null)
    setDeploySuccess(false)

    try {
      const inputMint = TOKEN_MINTS[config.outputToken] || config.outputToken
      const outputMint = TOKEN_MINTS[config.inputToken] || config.inputToken

      let endpoint = '/api/dca/add'
      let body: any = {}

      if (config.strategy === 'grid') {
        body = {
          strategy: 'GRID',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          totalInvestment: config.investment,
          lowerBound: config.lowerPrice,
          upperBound: config.upperPrice,
          steps: config.gridLevels,
          trailingEnabled: config.trailingEnabled,
          hysteresisPct: config.hysteresis,
          slippageBps: config.slippageBps,
          floorPrice: config.floorPrice,
          floorAction: config.floorAction,
          stopLossPct: config.stopLossPct,
          takeProfit: config.takeProfit,
        }
      } else if (config.strategy === 'dca') {
        body = {
          strategy: 'DCA',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          amountPerInterval: config.amountPerBuy,
          interval: config.interval,
          maxBuys: config.maxBuys,
        }
      } else if (config.strategy === 'twap') {
        body = {
          strategy: 'TWAP',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          totalAmount: config.totalAmount,
          durationHours: config.duration,
        }
      } else if (config.strategy === 'vwap') {
        body = {
          strategy: 'VWAP',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          totalAmount: config.totalAmount,
          durationHours: config.duration,
          maxDeviation: config.maxDeviation,
        }
      }

      console.log('Sending bot creation request:', { endpoint, body })

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      console.log('Bot creation response:', data)

      if (data.success) {
        setDeploySuccess(true)
        setConfig(prev => ({ ...prev, alias: '' }))
        setTimeout(() => setDeploySuccess(false), 3000)
      } else {
        setDeployError(data.error || 'Failed to create bot')
      }
    } catch (err) {
      console.error('Bot creation error:', err)
      setDeployError('Network error - check console')
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <WidgetContainer
      id="bot-creator"
      title="Create Bot"
      icon={<Plus className="w-4 h-4" />}
    >
      <div className="space-y-3 overflow-auto custom-scrollbar pr-1">
        {/* Bot Name */}
        <div>
          <label className="text-xs text-white/50 mb-1 block">Bot Name</label>
          <Input
            type="text"
            placeholder="My Grid Bot"
            value={config.alias}
            onChange={(e) => updateConfig('alias', e.target.value)}
          />
        </div>

        {/* Token Pair */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/50 mb-1 block">Buy Token</label>
            <Select
              options={[
                { value: 'SOL', label: 'SOL' },
                { value: 'JUP', label: 'JUP' },
                { value: 'RAY', label: 'RAY' },
              ]}
              value={config.inputToken}
              onChange={(e) => updateConfig('inputToken', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1 block">With Token</label>
            <Select
              options={[
                { value: 'USDC', label: 'USDC' },
                { value: 'USDT', label: 'USDT' },
                { value: 'SOL', label: 'SOL' },
              ]}
              value={config.outputToken}
              onChange={(e) => updateConfig('outputToken', e.target.value)}
            />
          </div>
        </div>

        {/* Grid Config */}
        {config.strategy === 'grid' && (
          <>
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-cyan uppercase tracking-wider font-bold flex items-center gap-1">
                <Sliders size={10} />
                Grid Range
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 mb-1 block">Lower Price</label>
                  <Input
                    type="number"
                    placeholder="100.00"
                    value={config.lowerPrice || ''}
                    onChange={(e) => updateConfig('lowerPrice', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 mb-1 block">Upper Price</label>
                  <Input
                    type="number"
                    placeholder="200.00"
                    value={config.upperPrice || ''}
                    onChange={(e) => updateConfig('upperPrice', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 mb-1 block">Grid Levels (2-50)</label>
                  <Input
                    type="number"
                    placeholder="10"
                    min={2}
                    max={50}
                    value={config.gridLevels || ''}
                    onChange={(e) => updateConfig('gridLevels', Math.min(50, Math.max(2, parseInt(e.target.value) || 2)))}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 mb-1 block">Investment ({config.outputToken})</label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={config.investment || ''}
                    onChange={(e) => updateConfig('investment', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </GlassCard>

            {/* Advanced Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={cn(
                "w-full flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200",
                showAdvanced
                  ? "bg-white/[0.04] border-white/[0.1]"
                  : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08]"
              )}
            >
              <div className="flex items-center gap-2">
                <Sliders size={12} className={showAdvanced ? "text-accent-cyan" : "text-white/40"} />
                <span className={cn(
                  "text-[10px] uppercase tracking-wider font-bold",
                  showAdvanced ? "text-white/70" : "text-white/50"
                )}>
                  Advanced Settings
                </span>
              </div>
              <div className={cn(
                "p-1 rounded-md transition-colors",
                showAdvanced ? "bg-accent-cyan/10 text-accent-cyan" : "text-white/30"
              )}>
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {showAdvanced && (
              <>
                {/* Risk Management */}
                <GlassCard padding="sm" className="space-y-2">
                  <div className="text-[10px] text-accent-pink uppercase tracking-wider font-bold flex items-center gap-1">
                    <Shield size={10} />
                    Risk Management
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 mb-1 block">Floor Price (Stop-Loss)</label>
                      <Input
                        type="number"
                        placeholder="Optional"
                        value={config.floorPrice || ''}
                        onChange={(e) => updateConfig('floorPrice', e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 mb-1 block">Floor Action</label>
                      <Select
                        options={[
                          { value: 'sell_all', label: 'Sell All' },
                          { value: 'pause', label: 'Pause Bot' },
                        ]}
                        value={config.floorAction}
                        onChange={(e) => updateConfig('floorAction', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 mb-1 block">Stop Loss %</label>
                      <Input
                        type="number"
                        placeholder="Optional"
                        value={config.stopLossPct || ''}
                        onChange={(e) => updateConfig('stopLossPct', e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 mb-1 block">Take Profit %</label>
                      <Input
                        type="number"
                        placeholder="Optional"
                        value={config.takeProfit || ''}
                        onChange={(e) => updateConfig('takeProfit', e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </div>
                  </div>
                </GlassCard>

                {/* Trailing & Execution */}
                <GlassCard padding="sm" className="space-y-2">
                  <div className="text-[10px] text-accent-green uppercase tracking-wider font-bold flex items-center gap-1">
                    <TrendingUp size={10} />
                    Trailing & Execution
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={12} className={config.trailingEnabled ? "text-accent-green" : "text-white/40"} />
                      <span className="text-[10px] text-white/70 font-medium">Enable Trailing Grid</span>
                    </div>
                    <button
                      onClick={() => updateConfig('trailingEnabled', !config.trailingEnabled)}
                      className={cn(
                        "w-11 h-6 rounded-full transition-all duration-300 relative border",
                        config.trailingEnabled
                          ? "bg-accent-green/20 border-accent-green/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                          : "bg-white/5 border-white/10"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 shadow-lg",
                        config.trailingEnabled
                          ? "left-5 bg-accent-green"
                          : "left-0.5 bg-white/50"
                      )} />
                    </button>
                  </div>
                  {config.trailingEnabled && (
                    <div>
                      <label className="text-[10px] text-white/50 mb-1 block">Max Trailing Cycles (0 = unlimited)</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={config.trailingMaxCycles || ''}
                        onChange={(e) => updateConfig('trailingMaxCycles', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 mb-1 block">Hysteresis %</label>
                      <Input
                        type="number"
                        placeholder="0.01"
                        step="0.01"
                        value={config.hysteresis || ''}
                        onChange={(e) => updateConfig('hysteresis', parseFloat(e.target.value) || 0.01)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 mb-1 block">Slippage (bps)</label>
                      <Input
                        type="number"
                        placeholder="50"
                        value={config.slippageBps || ''}
                        onChange={(e) => updateConfig('slippageBps', parseInt(e.target.value) || 50)}
                      />
                    </div>
                  </div>
                </GlassCard>
              </>
            )}
          </>
        )}

        {/* DCA Config */}
        {config.strategy === 'dca' && (
          <GlassCard padding="md" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Amount per Buy ({config.outputToken})</label>
                <Input
                  type="number"
                  placeholder="100"
                  value={config.amountPerBuy || ''}
                  onChange={(e) => updateConfig('amountPerBuy', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Interval</label>
                <Select
                  options={[
                    { value: '1h', label: 'Hourly' },
                    { value: '4h', label: 'Every 4 hours' },
                    { value: '1d', label: 'Daily' },
                    { value: '1w', label: 'Weekly' },
                  ]}
                  value={config.interval}
                  onChange={(e) => updateConfig('interval', e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Max Buys</label>
              <Input
                type="number"
                placeholder="10"
                value={config.maxBuys || ''}
                onChange={(e) => updateConfig('maxBuys', parseInt(e.target.value) || 0)}
              />
            </div>
          </GlassCard>
        )}

        {/* TWAP/VWAP Config */}
        {(config.strategy === 'twap' || config.strategy === 'vwap') && (
          <GlassCard padding="md" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Total Amount ({config.outputToken})</label>
                <Input
                  type="number"
                  placeholder="1000"
                  value={config.totalAmount || ''}
                  onChange={(e) => updateConfig('totalAmount', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Duration (hours)</label>
                <Input
                  type="number"
                  placeholder="24"
                  value={config.duration || ''}
                  onChange={(e) => updateConfig('duration', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            {config.strategy === 'vwap' && (
              <div>
                <label className="text-xs text-white/50 mb-1 block">Max Price Deviation (%)</label>
                <Input
                  type="number"
                  placeholder="2"
                  value={config.maxDeviation || ''}
                  onChange={(e) => updateConfig('maxDeviation', parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
          </GlassCard>
        )}

        {/* Status Messages */}
        {deployError && (
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium">
            {deployError}
          </div>
        )}
        {deploySuccess && (
          <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 font-medium text-center">
            Bot deployed successfully!
          </div>
        )}

        {/* Create Button */}
        <button
          onClick={handleLaunchBot}
          disabled={isDeploying}
          className={cn(
            "w-full relative overflow-hidden rounded-xl p-3 transition-all duration-300",
            "bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-cyan)]/90 to-[var(--accent-purple)]",
            "hover:shadow-[0_0_30px_rgba(0,255,255,0.3)] hover:brightness-110",
            "active:scale-[0.98]",
            "group",
            isDeploying && "opacity-70 cursor-not-allowed"
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <div className="relative flex items-center justify-center gap-2">
            {isDeploying ? (
              <>
                <Loader2 size={18} className="text-black animate-spin" />
                <span className="text-sm font-black uppercase tracking-wider text-black">
                  Deploying...
                </span>
              </>
            ) : (
              <>
                <Zap size={18} className="text-black" />
                <span className="text-sm font-black uppercase tracking-wider text-black">
                  Launch {config.strategy.toUpperCase()} Bot
                </span>
              </>
            )}
          </div>
        </button>
      </div>
    </WidgetContainer>
  )
}

export default function BotsPage() {
  const [config, setConfig] = useState<BotConfig>(defaultConfig)
  const prices = useAppSelector(state => state.prices.prices)

  // Get current price for the output token (what we're trading)
  const outputMint = TOKEN_MINTS[config.inputToken] || config.inputToken
  const currentPrice = prices[outputMint] || 0

  const updateStrategy = (strategy: Strategy) => {
    setConfig(prev => ({ ...prev, strategy }))
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Page Header with Strategy Buttons */}
      <div className="shrink-0 flex items-center justify-center px-1">
        <StrategySelector strategy={config.strategy} onSelect={updateStrategy} />
      </div>

      {/* Widget Grid */}
      <div className="flex-1 min-h-0">
        <WidgetGrid page="bots">
          <div key="active-bots">
            <ActiveBotsWidget />
          </div>
          <div key="bot-creator">
            <BotCreatorWidget config={config} setConfig={setConfig} />
          </div>
          <div key="bot-preview">
            <BotPreviewWidget
              strategy={config.strategy}
              config={{
                lowerPrice: config.lowerPrice,
                upperPrice: config.upperPrice,
                gridLevels: config.gridLevels,
                investment: config.investment,
                // Grid - Advanced
                floorPrice: config.floorPrice,
                floorAction: config.floorAction,
                trailingEnabled: config.trailingEnabled,
                trailingMaxCycles: config.trailingMaxCycles,
                hysteresis: config.hysteresis,
                slippageBps: config.slippageBps,
                stopLossPct: config.stopLossPct,
                takeProfit: config.takeProfit,
                // DCA
                amountPerBuy: config.amountPerBuy,
                interval: config.interval,
                maxBuys: config.maxBuys,
                // TWAP/VWAP
                totalAmount: config.totalAmount,
                duration: config.duration,
                maxDeviation: config.maxDeviation,
              }}
              inputToken={config.outputToken}
              outputToken={config.inputToken}
              currentPrice={currentPrice}
            />
          </div>
          <div key="trade-history">
            <TradeHistoryWidget />
          </div>
        </WidgetGrid>
      </div>
    </div>
  )
}
