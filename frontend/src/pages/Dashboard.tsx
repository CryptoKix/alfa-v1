import { useState } from 'react'
import { PortfolioWidget } from '@/components/widgets/PortfolioWidget'
import { TradeHistoryWidget } from '@/components/widgets/TradeHistoryWidget'
import { AlertsWidget } from '@/components/widgets/AlertsWidget'
import { ActiveBotsWidget } from '@/components/widgets/ActiveBotsWidget'
import { LimitOrdersWidget } from '@/components/widgets/LimitOrdersWidget'
import { ActiveBotsModal } from '@/components/modals/ActiveBotsModal'
import { useAppSelector } from '@/app/hooks'

export default function Dashboard() {
  const [isBotsModalOpen, setIsBotsModalOpen] = useState(false)
  const { bots } = useAppSelector(state => state.bots)

  const handlePauseBot = async (id: string, currentStatus: string) => {
    try {
        const newStatus = currentStatus === 'active' ? 'paused' : 'active'
        await fetch('/api/dca/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: newStatus })
        })
    } catch (e) {
        console.error("Failed to toggle bot status", e)
    }
  }

  const handleDeleteBot = async (id: string) => {
    if (!confirm('Are you sure you want to terminate this strategy?')) return
    try {
        await fetch('/api/dca/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        })
    } catch (e) {
        console.error("Failed to delete bot", e)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 h-full min-h-0">
        {/* Top Row: Portfolio, Limit Orders & Alerts */}
        <div className="flex-[4] min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
          <div className="lg:col-span-6 h-full min-h-0">
            <PortfolioWidget />
          </div>
          <div className="lg:col-span-3 h-full min-h-0">
            <LimitOrdersWidget />
          </div>
          <div className="lg:col-span-3 h-full min-h-0">
            <AlertsWidget />
          </div>
        </div>

        {/* Bottom Row: Active Bots & Trade History */}
        <div className="flex-[5] min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
           <div className="lg:col-span-5 h-full min-h-0">
             <ActiveBotsWidget onViewAll={() => setIsBotsModalOpen(true)} />
           </div>
           <div className="lg:col-span-7 h-full min-h-0">
             <TradeHistoryWidget />
           </div>
        </div>
      </div>

      <ActiveBotsModal 
        isOpen={isBotsModalOpen}
        onClose={() => setIsBotsModalOpen(false)}
        bots={bots}
        onPause={handlePauseBot}
        onDelete={handleDeleteBot}
        onCreateNew={() => setIsBotsModalOpen(false)}
      />
    </>
  )
}