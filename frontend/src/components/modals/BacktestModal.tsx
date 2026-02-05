import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, Activity, Zap, History, LineChart, Waves, GitMerge, Layers, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BacktestModalProps {
  isOpen: boolean
  onClose: () => void
  mint: string
  symbol: string
}

type StrategyType = 'RSI_BOT' | 'MACD_BOT' | 'BB_BOT' | 'EMA_CROSS_BOT' | 'MULTI_IND_BOT'

interface BacktestConfig {
  strategy: StrategyType
  timeframe: '1H' | '4H'
  hoursBack: number
  initialBalance: number
  // RSI
  rsiPeriod: number
  buyThreshold: number
  sellThreshold: number
  // MACD
  macdFast: number
  macdSlow: number
  macdSignal: number
  requireHistogramConfirm: boolean
  // Bollinger
  bbPeriod: number
  bbStd: number
  entryMode: 'touch' | 'close_beyond'
  exitTarget: 'middle' | 'upper'
  // EMA
  emaFast: number
  emaSlow: number
  // Multi
  indicators: string[]
  minConfluence: number
}

const defaultConfig: BacktestConfig = {
  strategy: 'RSI_BOT',
  timeframe: '1H',
  hoursBack: 168,
  initialBalance: 10000,
  // RSI
  rsiPeriod: 14,
  buyThreshold: 30,
  sellThreshold: 70,
  // MACD
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  requireHistogramConfirm: true,
  // Bollinger
  bbPeriod: 20,
  bbStd: 2.0,
  entryMode: 'touch',
  exitTarget: 'middle',
  // EMA
  emaFast: 9,
  emaSlow: 21,
  // Multi
  indicators: ['RSI', 'MACD', 'BB'],
  minConfluence: 2,
}

const strategyLabels: Record<StrategyType, { label: string; icon: React.ReactNode; desc: string }> = {
  RSI_BOT: { label: 'RSI', icon: <Activity size={14} />, desc: 'Overbought/Oversold' },
  MACD_BOT: { label: 'MACD', icon: <LineChart size={14} />, desc: 'Crossover Strategy' },
  BB_BOT: { label: 'Bollinger', icon: <Waves size={14} />, desc: 'Mean Reversion' },
  EMA_CROSS_BOT: { label: 'EMA Cross', icon: <GitMerge size={14} />, desc: 'Golden/Death Cross' },
  MULTI_IND_BOT: { label: 'Multi', icon: <Layers size={14} />, desc: 'Confluence Trading' },
}

export const BacktestModal: React.FC<BacktestModalProps> = ({ isOpen, onClose, mint, symbol }) => {
  const [config, setConfig] = useState<BacktestConfig>(defaultConfig)
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateConfig = (key: keyof BacktestConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  if (!isOpen) return null

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const body = {
        strategy: config.strategy,
        mint,
        symbol,
        timeframe: config.timeframe,
        hours_back: config.hoursBack,
        initial_balance: config.initialBalance,
        config: {
          // RSI
          rsi_period: config.rsiPeriod,
          buy_threshold: config.buyThreshold,
          sell_threshold: config.sellThreshold,
          // MACD
          macd_fast: config.macdFast,
          macd_slow: config.macdSlow,
          macd_signal: config.macdSignal,
          require_histogram_confirm: config.requireHistogramConfirm,
          // Bollinger
          bb_period: config.bbPeriod,
          bb_std: config.bbStd,
          entry_mode: config.entryMode,
          exit_target: config.exitTarget,
          // EMA
          ema_fast: config.emaFast,
          ema_slow: config.emaSlow,
          // Multi
          indicators: config.indicators,
          min_confluence: config.minConfluence,
          // Common
          position_size_pct: 100,
          symbol,
        }
      }

      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()

      if (data.success) {
        setResults(data.result)
      } else {
        setError(data.error || 'Backtest failed')
      }
    } catch (e: any) {
      console.error("Backtest failed", e)
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[90vh] bg-background-card border border-accent-cyan/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Gradient top line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-pink/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-accent-cyan/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-cyan/10 text-accent-cyan">
              <History size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{symbol} Backtest</h2>
              <p className="text-xs text-white/40">
                <span className="text-accent-purple">Indicator Strategy</span> • Historical Simulation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/40 hover:text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* Configuration Panel */}
          <div className="w-full lg:w-80 border-r border-accent-cyan/10 p-5 space-y-4 overflow-y-auto shrink-0" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,255,0.2) transparent' }}>
            {/* Strategy Selector */}
            <div className="space-y-2">
              <label className="text-[10px] text-accent-cyan/50 font-medium">Strategy Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(strategyLabels) as StrategyType[]).map((s) => {
                  const info = strategyLabels[s]
                  return (
                    <button
                      key={s}
                      onClick={() => updateConfig('strategy', s)}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-lg border transition-all text-left",
                        config.strategy === s
                          ? "bg-accent-cyan/10 border-accent-cyan/50 text-accent-cyan"
                          : "bg-accent-cyan/[0.02] border-accent-cyan/10 text-white/60 hover:border-accent-cyan/30"
                      )}
                    >
                      {info.icon}
                      <div>
                        <div className="text-[10px] font-medium">{info.label}</div>
                        <div className="text-[8px] text-white/30">{info.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time Settings */}
            <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4 space-y-3">
              <div className="text-[10px] text-accent-cyan/50 font-medium">Time Settings</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] text-white/40">Timeframe</label>
                  <select
                    value={config.timeframe}
                    onChange={(e) => updateConfig('timeframe', e.target.value)}
                    className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-accent-cyan/40"
                  >
                    <option value="1H">1 Hour</option>
                    <option value="4H">4 Hours</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] text-white/40">History</label>
                  <select
                    value={config.hoursBack}
                    onChange={(e) => updateConfig('hoursBack', parseInt(e.target.value))}
                    className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-accent-cyan/40"
                  >
                    <option value={24}>1 day</option>
                    <option value={72}>3 days</option>
                    <option value={168}>1 week</option>
                    <option value={336}>2 weeks</option>
                    <option value={720}>1 month</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Strategy-specific config */}
            {config.strategy === 'RSI_BOT' && (
              <div className="bg-accent-purple/[0.03] border border-accent-purple/10 rounded-xl p-4 space-y-3">
                <div className="text-[10px] text-accent-purple/60 font-medium">RSI Parameters</div>
                <div className="space-y-1.5">
                  <label className="text-[9px] text-white/40">Period</label>
                  <input
                    type="number"
                    value={config.rsiPeriod}
                    onChange={(e) => updateConfig('rsiPeriod', parseInt(e.target.value) || 14)}
                    className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent-cyan/40"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Buy Below</label>
                    <input
                      type="number"
                      value={config.buyThreshold}
                      onChange={(e) => updateConfig('buyThreshold', parseFloat(e.target.value) || 30)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-accent-cyan focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Sell Above</label>
                    <input
                      type="number"
                      value={config.sellThreshold}
                      onChange={(e) => updateConfig('sellThreshold', parseFloat(e.target.value) || 70)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-accent-pink focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                </div>
              </div>
            )}

            {config.strategy === 'MACD_BOT' && (
              <div className="bg-accent-purple/[0.03] border border-accent-purple/10 rounded-xl p-4 space-y-3">
                <div className="text-[10px] text-accent-purple/60 font-medium">MACD Parameters</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Fast</label>
                    <input
                      type="number"
                      value={config.macdFast}
                      onChange={(e) => updateConfig('macdFast', parseInt(e.target.value) || 12)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Slow</label>
                    <input
                      type="number"
                      value={config.macdSlow}
                      onChange={(e) => updateConfig('macdSlow', parseInt(e.target.value) || 26)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Signal</label>
                    <input
                      type="number"
                      value={config.macdSignal}
                      onChange={(e) => updateConfig('macdSignal', parseInt(e.target.value) || 9)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('requireHistogramConfirm', !config.requireHistogramConfirm)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all",
                    config.requireHistogramConfirm
                      ? "bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan"
                      : "bg-background-card border-accent-cyan/10 text-white/40"
                  )}
                >
                  <span className="text-[10px] font-medium">Histogram Confirm</span>
                  <div className={cn("w-2 h-2 rounded-full", config.requireHistogramConfirm ? "bg-accent-cyan" : "bg-white/20")} />
                </button>
              </div>
            )}

            {config.strategy === 'BB_BOT' && (
              <div className="bg-accent-purple/[0.03] border border-accent-purple/10 rounded-xl p-4 space-y-3">
                <div className="text-[10px] text-accent-purple/60 font-medium">Bollinger Parameters</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Period</label>
                    <input
                      type="number"
                      value={config.bbPeriod}
                      onChange={(e) => updateConfig('bbPeriod', parseInt(e.target.value) || 20)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Std Dev</label>
                    <input
                      type="number"
                      step="0.5"
                      value={config.bbStd}
                      onChange={(e) => updateConfig('bbStd', parseFloat(e.target.value) || 2.0)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Entry Mode</label>
                    <select
                      value={config.entryMode}
                      onChange={(e) => updateConfig('entryMode', e.target.value)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-accent-cyan/40"
                    >
                      <option value="touch">Touch</option>
                      <option value="close_beyond">Close Beyond</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Exit Target</label>
                    <select
                      value={config.exitTarget}
                      onChange={(e) => updateConfig('exitTarget', e.target.value)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-accent-cyan/40"
                    >
                      <option value="middle">Middle Band</option>
                      <option value="upper">Upper Band</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {config.strategy === 'EMA_CROSS_BOT' && (
              <div className="bg-accent-purple/[0.03] border border-accent-purple/10 rounded-xl p-4 space-y-3">
                <div className="text-[10px] text-accent-purple/60 font-medium">EMA Parameters</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Fast EMA</label>
                    <input
                      type="number"
                      value={config.emaFast}
                      onChange={(e) => updateConfig('emaFast', parseInt(e.target.value) || 9)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-accent-cyan focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-white/40">Slow EMA</label>
                    <input
                      type="number"
                      value={config.emaSlow}
                      onChange={(e) => updateConfig('emaSlow', parseInt(e.target.value) || 21)}
                      className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-accent-pink focus:outline-none focus:border-accent-cyan/40"
                    />
                  </div>
                </div>
              </div>
            )}

            {config.strategy === 'MULTI_IND_BOT' && (
              <div className="bg-accent-purple/[0.03] border border-accent-purple/10 rounded-xl p-4 space-y-3">
                <div className="text-[10px] text-accent-purple/60 font-medium">Multi-Indicator Settings</div>
                <div className="space-y-1.5">
                  <label className="text-[9px] text-white/40">Active Indicators</label>
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
                          "px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all border",
                          (config.indicators || []).includes(ind)
                            ? "bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan"
                            : "bg-background-card border-accent-cyan/10 text-white/40"
                        )}
                      >
                        {ind.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] text-white/40">Min Confluence</label>
                  <select
                    value={config.minConfluence}
                    onChange={(e) => updateConfig('minConfluence', parseInt(e.target.value))}
                    className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:border-accent-cyan/40"
                  >
                    <option value={2}>2 signals</option>
                    <option value={3}>3 signals</option>
                    <option value={4}>4 signals</option>
                  </select>
                </div>
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-accent-cyan/10 bg-accent-cyan/[0.02] text-white/40 hover:bg-accent-cyan/[0.04] transition-all"
            >
              <span className="text-[10px] font-medium">Advanced Settings</span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4 space-y-1.5">
                <label className="text-[9px] text-white/40">Initial Balance ($)</label>
                <input
                  type="number"
                  value={config.initialBalance}
                  onChange={(e) => updateConfig('initialBalance', parseFloat(e.target.value) || 10000)}
                  className="w-full bg-background-card border border-accent-cyan/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent-cyan/40"
                />
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-accent-pink/10 border border-accent-pink/20 rounded-lg text-xs text-accent-pink">
                {error}
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-accent-cyan to-accent-purple text-black rounded-lg font-medium text-sm shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Activity size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
              Run Backtest
            </button>
          </div>

          {/* Results Panel */}
          <div className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,255,0.2) transparent' }}>
            {results ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                    <div className="text-[10px] text-accent-cyan/50 mb-1">Final Balance</div>
                    <div className="text-lg font-medium text-white font-mono">${results.final_balance?.toFixed(2)}</div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                    <div className="text-[10px] text-accent-cyan/50 mb-1">Total ROI</div>
                    <div className={cn("text-lg font-medium font-mono flex items-center gap-1", results.profit_pct > 0 ? "text-accent-cyan" : "text-accent-pink")}>
                      {results.profit_pct > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {results.profit_pct > 0 ? '+' : ''}{results.profit_pct?.toFixed(2)}%
                    </div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                    <div className="text-[10px] text-accent-cyan/50 mb-1">Win Rate</div>
                    <div className="text-lg font-medium text-accent-cyan font-mono">{results.win_rate?.toFixed(1)}%</div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                    <div className="text-[10px] text-accent-cyan/50 mb-1">Trade Count</div>
                    <div className="text-lg font-medium text-white font-mono">{results.total_trades}</div>
                  </div>
                </div>

                {/* Secondary Stats */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <div className="bg-accent-purple/[0.03] border border-accent-purple/10 rounded-xl p-3">
                    <div className="text-[9px] text-accent-purple/60 mb-0.5">Max Drawdown</div>
                    <div className="text-sm font-medium text-accent-pink font-mono">{results.max_drawdown_pct?.toFixed(1)}%</div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-3">
                    <div className="text-[9px] text-white/40 mb-0.5">Sharpe</div>
                    <div className="text-sm font-medium text-white font-mono">{results.sharpe_ratio?.toFixed(2)}</div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-3">
                    <div className="text-[9px] text-white/40 mb-0.5">Profit Factor</div>
                    <div className="text-sm font-medium text-white font-mono">{results.profit_factor?.toFixed(2)}</div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-3">
                    <div className="text-[9px] text-white/40 mb-0.5">Avg Win</div>
                    <div className="text-sm font-medium text-accent-cyan font-mono">${results.avg_win?.toFixed(2)}</div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-3">
                    <div className="text-[9px] text-white/40 mb-0.5">Avg Loss</div>
                    <div className="text-sm font-medium text-accent-pink font-mono">${results.avg_loss?.toFixed(2)}</div>
                  </div>
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-3">
                    <div className="text-[9px] text-white/40 mb-0.5">Fees Paid</div>
                    <div className="text-sm font-medium text-white/40 font-mono">${results.total_fees_paid?.toFixed(2)}</div>
                  </div>
                </div>

                {/* Equity Curve (mini) */}
                {results.equity_curve && results.equity_curve.length > 1 && (
                  <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl p-4">
                    <div className="text-[10px] text-accent-cyan/50 mb-3">Equity Curve</div>
                    <div className="h-20 flex items-end gap-0.5">
                      {results.equity_curve.map((point: any, i: number) => {
                        const min = Math.min(...results.equity_curve.map((p: any) => p.equity))
                        const max = Math.max(...results.equity_curve.map((p: any) => p.equity))
                        const range = max - min || 1
                        const height = ((point.equity - min) / range) * 100
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 rounded-t transition-all",
                              point.equity >= config.initialBalance ? "bg-accent-cyan/50" : "bg-accent-pink/50"
                            )}
                            style={{ height: `${Math.max(5, height)}%` }}
                            title={`$${point.equity.toFixed(2)}`}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Trade History */}
                <div className="bg-accent-cyan/[0.02] border border-accent-cyan/10 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-accent-cyan/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History size={14} className="text-accent-cyan/50" />
                      <span className="text-xs text-accent-cyan/70">Trade History</span>
                    </div>
                    <div className="text-[10px] text-accent-cyan/50">
                      <span className="text-accent-cyan">{results.trades?.length || 0}</span> trades
                    </div>
                  </div>
                  <div className="max-h-64 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,255,0.2) transparent' }}>
                    <table className="w-full">
                      <thead className="sticky top-0 bg-background-card">
                        <tr className="text-[10px] text-accent-cyan/40">
                          <th className="text-left px-4 py-2 font-medium">Time</th>
                          <th className="text-left px-4 py-2 font-medium">Action</th>
                          <th className="text-left px-4 py-2 font-medium">Price</th>
                          <th className="text-left px-4 py-2 font-medium">Indicator</th>
                          <th className="text-right px-4 py-2 font-medium">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.trades?.map((t: any, i: number) => (
                          <tr key={i} className="text-[11px] font-mono hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-2 text-white/40">{new Date(t.timestamp * 1000).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-4 py-2">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[9px]",
                                t.type === 'buy'
                                  ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                                  : "bg-accent-pink/10 text-accent-pink border border-accent-pink/20"
                              )}>
                                {t.type.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-white">${t.price?.toFixed(4)}</td>
                            <td className="px-4 py-2 text-white/40">{t.indicator_value?.toFixed(2)}</td>
                            <td className={cn("px-4 py-2 text-right font-medium", t.pnl > 0 ? "text-accent-cyan" : t.pnl < 0 ? "text-accent-pink" : "text-white/30")}>
                              {t.type === 'sell' ? (t.pnl > 0 ? '+' : '') + t.pnl?.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-white/20 gap-4">
                <Activity size={48} className="text-accent-cyan/20" />
                <div className="text-center">
                  <p className="text-sm text-white/40">Configure your strategy</p>
                  <p className="text-xs text-white/20 mt-1 max-w-xs">Select parameters and click "Run Backtest" to simulate historical performance</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-accent-cyan/10 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-purple text-black hover:opacity-90 transition-colors text-sm font-medium shadow-[0_0_15px_rgba(0,255,255,0.2)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
