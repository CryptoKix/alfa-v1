import { useEffect } from 'react'
import { Zap, Clock, ArrowRight, Radio } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setSignals } from '@/features/copytrade/copytradeSlice'

interface CopySignalsWidgetProps {
  maxSignals?: number
  compact?: boolean
}

export const CopySignalsWidget = ({ maxSignals = 5, compact = false }: CopySignalsWidgetProps) => {
  const dispatch = useAppDispatch()
  const { signals } = useAppSelector(state => state.copytrade)

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await fetch('/api/copytrade/signals')
        const data = await res.json()
        if (Array.isArray(data)) dispatch(setSignals(data))
      } catch (e) {}
    }
    fetchSignals()
  }, [dispatch])

  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    const now = new Date()
    const diff = (now.getTime() - date.getTime()) / 1000

    if (diff < 60) return `${Math.floor(diff)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return date.toLocaleDateString()
  }

  const displaySignals = signals?.slice(0, maxSignals) || []

  if (compact) {
    return (
      <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col h-full">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 via-accent-cyan/20 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Radio className="text-accent-cyan" size={16} />
            <h3 className="text-xs font-bold uppercase tracking-tight text-white">Live Signals</h3>
          </div>
          {signals && signals.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              <span className="text-[9px] text-accent-green font-bold">{signals.length}</span>
            </div>
          )}
        </div>

        {/* Signals List */}
        <div className="flex-1 overflow-auto custom-scrollbar space-y-2 min-h-0">
          {displaySignals.length > 0 ? (
            displaySignals.map(s => (
              <div
                key={s.signature}
                className="p-2 rounded-lg border border-accent-cyan/10 bg-background-elevated/30 hover:bg-accent-cyan/5 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-accent-cyan uppercase">{s.alias}</span>
                  <span className="text-[8px] text-text-muted">{formatTime(s.timestamp)}</span>
                </div>
                {s.sent && s.received && (
                  <div className="flex items-center gap-1 text-[9px] text-text-secondary">
                    <span className="text-accent-pink">{s.sent.amount.toFixed(2)} {s.sent.symbol}</span>
                    <ArrowRight size={10} className="text-text-muted" />
                    <span className="text-accent-green">{s.received.amount.toFixed(2)} {s.received.symbol}</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50 gap-2">
              <Radio size={20} />
              <span className="text-[10px] italic">Monitoring whales...</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col h-full">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 via-accent-cyan/20 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-accent-cyan/10 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
        <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-white">
          <Zap className="text-accent-cyan" size={18} />
          Whale Signals
        </h3>
        {signals && signals.length > 0 && (
          <div className="flex items-center gap-2 bg-accent-cyan/10 px-2 py-1 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
            <span className="text-[10px] text-accent-cyan font-bold uppercase">{signals.length} Signals</span>
          </div>
        )}
      </div>

      {/* Signals Table */}
      <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
        {displaySignals.length > 0 ? (
          <div className="space-y-2">
            {displaySignals.map(s => (
              <div
                key={s.signature}
                className="p-3 rounded-xl border border-accent-cyan/10 bg-background-elevated/30 hover:bg-accent-cyan/5 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg shrink-0 text-accent-cyan bg-accent-cyan/10 group-hover:bg-accent-cyan/20 transition-colors">
                    <Zap size={14} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold text-white uppercase tracking-tight truncate">
                        {s.type || 'SWAP'} - {s.alias}
                      </span>
                      <span className="text-[9px] text-text-muted font-mono shrink-0 flex items-center gap-1">
                        <Clock size={10} />
                        {formatTime(s.timestamp)}
                      </span>
                    </div>

                    {s.sent && s.received ? (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-accent-pink font-mono">
                          -{s.sent.amount.toFixed(4)} {s.sent.symbol}
                        </span>
                        <ArrowRight size={12} className="text-text-muted" />
                        <span className="text-accent-green font-mono">
                          +{s.received.amount.toFixed(4)} {s.received.symbol}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-text-secondary">
                        Activity detected
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50 gap-2">
            <Radio size={24} />
            <span className="text-xs italic uppercase tracking-widest">Listening for signals...</span>
          </div>
        )}
      </div>
    </div>
  )
}
