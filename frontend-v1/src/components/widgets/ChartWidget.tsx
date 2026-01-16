import { useEffect, useRef, memo } from 'react'
import { Zap } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'

declare global {
  interface Window {
    TradingView: any
  }
}

export const ChartWidget = memo(() => {
  const containerRef = useRef<HTMLDivElement>(null)
  const prices = useAppSelector(state => state.prices.prices)
  const currentPrice = prices['So11111111111111111111111111111111111111112']

  useEffect(() => {
    // Dynamically load the TradingView script
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => {
      if (window.TradingView && containerRef.current) {
        new window.TradingView.widget({
          autosize: true,
          symbol: "BINANCE:SOLUSDC",
          interval: "1",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          allow_symbol_change: false,
          container_id: "tv_chart_container",
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: true,
          backgroundColor: "#12121a",
          gridLineColor: "#1a1a2e",
          toolbar_bg: "#12121a",
          // Attempt to match Cyberpunk theme via overrides (supported in some widget versions)
          overrides: {
            "mainSeriesProperties.candleStyle.upColor": "#00ff9d",
            "mainSeriesProperties.candleStyle.downColor": "#ff0080",
            "mainSeriesProperties.candleStyle.wickUpColor": "#00ff9d",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ff0080",
            "mainSeriesProperties.candleStyle.borderUpColor": "#00ff9d",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ff0080",
            "paneProperties.background": "#12121a",
            "paneProperties.vertGridProperties.color": "#1a1a2e",
            "paneProperties.horzGridProperties.color": "#1a1a2e",
          }
        })
      }
    }
    document.head.appendChild(script)

    return () => {
      // Cleanup script if component unmounts (though usually fine to leave in head)
      if (document.head.contains(script)) {
         document.head.removeChild(script)
      }
    }
  }, [])

  return (
    <div className="bg-background-card border border-accent-pink/30 rounded-lg p-6 shadow-floating flex flex-col relative overflow-hidden h-full">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2 border-b border-accent-pink/30 shrink-0 h-[55px] z-10 -mx-6 px-6 -mt-6">
        <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-white">
          <Zap className="text-accent-purple" size={18} />
          SOL/USD
        </h3>
        <div className="text-right">
          <div className="text-xl font-black font-mono text-white tracking-tight">
            ${currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '---'}
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative z-0 border border-border rounded-lg overflow-hidden bg-black/20">
        <div id="tv_chart_container" ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
})

