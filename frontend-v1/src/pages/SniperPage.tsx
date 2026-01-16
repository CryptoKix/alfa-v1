import React from 'react'
import { SniperWidget } from '@/components/widgets/SniperWidget'
import { SniperConfigWidget } from '@/components/widgets/SniperConfigWidget'
import { TacticalConsoleWidget } from '@/components/widgets/TacticalConsoleWidget'
import { AlertsWidget } from '@/components/widgets/AlertsWidget'

export const SniperPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Header Info */}
      <div className="flex justify-between items-center mb-1 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">TOKEN SNIPER</h1>
          <p className="text-xs text-text-muted">Real-time liquidity pool discovery & automated execution</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
        {/* Left Column: Config */}
        <div className="lg:col-span-3 h-full min-h-0">
          <SniperConfigWidget />
        </div>

        {/* Middle Column: Main Feed */}
        <div className="lg:col-span-6 h-full min-h-0">
          <SniperWidget />
        </div>

        {/* Right Column: Sidebar */}
        <div className="lg:col-span-3 flex flex-col gap-2 h-full min-h-0">
          <div className="flex-[3]">
            <TacticalConsoleWidget selectedId="sniper" />
          </div>
          <div className="flex-[2]">
            <AlertsWidget />
          </div>
        </div>
      </div>
    </div>
  )
}

export default SniperPage
