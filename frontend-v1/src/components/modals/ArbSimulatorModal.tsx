import React from 'react'
import { X, Zap, ArrowRight, ShieldCheck, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ArbSimulatorModalProps {
  isOpen: boolean
  onClose: () => void
  opportunity: any
}

export const ArbSimulatorModal: React.FC<ArbSimulatorModalProps> = ({ isOpen, onClose, opportunity }) => {
  if (!isOpen || !opportunity) return null

  const isProfitable = opportunity.net_profit_usd > 0

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-background-card border border-accent-pink/30 rounded-3xl w-full max-w-lg relative overflow-hidden shadow-floating animate-in zoom-in-95 duration-200 flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-accent-pink/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-cyan/10 rounded-xl text-accent-cyan shadow-[0_0_15px_rgba(0,255,255,0.1)]">
              <Zap size={20} fill="currentColor" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Atomic Swap Dry-Run</h2>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Simulator V1.0</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-text-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-auto custom-scrollbar">
          {/* Route Map */}
          <div className="grid grid-cols-3 items-center gap-4 bg-black/20 p-4 rounded-lg border border-accent-pink/30">
             <div className="text-center space-y-1">
                <div className="text-[10px] font-black text-accent-cyan uppercase">BUY</div>
                <div className="px-3 py-2 bg-white/5 rounded-xl border border-accent-pink/30 text-white font-bold text-xs uppercase">{opportunity.worst_venue}</div>
             </div>
             <div className="flex flex-col items-center">
                <ArrowRight className="text-text-muted animate-pulse" size={24} />
             </div>
             <div className="text-center space-y-1">
                <div className="text-[10px] font-black text-accent-pink uppercase">SELL</div>
                <div className="px-3 py-2 bg-white/5 rounded-xl border border-accent-pink/30 text-white font-bold text-xs uppercase">{opportunity.best_venue}</div>
             </div>
          </div>

          {/* Profit Breakdown */}
          <div className="space-y-3">
             <div className="flex justify-between items-center px-1">
                <span className="text-[10px] text-text-muted uppercase font-black">Profit Analysis</span>
                <span className={cn(
                  "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                  isProfitable ? "text-accent-green border-accent-green/20 bg-accent-green/5" : "text-accent-red border-accent-red/20 bg-accent-red/5"
                )}>
                  {isProfitable ? 'Profitable Opportunity' : 'Non-Profitable'}
                </span>
             </div>

             <div className="space-y-2">
                <div className="flex justify-between items-center p-4 bg-white/[0.02] border border-accent-pink/30 rounded-lg transition-colors hover:bg-white/5 group">
                   <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan group-hover:scale-110 transition-transform"><Info size={14} /></div>
                      <span className="text-xs font-bold text-text-secondary uppercase">Gross Spread</span>
                   </div>
                   <span className="text-sm font-black font-mono text-white tracking-tight">
                     +${opportunity.gross_profit_usd.toFixed(2)}
                   </span>
                </div>

                <div className="flex justify-between items-center p-4 bg-white/[0.02] border border-accent-pink/30 rounded-lg transition-colors hover:bg-white/5 group">
                   <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-accent-red/10 rounded-lg text-accent-red group-hover:scale-110 transition-transform"><AlertCircle size={14} /></div>
                      <span className="text-xs font-bold text-text-secondary uppercase">Estimated Fees</span>
                   </div>
                   <span className="text-sm font-black font-mono text-accent-red tracking-tight">
                     -$0.25
                   </span>
                </div>

                <div className={cn(
                  "flex justify-between items-center p-5 rounded-lg border-2 transition-all duration-500",
                  isProfitable ? "bg-accent-green/5 border-accent-green/30 shadow-[0_0_20px_rgba(0,255,157,0.1)]" : "bg-white/[0.02] border-accent-pink/30"
                )}>
                   <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl", isProfitable ? "bg-accent-green/20 text-accent-green" : "bg-white/10 text-text-muted")}>
                        <ShieldCheck size={18} />
                      </div>
                      <span className="text-sm font-black text-white uppercase tracking-wider">Net ROI</span>
                   </div>
                   <div className="text-right">
                      <div className={cn("text-xl font-black font-mono tracking-tighter", isProfitable ? "text-accent-green" : "text-white")}>
                        {isProfitable ? '+' : ''}${opportunity.net_profit_usd.toFixed(2)}
                      </div>
                      <div className="text-[9px] text-text-muted uppercase font-bold">After atomic swap slippage</div>
                   </div>
                </div>
             </div>
          </div>

          <div className="p-4 bg-accent-cyan/5 border border-accent-cyan/10 rounded-lg flex items-start gap-3">
             <Info className="text-accent-cyan mt-0.5 shrink-0" size={16} />
             <p className="text-[10px] text-text-secondary leading-relaxed uppercase tracking-wide">
               Simulation based on <span className="text-white font-bold">Confirmed</span> Jupiter quote depth. Real-time liquidity may fluctuate during execution.
             </p>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-6 border-t border-accent-pink/30 bg-black/20 flex gap-3">
          <button 
            disabled={!isProfitable}
            className={cn(
              "flex-1 py-4 rounded-lg font-black text-sm uppercase tracking-[0.2em] transition-all transform active:scale-95 flex items-center justify-center gap-3",
              isProfitable ? "bg-accent-cyan text-black hover:bg-white shadow-[0_0_30px_rgba(0,255,255,0.2)]" : "bg-white/5 text-white/10 cursor-not-allowed border border-accent-pink/30"
            )}
          >
            {isProfitable ? (
              <>
                <Zap size={18} fill="currentColor" />
                Execute Atomic Path
              </>
            ) : 'Insufficient Spread'}
          </button>
        </div>
      </div>
    </div>
  )
}
