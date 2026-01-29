import { useState } from 'react'
import { LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'

const pairs = [
  { value: 'BINANCE:SOLUSDT', label: 'SOL/USDT' },
  { value: 'BINANCE:BTCUSDT', label: 'BTC/USDT' },
  { value: 'BINANCE:ETHUSDT', label: 'ETH/USDT' },
  { value: 'BINANCE:JUPUSDT', label: 'JUP/USDT' },
  { value: 'BYBIT:WIFUSDT', label: 'WIF/USDT' },
  { value: 'BYBIT:BONKUSDT', label: 'BONK/USDT' },
]

const intervals = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1H' },
  { value: '240', label: '4H' },
  { value: 'D', label: '1D' },
]

export function ChartWidget() {
  const [symbol, setSymbol] = useState('BINANCE:SOLUSDT')
  const [interval, setInterval] = useState('15')

  const currentPair = pairs.find((p) => p.value === symbol)

  // Build TradingView widget URL with custom candle colors (cyan up, pink down)
  const overrides = {
    "mainSeriesProperties.candleStyle.upColor": "#00f0ff",
    "mainSeriesProperties.candleStyle.downColor": "#ff00ff",
    "mainSeriesProperties.candleStyle.borderUpColor": "#00f0ff",
    "mainSeriesProperties.candleStyle.borderDownColor": "#ff00ff",
    "mainSeriesProperties.candleStyle.wickUpColor": "#00f0ff",
    "mainSeriesProperties.candleStyle.wickDownColor": "#ff00ff",
  }

  const studiesOverrides = {
    "volume.volume.color.0": "#ff00ff",
    "volume.volume.color.1": "#00f0ff",
  }

  const widgetUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(symbol)}&interval=${interval}&hidesidetoolbar=0&symboledit=0&saveimage=0&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&showpopupbutton=0&locale=en&hide_volume=0&overrides=${encodeURIComponent(JSON.stringify(overrides))}&studies_overrides=${encodeURIComponent(JSON.stringify(studiesOverrides))}`

  return (
    <WidgetContainer
      id="chart"
      title={currentPair?.label || 'Chart'}
      icon={<LineChart className="w-4 h-4" />}
      noPadding
      actions={
        <div className="flex items-center gap-2">
          {/* Pair selector */}
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-[#1a1a1a] border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] font-semibold text-white focus:outline-none focus:border-accent-cyan/30 cursor-pointer"
            style={{ colorScheme: 'dark' }}
          >
            {pairs.map((p) => (
              <option key={p.value} value={p.value} className="bg-[#1a1a1a] text-white">
                {p.label}
              </option>
            ))}
          </select>

          {/* Interval selector */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-lg p-0.5">
            {intervals.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setInterval(tf.value)}
                className={cn(
                  'px-2 py-1 text-[10px] font-semibold rounded transition-colors',
                  interval === tf.value
                    ? 'bg-accent-cyan/20 text-accent-cyan'
                    : 'text-white/40 hover:text-white/60'
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <iframe
        key={`${symbol}-${interval}`}
        src={widgetUrl}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '400px',
          border: 'none',
          borderRadius: '0 0 16px 16px',
        }}
        allowFullScreen
      />
    </WidgetContainer>
  )
}
