import React from 'react'
import { CopyTradeConfigWidget } from '@/components/widgets/CopyTradeConfigWidget'

export const CopyTradePage: React.FC = () => {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex justify-between items-center mb-1">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">MIRROR INTELLIGENCE</h1>
          <p className="text-xs text-text-muted">High-frequency whale tracking and automated trade mirroring</p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <CopyTradeConfigWidget />
      </div>
    </div>
  )
}

export default CopyTradePage
