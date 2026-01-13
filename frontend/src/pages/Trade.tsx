import { MainLayout } from '@/components/layout/MainLayout'
import { ChartWidget } from '@/components/widgets/ChartWidget'
import { TradeHistoryWidget } from '@/components/widgets/TradeHistoryWidget'
import { TradeEntryWidget } from '@/components/widgets/TradeEntryWidget'

export default function TradePage() {
  return (
    <MainLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        {/* Main Content (Left) */}
        <div className="lg:col-span-8 flex flex-col gap-2">
          <ChartWidget />
          <div className="h-[400px]">
             <TradeHistoryWidget />
          </div>
        </div>

        {/* Sidebar (Right) */}
        <div className="lg:col-span-4 flex flex-col h-full">
           <TradeEntryWidget />
        </div>
      </div>
    </MainLayout>
  )
}
