import { WidgetGrid } from '@/components/layout'
import {
  PortfolioWidget,
  ChartWidget,
  ActiveBotsWidget,
  TradeHistoryWidget,
} from '@/components/widgets'

export default function Dashboard() {
  return (
    <WidgetGrid page="dashboard">
      <div key="portfolio">
        <PortfolioWidget />
      </div>
      <div key="chart">
        <ChartWidget />
      </div>
      <div key="active-bots">
        <ActiveBotsWidget />
      </div>
      <div key="trade-history">
        <TradeHistoryWidget />
      </div>
    </WidgetGrid>
  )
}
