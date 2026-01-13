import { MainLayout } from '@/components/layout/MainLayout'
import { PortfolioWidget } from '@/components/widgets/PortfolioWidget'
import { TradeHistoryWidget } from '@/components/widgets/TradeHistoryWidget'
import { AlertsWidget } from '@/components/widgets/AlertsWidget'
import { ActiveBotsWidget } from '@/components/widgets/ActiveBotsWidget'

export default function Dashboard() {
  return (
    <MainLayout>
      <div className="flex flex-col gap-6 h-full min-h-0">
        {/* Top Row: Portfolio & Alerts */}
        <div className="flex-[4] min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-full min-h-0">
            <PortfolioWidget />
          </div>
          <div className="lg:col-span-5 h-full min-h-0">
            <AlertsWidget />
          </div>
        </div>

        {/* Bottom Row: Trade History & Active Bots */}
        <div className="flex-[5] min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6">
           <div className="lg:col-span-7 h-full min-h-0">
             <TradeHistoryWidget />
           </div>
           <div className="lg:col-span-5 h-full min-h-0">
             <ActiveBotsWidget />
           </div>
        </div>
      </div>
    </MainLayout>
  )
}
