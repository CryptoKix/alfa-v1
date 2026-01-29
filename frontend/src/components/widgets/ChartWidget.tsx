import { useEffect, useRef, useState, memo } from 'react'
import { createChart } from 'lightweight-charts'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

const INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
]

export const ChartWidget = memo(() => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)

  const prices = useAppSelector(state => state.prices.prices)
  const currentPrice = prices['So11111111111111111111111111111111111111112']

  const [selectedInterval, setSelectedInterval] = useState('15m')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [priceChange, setPriceChange] = useState({ value: 0, percent: 0 })

  // Fetch data
  const fetchData = async (tf: string) => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=${tf}&limit=200`
      )

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) throw new Error('No data')

      const candles = data.map((d: any) => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
      }))

      if (candles.length > 1) {
        const first = candles[0].close
        const last = candles[candles.length - 1].close
        setPriceChange({
          value: last - first,
          percent: ((last - first) / first) * 100
        })
      }

      return candles
    } catch (e: any) {
      setError(e.message || 'Failed to load')
      return []
    } finally {
      setLoading(false)
    }
  }

  // Initialize chart
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let chart: any = null
    let series: any = null
    let resizeObserver: ResizeObserver | null = null
    let mounted = true

    const init = async () => {
      // Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 100))

      if (!mounted || !container) return

      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        // Retry
        setTimeout(init, 200)
        return
      }

      try {
        chart = createChart(container, {
          width: rect.width,
          height: rect.height,
          layout: {
            background: { color: '#0a0a0a' },
            textColor: '#888888',
          },
          grid: {
            vertLines: { color: 'rgba(0, 255, 255, 0.05)' },
            horzLines: { color: 'rgba(0, 255, 255, 0.05)' },
          },
          crosshair: {
            vertLine: {
              color: 'rgba(0, 255, 255, 0.5)',
              labelBackgroundColor: '#00ffff',
            },
            horzLine: {
              color: 'rgba(0, 255, 255, 0.5)',
              labelBackgroundColor: '#00ffff',
            },
          },
          rightPriceScale: {
            borderColor: 'rgba(0, 255, 255, 0.2)',
          },
          timeScale: {
            borderColor: 'rgba(0, 255, 255, 0.2)',
            timeVisible: true,
          },
        })

        series = chart.addCandlestickSeries({
          upColor: '#00ff9d',
          downColor: '#00ffff',
          borderUpColor: '#00ff9d',
          borderDownColor: '#00ffff',
          wickUpColor: '#00ff9d',
          wickDownColor: '#00ffff',
        })

        chartRef.current = chart
        seriesRef.current = series

        // Resize observer
        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (entry && chart) {
            const { width, height } = entry.contentRect
            if (width > 0 && height > 0) {
              chart.applyOptions({ width, height })
            }
          }
        })
        resizeObserver.observe(container)

        // Load data
        const candles = await fetchData(selectedInterval)
        if (candles.length > 0 && series && mounted) {
          series.setData(candles)
          chart.timeScale().fitContent()
        }
      } catch (e: any) {
        console.error('Chart init error:', e)
        if (mounted) setError(e.message || 'Chart failed')
      }
    }

    init()

    return () => {
      mounted = false
      if (resizeObserver) resizeObserver.disconnect()
      if (chart) {
        chart.remove()
        chartRef.current = null
        seriesRef.current = null
      }
    }
  }, [])

  // Handle interval change
  const handleIntervalChange = async (newInterval: string) => {
    setSelectedInterval(newInterval)
    if (!seriesRef.current || !chartRef.current) return

    const candles = await fetchData(newInterval)
    if (candles.length > 0) {
      seriesRef.current.setData(candles)
      chartRef.current.timeScale().fitContent()
    }
  }

  const isPositive = priceChange.percent >= 0

  return (
    <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-6 shadow-xl flex flex-col relative overflow-hidden h-full">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent z-10" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-accent-cyan/10 shrink-0 h-[55px] z-10 -mx-6 px-6 -mt-6">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-white">
            <TrendingUp className="text-accent-cyan" size={18} />
            SOL/USD
          </h3>
          <div className="flex items-center gap-2">
            <div className="text-xl font-black font-mono text-accent-cyan tracking-tight">
              ${currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '---'}
            </div>
            <div className={cn(
              "text-xs font-bold font-mono px-2 py-0.5 rounded",
              isPositive ? "text-accent-green bg-accent-green/10" : "text-accent-red bg-accent-red/10"
            )}>
              {isPositive ? '+' : ''}{priceChange.percent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Interval Selector */}
        <div className="flex items-center gap-1 bg-black/30 rounded-lg p-1 border border-accent-cyan/10">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              onClick={() => handleIntervalChange(i.value)}
              disabled={loading}
              className={cn(
                "px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-all",
                selectedInterval === i.value
                  ? "bg-accent-cyan text-black"
                  : "text-text-muted hover:text-accent-cyan",
                loading && "opacity-50"
              )}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 w-full relative rounded-lg overflow-hidden border border-accent-cyan/5" style={{ minHeight: '300px' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30">
            <div className="flex items-center gap-2 text-accent-cyan">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest">Loading...</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30">
            <div className="text-center">
              <div className="text-accent-red text-xs font-bold uppercase mb-2">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="text-[10px] text-accent-cyan hover:underline"
              >
                Reload Page
              </button>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ background: '#0a0a0a' }}
        />
      </div>
    </div>
  )
})
