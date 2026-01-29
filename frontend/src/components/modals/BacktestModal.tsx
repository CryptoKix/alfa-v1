import React, { useState } from 'react'
import { X, Play, Activity, Zap, History } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BacktestModalProps {
  isOpen: boolean
  onClose: () => void
  mint: string
  symbol: string
}

export const BacktestModal: React.FC<BacktestModalProps> = ({ isOpen, onClose, mint, symbol }) => {
  const [hours, setHours] = useState('168') // 1 week
  const [timeframe, setTimeframe] = useState('1H')
  const [rsiLow, setRsiLow] = useState('30')
  const [rsiHigh, setRsiHigh] = useState('70')
  const [useBB, setUseBB] = useState(true)
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleRun = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/backtest/run?mint=${mint}&hours=${hours}&timeframe=${timeframe}&rsiLow=${rsiLow}&rsiHigh=${rsiHigh}&useBB=${useBB}`)
      const data = await res.json()
      setResults(data)
    } catch (e) {
      console.error("Backtest failed", e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-background-card border border-accent-cyan/20 rounded-3xl w-full max-w-4xl relative overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent z-20" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-accent-cyan/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-cyan/10 rounded-xl text-accent-cyan shadow-[0_0_15px_rgba(0,255,255,0.1)]">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">TIME MACHINE: {symbol}</h2>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold text-accent-cyan">Historical Strategy Simulation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-text-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* Configuration Panel */}
          <div className="w-full lg:w-80 border-r border-accent-cyan/10 p-6 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Historical Window (Hours)</label>
                <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-3 text-sm font-mono font-bold text-white focus:outline-none focus:border-accent-cyan h-12" placeholder="168" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">Candle Timeframe</label>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-3 text-sm font-bold text-white focus:outline-none h-12">
                  <option value="15m">15 Minutes</option>
                  <option value="1H">1 Hour</option>
                  <option value="4H">4 Hours</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">RSI Buy</label>
                  <input type="number" value={rsiLow} onChange={(e) => setRsiLow(e.target.value)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-3 text-xs font-mono font-bold text-white focus:outline-none h-12" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-widest text-text-muted font-bold px-1">RSI Sell</label>
                  <input type="number" value={rsiHigh} onChange={(e) => setRsiHigh(e.target.value)} className="w-full bg-background-elevated border border-accent-cyan/20 rounded-xl p-3 text-xs font-mono font-bold text-white focus:outline-none h-12" />
                </div>
              </div>

              <button
                onClick={() => setUseBB(!useBB)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl border transition-all h-12",
                  useBB ? "bg-accent-cyan/10 border-accent-cyan text-accent-cyan" : "bg-white/5 border-accent-cyan/20 text-text-muted"
                )}
              >
                <span className="text-[10px] font-black uppercase tracking-widest">Bollinger Reversion</span>
                <div className={cn("w-2 h-2 rounded-full", useBB ? "bg-accent-cyan animate-pulse" : "bg-white/20")} />
              </button>
            </div>

            <button onClick={handleRun} disabled={loading} className="w-full py-4 bg-accent-cyan text-black rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(0,255,255,0.2)] hover:bg-white transition-all flex items-center justify-center gap-3 active:scale-95">
              {loading ? <Activity size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
              Execute Simulation
            </button>
          </div>

          {/* Results Panel */}
          <div className="flex-1 bg-black/20 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar min-h-0">
            {results ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-4">
                    <div className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Final Balance</div>
                    <div className="text-xl font-black text-white font-mono">${results.final_balance.toFixed(2)}</div>
                  </div>
                  <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-4">
                    <div className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Total ROI</div>
                    <div className={cn("text-xl font-black font-mono", results.profit_pct > 0 ? "text-accent-cyan" : "text-accent-pink")}>
                      {results.profit_pct > 0 ? '+' : ''}{results.profit_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-4">
                    <div className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Win Rate</div>
                    <div className="text-xl font-black text-accent-cyan font-mono">{results.win_rate.toFixed(1)}%</div>
                  </div>
                  <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-4">
                    <div className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Trade Count</div>
                    <div className="text-xl font-black text-white font-mono">{results.total_trades}</div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <History size={14} className="text-text-muted" />
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Trade Forensics</span>
                  </div>
                  <div className="flex-1 bg-background-card border border-accent-cyan/10 rounded-2xl overflow-hidden flex flex-col min-h-0">
                    <div className="grid grid-cols-4 gap-2 p-3 border-b border-accent-cyan/10 bg-white/[0.02] text-[8px] font-black text-text-muted uppercase tracking-widest">
                      <div>Timestamp</div>
                      <div>Action</div>
                      <div>Price</div>
                      <div className="text-right">RSI</div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {results.trades.map((t: any, i: number) => (
                        <div key={i} className="grid grid-cols-4 gap-2 p-3 border-b border-white/[0.02] font-mono text-[10px] hover:bg-white/[0.02] transition-colors">
                          <div className="text-text-muted">{new Date(t.timestamp * 1000).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                          <div className={cn("font-black", t.type === 'BUY' ? "text-accent-cyan" : "text-accent-pink")}>{t.type}</div>
                          <div className="font-bold text-white/80">${t.price.toFixed(4)}</div>
                          <div className={cn("text-right font-black", t.rsi < 30 ? "text-accent-cyan" : t.rsi > 70 ? "text-accent-pink" : "text-white/40")}>{t.rsi.toFixed(1)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-4 opacity-30">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-text-muted flex items-center justify-center animate-spin-slow">
                  <Zap size={40} />
                </div>
                <div className="text-center">
                  <div className="text-xs font-black uppercase tracking-[0.2em] mb-1">Engine Ready</div>
                  <p className="text-[9px] max-w-xs leading-relaxed font-bold">Configure parameters and execute simulation to reveal historical alpha.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
