import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Activity } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

export const EquityCurveWidget = () => {
  const [history, setHistory] = useState<any[]>([])
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      try {
        const limit = range === '24h' ? 24 : range === '7d' ? 168 : 720
        const res = await fetch(`/api/portfolio/history?limit=${limit}`)
        const data = await res.json()
        setHistory(data)
      } catch (e) {
        console.error("Failed to fetch equity history", e)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [range])

  const chartData = useMemo(() => {
    return history.map(h => ({
      time: new Date(h.timestamp).getTime(),
      displayTime: new Date(h.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' }),
      value: h.total_value_usd
    }))
  }, [history])

  const stats = useMemo(() => {
    if (history.length < 2) return { change: 0, pct: 0 }
    const start = history[0].total_value_usd
    const end = history[history.length - 1].total_value_usd
    const change = end - start
    const pct = (change / start) * 100
    return { change, pct }
  }, [history])

  if (loading && history.length === 0) {
    return (
      <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col h-full items-center justify-center min-h-[300px]">
        <Activity className="animate-spin text-accent-cyan" />
      </div>
    )
  }

  return (
    <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col h-full group">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent z-20" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-accent-cyan/10 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-cyan/10 rounded-xl text-accent-cyan">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">Equity Curve</h3>
          </div>
        </div>

        <div className="flex bg-black/20 rounded-lg p-1 border border-accent-cyan/10 gap-1">
          {(['24h', '7d', '30d'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded transition-all",
                range === r ? "bg-accent-cyan text-black" : "text-text-muted hover:text-white"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="flex items-end gap-4 mb-4">
        <div>
          <div className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Total Value</div>
          <div className="text-2xl font-black text-white font-mono tracking-tighter">
            ${chartData.length > 0 ? chartData[chartData.length - 1].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </div>
        </div>
        <div className="pb-1">
          <div className={cn(
            "text-xs font-black font-mono flex items-center gap-1",
            stats.pct >= 0 ? "text-accent-cyan" : "text-accent-pink"
          )}>
            {stats.pct >= 0 ? '+' : ''}{stats.pct.toFixed(2)}%
            <span className="text-[8px] opacity-50 uppercase tracking-tighter ml-1">vs start of period</span>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-0 -ml-6 -mr-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ffff" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#00ffff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
            <XAxis
              dataKey="displayTime"
              hide={true}
            />
            <YAxis
              hide={true}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-background-card/95 backdrop-blur-md border border-accent-cyan/30 p-2 rounded-xl shadow-2xl">
                      <div className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">{payload[0].payload.displayTime}</div>
                      <div className="text-sm font-black text-accent-cyan font-mono">${payload[0].value?.toLocaleString()}</div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#00ffff"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValue)"
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Real-time Indicator */}
      <div className="mt-4 flex items-center justify-between border-t border-accent-cyan/10 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
          <span className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Live Telemetry</span>
        </div>
        <div className="flex items-center gap-1 text-text-muted group-hover:text-accent-cyan transition-colors">
          <Activity size={10} />
          <span className="text-[8px] font-bold uppercase tracking-widest">{chartData.length} Snapshots</span>
        </div>
      </div>
    </div>
  )
}
