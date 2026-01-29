import { WidgetGrid } from '@/components/layout'
import { ChartWidget, TradeEntryWidget, TradeHistoryWidget } from '@/components/widgets'
import { LimitOrdersWidget } from '@/components/widgets/LimitOrdersWidget'

export default function TradePage() {
  return (
    <WidgetGrid page="trade">
      <div key="chart">
        <ChartWidget />
      </div>
      <div key="trade-entry">
        <TradeEntryWidget />
      </div>
      <div key="limit-orders">
        <LimitOrdersWidget />
      </div>
      <div key="trade-history">
        <TradeHistoryWidget />
      </div>
    </WidgetGrid>
  )
}
