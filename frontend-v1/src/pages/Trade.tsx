import { ChartWidget } from '@/components/widgets/ChartWidget'
import { TradeHistoryWidget } from '@/components/widgets/TradeHistoryWidget'
import { TradeEntryWidget } from '@/components/widgets/TradeEntryWidget'
import { LimitOrdersWidget } from '@/components/widgets/LimitOrdersWidget'

export default function TradePage() {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Top Row: Execution & Chart (Increased Height) */}
      <div className="flex-[6] min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
        <div className="lg:col-span-4 h-full min-h-0">
          <TradeEntryWidget />
        </div>
        <div className="lg:col-span-8 h-full min-h-0">
          <ChartWidget />
        </div>
      </div>

      {/* Bottom Row: Orders & History */}
      <div className="flex-[3] min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
        <div className="lg:col-span-4 h-full min-h-0">
          <LimitOrdersWidget />
        </div>
        <div className="lg:col-span-8 h-full min-h-0">
          <TradeHistoryWidget />
        </div>
      </div>
    </div>
  )
}
