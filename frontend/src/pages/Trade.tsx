import { ChartWidget } from '@/components/widgets/ChartWidget'
import { TradeHistoryWidget } from '@/components/widgets/TradeHistoryWidget'
import { TradeEntryWidget } from '@/components/widgets/TradeEntryWidget'

export default function TradePage() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 h-full">
        {/* Sidebar (Left) */}
        <div className="lg:col-span-4 flex flex-col h-full">
           <TradeEntryWidget />
        </div>

        {/* Main Content (Right) */}
        <div className="lg:col-span-8 flex flex-col gap-2 min-h-0">
          <ChartWidget />
          <div className="flex-1 min-h-0">
             <TradeHistoryWidget />
          </div>
        </div>
      </div>
    </>
  )
}
