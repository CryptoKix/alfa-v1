import { X, ArrowLeftRight } from 'lucide-react'
import { Trade } from '@/features/portfolio/portfolioSlice'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  history: Trade[]
  formatTimestamp: (dateStr: string) => string
}

export const HistoryModal = ({ isOpen, onClose, history, formatTimestamp }: HistoryModalProps) => {
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-background-card border border-accent-pink/30 rounded-lg w-full max-w-4xl max-h-[80vh] relative overflow-hidden shadow-floating animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-accent-pink/30 shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-3 text-white">
            <div className="p-2 bg-accent-cyan/10 rounded-lg text-accent-cyan">
              <ArrowLeftRight size={20} />
            </div>
            Full Execution History
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Content - Table View */}
        <div className="flex-1 overflow-auto custom-scrollbar p-6">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in-95 duration-500">
              <div className="p-5 rounded-full bg-accent-pink/5 border border-accent-pink/20 shadow-[0_0_40px_rgba(255,0,128,0.15)]">
                <ArrowLeftRight size={48} strokeWidth={1.5} className="text-accent-pink" />
              </div>
              <div className="text-center space-y-1">
                <div className="font-black text-lg text-white uppercase tracking-[0.3em]">No Execution History</div>
                <div className="text-xs font-bold text-accent-pink/70 uppercase tracking-widest">ledger is empty</div>
              </div>
            </div>
          ) : (
          <table className="w-full text-sm font-mono border-separate border-spacing-y-2">
            <thead>
              <tr className="text-[10px] text-text-secondary uppercase tracking-[0.2em]">
                <th className="text-left px-4 pb-2 font-medium">Time</th>
                <th className="text-left px-4 pb-2 font-medium">Source</th>
                <th className="text-left px-4 pb-2 font-medium">Action</th>
                <th className="text-right px-4 pb-2 font-medium">Value</th>
                <th className="text-center px-4 pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((trade) => {
                const isSuccess = trade.status === 'success'
                return (
                  <tr key={trade.id} className="group bg-background-elevated/30 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 first:rounded-l-xl last:rounded-r-xl text-text-muted text-xs">
                      {formatTimestamp(trade.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-accent-cyan font-bold uppercase text-[10px]">
                      {trade.source || 'Manual'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={isSuccess ? "text-accent-cyan" : "text-text-muted"}>{trade.output}</span>
                        <span className="text-[10px] text-text-muted">for</span>
                        <span className="text-accent-pink">{trade.input}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-bold">
                      {isSuccess ? `$${trade.usd_value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '---'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isSuccess ? (
                        <span className="px-2 py-0.5 bg-accent-green/10 text-accent-green text-[9px] font-black rounded border border-accent-green/20 uppercase">Success</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-accent-red/10 text-accent-red text-[9px] font-black rounded border border-accent-red/20 uppercase">Failed</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-black/20 border-t border-accent-pink/30 flex justify-between items-center text-[10px] text-text-muted shrink-0">
          <span>Showing {history.length} most recent records</span>
          <span className="font-mono">{new Date().toUTCString()}</span>
        </div>
      </div>
    </div>
  )
}
