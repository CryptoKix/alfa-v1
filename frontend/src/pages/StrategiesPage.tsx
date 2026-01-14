import { useState } from 'react'
import { StrategiesWidget } from '@/components/widgets/StrategiesWidget'
import { GridConfigWidget } from '@/components/widgets/GridConfigWidget'
import { TWAPConfigWidget } from '@/components/widgets/TWAPConfigWidget'
import { CopyTradeConfigWidget } from '@/components/widgets/CopyTradeConfigWidget'
import { ArbSettingsWidget, ArbAnalysisWidget, ArbOpportunitiesWidget } from '@/components/widgets/ArbConfigWidget'
import { TacticalConsoleWidget } from '@/components/widgets/TacticalConsoleWidget'
import { ActiveBotsModal } from '@/components/modals/ActiveBotsModal'
import { useAppSelector } from '@/app/hooks'

export default function StrategiesPage() {
  const [selectedStrategy, setSelectedStrategy] = useState<string>('grid')
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
      <div className="flex flex-col gap-2 h-full overflow-hidden">
        {selectedStrategy === 'arb' ? (
          <div className="flex gap-2 h-full overflow-hidden">
            {/* Left Stack: Terminal + Settings + Opportunities */}
            <div className="flex flex-col gap-2 w-[500px] shrink-0 h-full">
              <div className="h-[200px] shrink-0">
                <StrategiesWidget 
                  onSelect={(id: string) => setSelectedStrategy(id)} 
                  selectedId={selectedStrategy} 
                  onViewBots={() => setIsBotsModalOpen(true)}
                />
              </div>
              <div className="flex-1 flex flex-col gap-2 min-h-0">
                <ArbSettingsWidget />
                <ArbOpportunitiesWidget />
              </div>
            </div>
            
            {/* Right Stack: Full Height Venue Matrix */}
            <div className="flex-1 h-full min-w-0">
              <ArbAnalysisWidget />
            </div>
          </div>
        ) : (
          <>
            {/* Top Header Section: Terminal Grid + Intel/Matrix */}
            <div className="h-[200px] shrink-0">
              <StrategiesWidget 
                onSelect={(id: string) => setSelectedStrategy(id)} 
                selectedId={selectedStrategy} 
                onViewBots={() => setIsBotsModalOpen(true)}
                rightElement={<TacticalConsoleWidget selectedId={selectedStrategy} />}
              />
            </div>

            {/* Dynamic Config Area */}
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
              {selectedStrategy === 'grid' && <GridConfigWidget />}
              {selectedStrategy === 'twap' && <TWAPConfigWidget />}
              {selectedStrategy === 'copy' && <CopyTradeConfigWidget />}
              
              {['vwap', 'dca'].includes(selectedStrategy) && (
                <div className="h-full flex flex-col items-center justify-center bg-background-card border border-white/5 rounded-2xl relative overflow-hidden">
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
          </>
        )}
      </div>

      <ActiveBotsModal 
        isOpen={isBotsModalOpen}
        onClose={() => setIsBotsModalOpen(false)}
        bots={bots}
        type={selectedStrategy}
        onPause={handlePauseBot}
        onDelete={handleDeleteBot}
        onCreateNew={() => setIsBotsModalOpen(false)}
      />
    </>
  )
}