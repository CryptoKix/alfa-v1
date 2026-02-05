import { useState } from 'react'
import { WidgetGrid } from '@/components/layout'
import { ActiveBotsWidget } from '@/components/widgets'
import { TradeHistoryWidget } from '@/components/widgets/portfolio/TradeHistoryWidget'
import { BotPreviewWidget } from '@/components/widgets/BotPreviewWidget'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { BacktestModal } from '@/components/modals/BacktestModal'
import { Plus, ChevronDown, ChevronUp, Shield, TrendingUp, Sliders, Grid3X3, Clock, BarChart3, Zap, Loader2, Users, Activity, LineChart, Waves, GitMerge, Layers, History } from 'lucide-react'
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
  grid: { icon: Grid3X3, label: 'Grid' },
  twap: { icon: Clock, label: 'TWAP' },
  vwap: { icon: BarChart3, label: 'VWAP' },
  rsi: { icon: Activity, label: 'RSI' },
  macd: { icon: LineChart, label: 'MACD' },
  bollinger: { icon: Waves, label: 'BB' },
  ema_cross: { icon: GitMerge, label: 'EMA' },
  multi: { icon: Layers, label: 'Multi' },
  wolfpack: { icon: Users, label: 'Wolf' },
}

type Strategy = 'grid' | 'twap' | 'vwap' | 'rsi' | 'macd' | 'bollinger' | 'ema_cross' | 'multi' | 'wolfpack'

function StrategySelector({
  strategy,
  onSelect
}: {
  strategy: Strategy
  onSelect: (s: Strategy) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {(Object.keys(strategyInfo) as Strategy[]).map((s) => {
        const info = strategyInfo[s]
        const Icon = info.icon
        const isActive = strategy === s
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className={cn(
              "flex items-center gap-2 h-9 px-3 rounded-lg border transition-all",
              isActive
                ? "bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan shadow-[0_0_10px_rgba(0,255,255,0.15)]"
                : "bg-background-card border-white/10 text-white/60 hover:border-accent-cyan/30 hover:text-white"
            )}
          >
            <Icon size={14} strokeWidth={2} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {info.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Shared state type for bot configuration
interface BotConfig {
  strategy: 'grid' | 'twap' | 'vwap' | 'rsi' | 'macd' | 'bollinger' | 'ema_cross' | 'multi' | 'wolfpack'
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
  // Wolfpack
  consensusThreshold: number
  timeWindow: number
  buyAmount: number
  wolfpackSlippage: number
  priorityFee: number
  // Indicator bots - common
  timeframe: '1H' | '4H'
  positionSize: number
  cooldownMinutes: number
  // RSI config
  rsiPeriod: number
  buyThreshold: number
  sellThreshold: number
  // MACD config
  macdFast: number
  macdSlow: number
  macdSignal: number
  requireHistogramConfirm: boolean
  // Bollinger config
  bbPeriod: number
  bbStd: number
  entryMode: 'touch' | 'close_beyond'
  exitTarget: 'middle' | 'upper'
  // EMA config
  emaFast: number
  emaSlow: number
  // Multi-indicator config
  indicators: string[]
  minConfluence: number
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
  // Wolfpack
  consensusThreshold: 2,
  timeWindow: 60,
  buyAmount: 0.1,
  wolfpackSlippage: 15,
  priorityFee: 0.005,
  // Indicator bots - common
  timeframe: '1H',
  positionSize: 100,
  cooldownMinutes: 60,
  // RSI config
  rsiPeriod: 14,
  buyThreshold: 30,
  sellThreshold: 70,
  // MACD config
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  requireHistogramConfirm: true,
  // Bollinger config
  bbPeriod: 20,
  bbStd: 2.0,
  entryMode: 'touch',
  exitTarget: 'middle',
  // EMA config
  emaFast: 9,
  emaSlow: 21,
  // Multi-indicator config
  indicators: ['RSI', 'MACD', 'BB'],
  minConfluence: 2,
}

// Indicator strategies that support backtesting
const INDICATOR_STRATEGIES = ['rsi', 'macd', 'bollinger', 'ema_cross', 'multi']

function BotCreatorWidget({ config, setConfig }: {
  config: BotConfig
  setConfig: React.Dispatch<React.SetStateAction<BotConfig>>
}) {
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deploySuccess, setDeploySuccess] = useState(false)
  const [isBacktestOpen, setIsBacktestOpen] = useState(false)

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
      } else if (config.strategy === 'rsi') {
        body = {
          strategy: 'RSI_BOT',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          positionSize: config.positionSize,
          timeframe: config.timeframe,
          cooldownMinutes: config.cooldownMinutes,
          rsiPeriod: config.rsiPeriod,
          buyThreshold: config.buyThreshold,
          sellThreshold: config.sellThreshold,
          slippageBps: config.slippageBps,
        }
      } else if (config.strategy === 'macd') {
        body = {
          strategy: 'MACD_BOT',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          positionSize: config.positionSize,
          timeframe: config.timeframe,
          cooldownMinutes: config.cooldownMinutes,
          macdFast: config.macdFast,
          macdSlow: config.macdSlow,
          macdSignal: config.macdSignal,
          requireHistogramConfirm: config.requireHistogramConfirm,
          slippageBps: config.slippageBps,
        }
      } else if (config.strategy === 'bollinger') {
        body = {
          strategy: 'BB_BOT',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          positionSize: config.positionSize,
          timeframe: config.timeframe,
          cooldownMinutes: config.cooldownMinutes,
          bbPeriod: config.bbPeriod,
          bbStd: config.bbStd,
          entryMode: config.entryMode,
          exitTarget: config.exitTarget,
          slippageBps: config.slippageBps,
        }
      } else if (config.strategy === 'ema_cross') {
        body = {
          strategy: 'EMA_CROSS_BOT',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          positionSize: config.positionSize,
          timeframe: config.timeframe,
          cooldownMinutes: config.cooldownMinutes,
          emaFast: config.emaFast,
          emaSlow: config.emaSlow,
          slippageBps: config.slippageBps,
        }
      } else if (config.strategy === 'multi') {
        body = {
          strategy: 'MULTI_IND_BOT',
          alias: config.alias || undefined,
          inputMint,
          outputMint,
          positionSize: config.positionSize,
          timeframe: config.timeframe,
          cooldownMinutes: config.cooldownMinutes,
          indicators: config.indicators,
          minConfluence: config.minConfluence,
          // Include all indicator configs for the multi-indicator bot
          rsiPeriod: config.rsiPeriod,
          buyThreshold: config.buyThreshold,
          sellThreshold: config.sellThreshold,
          macdFast: config.macdFast,
          macdSlow: config.macdSlow,
          macdSignal: config.macdSignal,
          bbPeriod: config.bbPeriod,
          bbStd: config.bbStd,
          emaFast: config.emaFast,
          emaSlow: config.emaSlow,
          slippageBps: config.slippageBps,
        }
      } else if (config.strategy === 'wolfpack') {
        // Wolfpack uses a different endpoint - it's a service config, not a bot
        endpoint = '/api/wolfpack/update'
        body = {
          enabled: true,
          consensus_threshold: config.consensusThreshold,
          time_window: config.timeWindow,
          buy_amount: config.buyAmount,
          slippage: config.wolfpackSlippage,
          priority_fee: config.priorityFee,
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
          <label className="text-xs text-white mb-1 block">Bot Name</label>
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
            <label className="text-xs text-white mb-1 block">Buy Token</label>
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
            <label className="text-xs text-white mb-1 block">With Token</label>
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
                  <label className="text-[10px] text-white mb-1 block">Lower Price</label>
                  <Input
                    type="number"
                    placeholder="100.00"
                    value={config.lowerPrice || ''}
                    onChange={(e) => updateConfig('lowerPrice', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Upper Price</label>
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
                  <label className="text-[10px] text-white mb-1 block">Grid Levels</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="10"
                    value={config.gridLevels || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '')
                      updateConfig('gridLevels', val === '' ? '' : parseInt(val))
                    }}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Investment ({config.outputToken})</label>
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
                      <label className="text-[10px] text-white mb-1 block">Floor Price (Stop-Loss)</label>
                      <Input
                        type="number"
                        placeholder="Optional"
                        value={config.floorPrice || ''}
                        onChange={(e) => updateConfig('floorPrice', e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white mb-1 block">Floor Action</label>
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
                      <label className="text-[10px] text-white mb-1 block">Stop Loss %</label>
                      <Input
                        type="number"
                        placeholder="Optional"
                        value={config.stopLossPct || ''}
                        onChange={(e) => updateConfig('stopLossPct', e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white mb-1 block">Take Profit %</label>
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
                      <label className="text-[10px] text-white mb-1 block">Max Trailing Cycles (0 = unlimited)</label>
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
                      <label className="text-[10px] text-white mb-1 block">Hysteresis %</label>
                      <Input
                        type="number"
                        placeholder="0.01"
                        step="0.01"
                        value={config.hysteresis || ''}
                        onChange={(e) => updateConfig('hysteresis', parseFloat(e.target.value) || 0.01)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white mb-1 block">Slippage (bps)</label>
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

        {/* TWAP/VWAP Config */}
        {(config.strategy === 'twap' || config.strategy === 'vwap') && (
          <GlassCard padding="md" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white mb-1 block">Total Amount ({config.outputToken})</label>
                <Input
                  type="number"
                  placeholder="1000"
                  value={config.totalAmount || ''}
                  onChange={(e) => updateConfig('totalAmount', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-white mb-1 block">Duration (hours)</label>
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
                <label className="text-xs text-white mb-1 block">Max Price Deviation (%)</label>
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

        {/* RSI Bot Config */}
        {config.strategy === 'rsi' && (
          <>
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-cyan uppercase tracking-wider font-bold flex items-center gap-1">
                <Activity size={10} />
                RSI Settings
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">RSI Period</label>
                  <Input
                    type="number"
                    placeholder="14"
                    value={config.rsiPeriod || ''}
                    onChange={(e) => updateConfig('rsiPeriod', parseInt(e.target.value) || 14)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Timeframe</label>
                  <Select
                    options={[
                      { value: '1H', label: '1 Hour' },
                      { value: '4H', label: '4 Hours' },
                    ]}
                    value={config.timeframe}
                    onChange={(e) => updateConfig('timeframe', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Buy Below (Oversold)</label>
                  <Input
                    type="number"
                    placeholder="30"
                    value={config.buyThreshold || ''}
                    onChange={(e) => updateConfig('buyThreshold', parseFloat(e.target.value) || 30)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Sell Above (Overbought)</label>
                  <Input
                    type="number"
                    placeholder="70"
                    value={config.sellThreshold || ''}
                    onChange={(e) => updateConfig('sellThreshold', parseFloat(e.target.value) || 70)}
                  />
                </div>
              </div>
            </GlassCard>

            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-pink uppercase tracking-wider font-bold flex items-center gap-1">
                <Zap size={10} />
                Execution
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Position Size ({config.outputToken})</label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={config.positionSize || ''}
                    onChange={(e) => updateConfig('positionSize', parseFloat(e.target.value) || 100)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Cooldown (minutes)</label>
                  <Input
                    type="number"
                    placeholder="60"
                    value={config.cooldownMinutes || ''}
                    onChange={(e) => updateConfig('cooldownMinutes', parseInt(e.target.value) || 60)}
                  />
                </div>
              </div>
            </GlassCard>
          </>
        )}

        {/* MACD Bot Config */}
        {config.strategy === 'macd' && (
          <>
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-cyan uppercase tracking-wider font-bold flex items-center gap-1">
                <LineChart size={10} />
                MACD Settings
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Fast EMA</label>
                  <Input
                    type="number"
                    placeholder="12"
                    value={config.macdFast || ''}
                    onChange={(e) => updateConfig('macdFast', parseInt(e.target.value) || 12)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Slow EMA</label>
                  <Input
                    type="number"
                    placeholder="26"
                    value={config.macdSlow || ''}
                    onChange={(e) => updateConfig('macdSlow', parseInt(e.target.value) || 26)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Signal</label>
                  <Input
                    type="number"
                    placeholder="9"
                    value={config.macdSignal || ''}
                    onChange={(e) => updateConfig('macdSignal', parseInt(e.target.value) || 9)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-[10px] text-white/70 font-medium">Require Histogram Confirmation</span>
                <button
                  onClick={() => updateConfig('requireHistogramConfirm', !config.requireHistogramConfirm)}
                  className={cn(
                    "w-11 h-6 rounded-full transition-all duration-300 relative border",
                    config.requireHistogramConfirm
                      ? "bg-accent-cyan/20 border-accent-cyan/50"
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300",
                    config.requireHistogramConfirm ? "left-5 bg-accent-cyan" : "left-0.5 bg-white/50"
                  )} />
                </button>
              </div>
            </GlassCard>

            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-pink uppercase tracking-wider font-bold flex items-center gap-1">
                <Zap size={10} />
                Execution
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Position Size ({config.outputToken})</label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={config.positionSize || ''}
                    onChange={(e) => updateConfig('positionSize', parseFloat(e.target.value) || 100)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Timeframe</label>
                  <Select
                    options={[
                      { value: '1H', label: '1 Hour' },
                      { value: '4H', label: '4 Hours' },
                    ]}
                    value={config.timeframe}
                    onChange={(e) => updateConfig('timeframe', e.target.value)}
                  />
                </div>
              </div>
            </GlassCard>
          </>
        )}

        {/* Bollinger Bands Bot Config */}
        {config.strategy === 'bollinger' && (
          <>
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-cyan uppercase tracking-wider font-bold flex items-center gap-1">
                <Waves size={10} />
                Bollinger Bands Settings
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Period</label>
                  <Input
                    type="number"
                    placeholder="20"
                    value={config.bbPeriod || ''}
                    onChange={(e) => updateConfig('bbPeriod', parseInt(e.target.value) || 20)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Std Deviation</label>
                  <Input
                    type="number"
                    placeholder="2.0"
                    step="0.5"
                    value={config.bbStd || ''}
                    onChange={(e) => updateConfig('bbStd', parseFloat(e.target.value) || 2.0)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Entry Mode</label>
                  <Select
                    options={[
                      { value: 'touch', label: 'Touch Band' },
                      { value: 'close_beyond', label: 'Close Beyond' },
                    ]}
                    value={config.entryMode}
                    onChange={(e) => updateConfig('entryMode', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Exit Target</label>
                  <Select
                    options={[
                      { value: 'middle', label: 'Middle Band' },
                      { value: 'upper', label: 'Upper Band' },
                    ]}
                    value={config.exitTarget}
                    onChange={(e) => updateConfig('exitTarget', e.target.value)}
                  />
                </div>
              </div>
            </GlassCard>

            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-pink uppercase tracking-wider font-bold flex items-center gap-1">
                <Zap size={10} />
                Execution
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Position Size ({config.outputToken})</label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={config.positionSize || ''}
                    onChange={(e) => updateConfig('positionSize', parseFloat(e.target.value) || 100)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Timeframe</label>
                  <Select
                    options={[
                      { value: '1H', label: '1 Hour' },
                      { value: '4H', label: '4 Hours' },
                    ]}
                    value={config.timeframe}
                    onChange={(e) => updateConfig('timeframe', e.target.value)}
                  />
                </div>
              </div>
            </GlassCard>
          </>
        )}

        {/* EMA Crossover Bot Config */}
        {config.strategy === 'ema_cross' && (
          <>
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-cyan uppercase tracking-wider font-bold flex items-center gap-1">
                <GitMerge size={10} />
                EMA Crossover Settings
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Fast EMA</label>
                  <Input
                    type="number"
                    placeholder="9"
                    value={config.emaFast || ''}
                    onChange={(e) => updateConfig('emaFast', parseInt(e.target.value) || 9)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Slow EMA</label>
                  <Input
                    type="number"
                    placeholder="21"
                    value={config.emaSlow || ''}
                    onChange={(e) => updateConfig('emaSlow', parseInt(e.target.value) || 21)}
                  />
                </div>
              </div>
            </GlassCard>

            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-pink uppercase tracking-wider font-bold flex items-center gap-1">
                <Zap size={10} />
                Execution
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Position Size ({config.outputToken})</label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={config.positionSize || ''}
                    onChange={(e) => updateConfig('positionSize', parseFloat(e.target.value) || 100)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Timeframe</label>
                  <Select
                    options={[
                      { value: '1H', label: '1 Hour' },
                      { value: '4H', label: '4 Hours' },
                    ]}
                    value={config.timeframe}
                    onChange={(e) => updateConfig('timeframe', e.target.value)}
                  />
                </div>
              </div>
            </GlassCard>

            <div className="p-2 bg-accent-purple/5 border border-accent-purple/20 rounded-lg">
              <div className="text-[9px] text-accent-purple flex items-center gap-1">
                <GitMerge size={10} />
                Buys on golden cross (fast crosses above slow), sells on death cross
              </div>
            </div>
          </>
        )}

        {/* Multi-Indicator Bot Config */}
        {config.strategy === 'multi' && (
          <>
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-cyan uppercase tracking-wider font-bold flex items-center gap-1">
                <Layers size={10} />
                Active Indicators
              </div>
              <div className="flex flex-wrap gap-2">
                {['RSI', 'MACD', 'BB', 'EMA_CROSS'].map((ind) => (
                  <button
                    key={ind}
                    onClick={() => {
                      const current = config.indicators || []
                      if (current.includes(ind)) {
                        updateConfig('indicators', current.filter(i => i !== ind))
                      } else {
                        updateConfig('indicators', [...current, ind])
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                      (config.indicators || []).includes(ind)
                        ? "bg-accent-cyan/20 border border-accent-cyan/50 text-accent-cyan"
                        : "bg-white/5 border border-white/10 text-white/50"
                    )}
                  >
                    {ind.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[10px] text-white mb-1 block">Min Confluence (signals required)</label>
                <Select
                  options={[
                    { value: '2', label: '2 indicators' },
                    { value: '3', label: '3 indicators' },
                    { value: '4', label: '4 indicators (all)' },
                  ]}
                  value={String(config.minConfluence)}
                  onChange={(e) => updateConfig('minConfluence', parseInt(e.target.value))}
                />
              </div>
            </GlassCard>

            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-pink uppercase tracking-wider font-bold flex items-center gap-1">
                <Zap size={10} />
                Execution
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Position Size ({config.outputToken})</label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={config.positionSize || ''}
                    onChange={(e) => updateConfig('positionSize', parseFloat(e.target.value) || 100)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Timeframe</label>
                  <Select
                    options={[
                      { value: '1H', label: '1 Hour' },
                      { value: '4H', label: '4 Hours' },
                    ]}
                    value={config.timeframe}
                    onChange={(e) => updateConfig('timeframe', e.target.value)}
                  />
                </div>
              </div>
            </GlassCard>

            <div className="p-2 bg-accent-purple/5 border border-accent-purple/20 rounded-lg">
              <div className="text-[9px] text-accent-purple flex items-center gap-1">
                <Layers size={10} />
                Trades only when multiple indicators agree on the same signal
              </div>
            </div>
          </>
        )}

        {/* Wolfpack Config */}
        {config.strategy === 'wolfpack' && (
          <>
            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-cyan uppercase tracking-wider font-bold flex items-center gap-1">
                <Users size={10} />
                Consensus Settings
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Min Whales</label>
                  <Input
                    type="number"
                    placeholder="2"
                    value={config.consensusThreshold || ''}
                    onChange={(e) => updateConfig('consensusThreshold', parseInt(e.target.value) || 2)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Time Window (sec)</label>
                  <Input
                    type="number"
                    placeholder="60"
                    value={config.timeWindow || ''}
                    onChange={(e) => updateConfig('timeWindow', parseInt(e.target.value) || 60)}
                  />
                </div>
              </div>
            </GlassCard>

            <GlassCard padding="sm" className="space-y-2">
              <div className="text-[10px] text-accent-pink uppercase tracking-wider font-bold flex items-center gap-1">
                <Zap size={10} />
                Execution Settings
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white mb-1 block">Buy Amount (SOL)</label>
                  <Input
                    type="number"
                    placeholder="0.1"
                    step="0.01"
                    value={config.buyAmount || ''}
                    onChange={(e) => updateConfig('buyAmount', parseFloat(e.target.value) || 0.1)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white mb-1 block">Slippage (%)</label>
                  <Input
                    type="number"
                    placeholder="15"
                    value={config.wolfpackSlippage || ''}
                    onChange={(e) => updateConfig('wolfpackSlippage', parseFloat(e.target.value) || 15)}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-white mb-1 block">Priority Fee (SOL)</label>
                <Input
                  type="number"
                  placeholder="0.005"
                  step="0.001"
                  value={config.priorityFee || ''}
                  onChange={(e) => updateConfig('priorityFee', parseFloat(e.target.value) || 0.005)}
                />
              </div>
            </GlassCard>

            <div className="p-2 bg-accent-cyan/5 border border-accent-cyan/20 rounded-lg">
              <div className="text-[9px] text-accent-cyan flex items-center gap-1">
                <Users size={10} />
                Wolfpack monitors tracked whales and auto-buys when consensus is reached
              </div>
            </div>
          </>
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

        {/* Backtest Button - Only for indicator strategies */}
        {INDICATOR_STRATEGIES.includes(config.strategy) && (
          <button
            onClick={() => setIsBacktestOpen(true)}
            className={cn(
              "w-full relative overflow-hidden rounded-xl p-3 transition-all duration-300",
              "bg-gradient-to-r from-[var(--accent-purple)]/20 to-[var(--accent-pink)]/20",
              "border border-[var(--accent-purple)]/30",
              "hover:border-[var(--accent-purple)]/60 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]",
              "active:scale-[0.98]",
              "group"
            )}
          >
            <div className="relative flex items-center justify-center gap-2">
              <History size={18} className="text-[var(--accent-purple)]" />
              <span className="text-sm font-black uppercase tracking-wider text-[var(--accent-purple)]">
                Backtest Strategy
              </span>
            </div>
          </button>
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

      {/* Backtest Modal */}
      <BacktestModal
        isOpen={isBacktestOpen}
        onClose={() => setIsBacktestOpen(false)}
        mint={TOKEN_MINTS[config.inputToken] || config.inputToken}
        symbol={config.inputToken}
      />
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
                // Wolfpack
                consensusThreshold: config.consensusThreshold,
                timeWindow: config.timeWindow,
                buyAmount: config.buyAmount,
                wolfpackSlippage: config.wolfpackSlippage,
                priorityFee: config.priorityFee,
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
