import React from 'react'
import { Smartphone, Activity } from 'lucide-react'
import { SeekerLogsWidget } from '@/components/widgets/SeekerLogsWidget'
import { SKRStakingWidget } from '@/components/widgets/SKRStakingWidget'
import { SKRWhaleLeaderboardWidget } from '@/components/widgets/SKRWhaleLeaderboardWidget'
import { SKRWhaleFeedWidget } from '@/components/widgets/SKRWhaleFeedWidget'

export const SeekerPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex justify-between items-center bg-background-card border border-accent-cyan/10 rounded-2xl p-4 relative overflow-hidden shadow-lg">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent z-20" />
        <div className="flex items-center gap-4">
          <div className="p-2 bg-accent-cyan/10 rounded-xl text-accent-cyan">
            <Smartphone size={20} />
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-tight uppercase">Seeker Hub</h1>
            <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">Mobile Device Management and Network Telemetry</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-1.5 px-3 py-1 border rounded-lg bg-accent-cyan/10 border-accent-cyan/30">
              <Activity size={12} className="text-accent-cyan animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-accent-cyan">
                Network Online
              </span>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
        {/* Center Column: Whale Stats & Leaderboard */}
        <div className="lg:col-span-7 h-full min-h-0 flex flex-col gap-2">
           <div className="shrink-0 h-[340px]">
              <SKRStakingWidget />
           </div>
           <div className="flex-1 min-h-0">
              <SKRWhaleLeaderboardWidget />
           </div>
        </div>

        {/* Right Column: Feed & Logs */}
        <div className="lg:col-span-5 h-full min-h-0 flex flex-col gap-2">
           <div className="flex-1 min-h-0">
              <SKRWhaleFeedWidget />
           </div>
           <div className="h-[250px] shrink-0">
              <SeekerLogsWidget />
           </div>
        </div>
      </div>
    </div>
  )
}

export default SeekerPage
