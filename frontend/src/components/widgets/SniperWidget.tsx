import React, { useState } from 'react'
import { Crosshair, ExternalLink, ShieldCheck, ShieldAlert, Zap } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { ManualSnipeModal } from '../modals/ManualSnipeModal'
import { TokenDetailModal } from '../modals/TokenDetailModal'
import { SnipedToken } from '@/features/sniper/sniperSlice'

export const SniperWidget: React.FC = () => {
  const { trackedTokens, detecting } = useAppSelector(state => state.sniper)
  const [selectedToken, setSelectedToken] = useState<SnipedToken | null>(null)
  const [isSnipeModalOpen, setIsSnipeModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  const handleSnipeClick = (e: React.MouseEvent, token: SnipedToken) => {
    e.stopPropagation()
    setSelectedToken(token)
    setIsSnipeModalOpen(true)
  }

  const handleRowClick = (token: SnipedToken) => {
    setSelectedToken(token)
    setIsDetailModalOpen(true)
  }

  return (
    <div className="h-full flex flex-col bg-background-card border border-white/5 rounded-2xl overflow-hidden relative shadow-xl">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50 z-20" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2 border-b border-white/5 shrink-0 h-[55px] -mx-4 px-4 -mt-4 p-3 bg-background-elevated/20">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-accent-cyan" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-primary">Discovery Sniper</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "w-2 h-2 rounded-full",
            detecting ? "bg-accent-cyan animate-pulse" : "bg-text-muted opacity-50"
          )} />
          <span className={cn(
            "text-[10px] font-mono",
            detecting ? "text-accent-cyan" : "text-text-muted"
          )}>
            {detecting ? 'ENGINE ACTIVE' : 'ENGINE OFFLINE'}
          </span>
        </div>
      </div>

      {/* Grid Header */}
      <div className="grid grid-cols-[1fr_100px_60px_80px_80px_90px] gap-2 px-3 pb-2 text-[9px] font-bold text-text-muted uppercase tracking-wider shrink-0 mr-[6px]">
        <div className="pl-1">Asset</div>
        <div className="text-right">Initial LP</div>
        <div className="text-center">Security</div>
        <div>DEX</div>
        <div className="text-right">Detected</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-auto custom-scrollbar pr-1 pb-2 space-y-1">
        {trackedTokens.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50">
             <Zap size={24} strokeWidth={1} />
             <div className="text-center mt-2">
               <div className="font-bold text-[10px] uppercase tracking-widest mb-0.5">Scanning</div>
               <div className="text-[9px]">Waiting for new pools...</div>
             </div>
           </div>
        ) : (
          trackedTokens.map((token) => (
            <div 
              key={token.mint} 
              onClick={() => handleRowClick(token)}
              className="grid grid-cols-[1fr_100px_60px_80px_80px_90px] gap-2 items-center px-3 py-2 rounded-lg bg-background-elevated/30 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-colors group cursor-pointer"
            >
              {/* Asset */}
              <div className="flex flex-col min-w-0 pl-1">
                <span className="text-xs font-bold text-text-primary truncate">{token.symbol}</span>
                <span className="text-[9px] text-text-muted font-mono truncate">{token.mint.slice(0, 4)}...{token.mint.slice(-4)}</span>
              </div>

              {/* Initial LP */}
              <div className="text-right">
                <span className="text-[11px] font-mono font-bold text-accent-cyan">
                  {token.initial_liquidity.toFixed(2)} SOL
                </span>
              </div>

              {/* Security */}
              <div className="flex justify-center">
                {token.is_rug ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-accent-pink" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-accent-cyan" />
                )}
              </div>

              {/* DEX */}
              <div>
                <span className="text-[10px] text-text-secondary truncate block">{token.dex_id}</span>
              </div>

              {/* Detected */}
              <div className="text-right">
                <span className="text-[10px] font-mono text-text-secondary">
                  {new Date(token.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <a 
                  href={`https://solscan.io/token/${token.mint}`} 
                  target="_blank" 
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-text-secondary hover:text-accent-cyan transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button 
                  onClick={(e) => handleSnipeClick(e, token)}
                  className="px-2 py-1 rounded bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan text-[9px] font-bold uppercase transition-colors"
                >
                  Snipe
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ManualSnipeModal 
        isOpen={isSnipeModalOpen}
        onClose={() => setIsSnipeModalOpen(false)}
        token={selectedToken}
      />

      <TokenDetailModal 
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        token={selectedToken}
      />
    </div>
  )
}