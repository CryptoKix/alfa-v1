import { useState } from 'react'
import { GridConfigWidget } from '@/components/widgets/GridConfigWidget'
import { TWAPConfigWidget } from '@/components/widgets/TWAPConfigWidget'
import { CopyTradeConfigWidget } from '@/components/widgets/CopyTradeConfigWidget'
import { WolfPackWidget } from '@/components/widgets/WolfPackWidget'
import { ArbSettingsWidget, ArbAnalysisWidget, ArbOpportunitiesWidget } from '@/components/widgets/ArbConfigWidget'
import { ActiveBotsModal } from '@/components/modals/ActiveBotsModal'
import { StrategyGauges } from '@/components/widgets/StrategyGauges'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setMonitorBotId } from '@/features/bots/botsSlice'

export default function StrategiesPage() {
  const dispatch = useAppDispatch()
  const { bots, selectedStrategy, monitorBotId } = useAppSelector(state => state.bots)
  const [isBotsModalOpen, setIsBotsModalOpen] = useState(false)

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
    try {
        await fetch('/api/dca/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        })
        if (monitorBotId === id) {
          dispatch(setMonitorBotId(null))
        }
    } catch (e) {
        console.error("Failed to delete bot", e)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 h-full overflow-hidden">
        <StrategyGauges onViewBots={() => setIsBotsModalOpen(true)} />
        
        {selectedStrategy === 'arb' ? (
          <div className="flex-1 flex gap-2 overflow-hidden">
            {/* Left Area: Config/Opportunities */}
            <div className="flex-1 flex gap-2 h-full min-w-0">
              <ArbSettingsWidget />
              <ArbOpportunitiesWidget />
            </div>
            
            {/* Right Column: Full Height Venue Matrix */}
            <div className="lg:w-[625px] shrink-0 h-full">
              <ArbAnalysisWidget />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            {selectedStrategy === 'grid' && <GridConfigWidget />}
            {selectedStrategy === 'twap' && <TWAPConfigWidget />}
            {selectedStrategy === 'copy' && <CopyTradeConfigWidget />}
            {selectedStrategy === 'wolf' && <WolfPackWidget />}
            
            {!['grid', 'twap', 'copy', 'arb', 'wolf'].includes(selectedStrategy) && (
              <div className="h-full flex flex-col items-center justify-center bg-background-card border border-border rounded-lg relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/5 to-accent-cyan/5" />
                 <div className="p-20 text-center relative z-10">
                    <div className="text-4xl mb-4">🚧</div>
                    <div className="text-text-muted uppercase tracking-[0.5em] font-black opacity-20 text-xl">
                      Module Under Construction
                    </div>
                    <p className="text-[10px] text-text-muted mt-4 uppercase tracking-widest">
                      Quantum engine integration in progress
                    </p>
                 </div>
              </div>
            )}
          </div>
        )}
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
