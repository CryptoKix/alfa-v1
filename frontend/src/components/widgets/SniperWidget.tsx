import React, { useState } from 'react'
import { Crosshair, ExternalLink, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { ManualSnipeModal } from '../modals/ManualSnipeModal'
import { TokenDetailModal } from '../modals/TokenDetailModal'
import { SnipedToken } from '@/features/sniper/sniperSlice'

export const SniperWidget: React.FC = () => {
  const { trackedTokens, engineActive } = useAppSelector(state => state.sniper)
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
      
      <div className="p-3 border-b border-white/5 flex justify-between items-center bg-background-elevated/20 h-[55px] shrink-0">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-accent-cyan" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-primary">Discovery Sniper</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "w-2 h-2 rounded-full",
            engineActive ? "bg-accent-cyan animate-pulse" : "bg-text-muted opacity-50"
          )} />
          <span className={cn(
            "text-[10px] font-mono",
            engineActive ? "text-accent-cyan" : "text-text-muted"
          )}>
            {engineActive ? 'ENGINE ACTIVE' : 'ENGINE OFFLINE'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-background-card z-10">
            <tr className="border-b border-border">
              <th className="p-3 text-[10px] font-bold text-text-muted uppercase">Asset</th>
              <th className="p-3 text-[10px] font-bold text-text-muted uppercase text-right">Initial LP</th>
              <th className="p-3 text-[10px] font-bold text-text-muted uppercase text-center">Security</th>
              <th className="p-3 text-[10px] font-bold text-text-muted uppercase">DEX</th>
              <th className="p-3 text-[10px] font-bold text-text-muted uppercase text-right">Detected</th>
              <th className="p-3 text-[10px] font-bold text-text-muted uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {trackedTokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-text-muted text-xs italic">
                  Scanning for new liquidity pools...
                </td>
              </tr>
            ) : (
              trackedTokens.map((token) => (
                <tr 
                  key={token.mint} 
                  onClick={() => handleRowClick(token)}
                  className="hover:bg-white/5 transition-colors group cursor-pointer"
                >
                  <td className="p-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-text-primary">{token.symbol}</span>
                      <span className="text-[10px] text-text-muted font-mono">{token.mint.slice(0, 4)}...{token.mint.slice(-4)}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <span className="text-xs font-mono font-bold text-accent-cyan">
                      {token.initial_liquidity.toFixed(2)} SOL
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-center">
                      {token.is_rug ? (
                        <ShieldAlert className="w-4 h-4 text-accent-pink" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-accent-cyan" />
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="text-xs text-text-secondary">{token.dex_id}</span>
                  </td>
                  <td className="p-3 text-right">
                    <span className="text-xs font-mono text-text-secondary">
                      {new Date(token.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <a 
                        href={`https://solscan.io/token/${token.mint}`} 
                        target="_blank" 
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-text-secondary hover:text-accent-cyan transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button 
                        onClick={(e) => handleSnipeClick(e, token)}
                        className="px-2 py-1 rounded bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan text-[10px] font-bold uppercase transition-colors"
                      >
                        Snipe
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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