import { WidgetGrid } from '@/components/layout/WidgetGrid'
import { AlertsWidget } from '@/components/widgets/AlertsWidget'
import { ServiceMonitorWidget } from '@/components/widgets/system/ServiceMonitorWidget'
import { TradingModulesWidget } from '@/components/widgets/system/TradingModulesWidget'
import { ConnectionMonitorWidget } from '@/components/widgets/system/ConnectionMonitorWidget'

const ControlPanel = () => {
  return (
    <div className="h-full w-full">
      <WidgetGrid page="control">
        <div key="service-monitor">
          <ServiceMonitorWidget />
        </div>
        <div key="trading-modules">
          <TradingModulesWidget />
        </div>
        <div key="connection-monitor">
          <ConnectionMonitorWidget />
        </div>
        <div key="alerts">
          <AlertsWidget />
        </div>
      </WidgetGrid>
    </div>
  )
}

export default ControlPanel
