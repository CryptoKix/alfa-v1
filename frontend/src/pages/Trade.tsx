import { ChartWidget } from '@/components/widgets/ChartWidget'
import { TradeHistoryWidget } from '@/components/widgets/TradeHistoryWidget'
import { TradeEntryWidget } from '@/components/widgets/TradeEntryWidget'
import { LimitOrdersWidget } from '@/components/widgets/LimitOrdersWidget'

export default function TradePage() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 h-full">
        {/* Main Content (Left) */}
        <div className="lg:col-span-8 flex flex-col gap-2 min-h-0">
          <ChartWidget />
          <div className="flex-1 min-h-0">
             <TradeHistoryWidget />
          </div>
        </div>

        {/* Sidebar (Right) */}
        <div className="lg:col-span-4 flex flex-col gap-2 h-full min-h-0">
           <div className="flex-[3] min-h-0">
             <TradeEntryWidget />
           </div>
           <div className="flex-[2] min-h-0">
             <LimitOrdersWidget />
           </div>
        </div>
      </div>
    </>
  )
}
