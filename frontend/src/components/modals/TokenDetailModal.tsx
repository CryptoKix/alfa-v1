import React from 'react'
import { X, ExternalLink, Globe, Twitter, MessageCircle, ShieldCheck, ShieldAlert, Copy, BarChart3 } from 'lucide-react'
import { SnipedToken } from '@/features/sniper/sniperSlice'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { useAppDispatch } from '@/app/hooks'

interface TokenDetailModalProps {
  isOpen: boolean
  onClose: () => void
  token: SnipedToken | null
}

export const TokenDetailModal: React.FC<TokenDetailModalProps> = ({ isOpen, onClose, token }) => {
  const dispatch = useAppDispatch()
  if (!isOpen || !token) return null

  // Parse socials safely
  let socials: any = {}
  try {
    socials = typeof token.socials_json === 'string' 
      ? JSON.parse(token.socials_json) 
      : (token as any).socials || {}
  } catch (e) {
    console.error("Failed to parse socials", e)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    dispatch(addNotification({
      title: 'Copied',
      message: `${label} copied to clipboard`,
      type: 'info'
    }))
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-background-card border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-background-elevated/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-cyan/10 flex items-center justify-center text-accent-cyan border border-accent-cyan/20">
              <BarChart3 size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">{token.name || token.symbol}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-bold text-accent-cyan uppercase tracking-wider">{token.symbol}</span>
                <div className="w-1 h-1 rounded-full bg-white/20" />
                <span className="text-[10px] text-text-muted font-bold uppercase">{token.dex_id} Launch</span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-text-muted hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Security & LP Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/40 rounded-2xl border border-white/5 p-4 flex flex-col gap-1">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Initial Liquidity</span>
              <div className="text-xl font-black text-accent-cyan font-mono">
                {token.initial_liquidity.toFixed(2)} <span className="text-xs">SOL</span>
              </div>
            </div>
            <div className="bg-black/40 rounded-2xl border border-white/5 p-4 flex flex-col gap-1">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Security Status</span>
              <div className="flex items-center gap-2 h-7">
                {token.is_rug ? (
                  <>
                    <ShieldAlert className="text-accent-pink" size={18} />
                    <span className="text-sm font-black text-accent-pink uppercase italic">High Risk</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="text-accent-cyan" size={18} />
                    <span className="text-sm font-black text-accent-cyan uppercase italic">Verified LP</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Identification */}
          <div className="space-y-3">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between group">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Mint Address</span>
                  <span className="text-[11px] font-mono text-white mt-0.5">{token.mint}</span>
                </div>
                <button 
                  onClick={() => copyToClipboard(token.mint, 'Mint Address')}
                  className="p-2 hover:bg-white/5 rounded-lg text-text-muted hover:text-accent-cyan transition-colors"
                >
                  <Copy size={14} />
                </button>
              </div>
              {token.pool_address && token.pool_address !== 'Detected' && (
                <div className="flex items-center justify-between pt-3 border-t border-white/5 group">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-text-muted uppercase tracking-widest">Pool Address</span>
                    <span className="text-[11px] font-mono text-white mt-0.5">{token.pool_address}</span>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(token.pool_address, 'Pool Address')}
                    className="p-2 hover:bg-white/5 rounded-lg text-text-muted hover:text-accent-cyan transition-colors"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Socials & Explorers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest ml-1">Social Intel</span>
              <div className="flex gap-2">
                {socials.website || socials.homepage ? (
                  <a href={socials.website || socials.homepage} target="_blank" rel="noreferrer" className="flex-1 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex justify-center text-text-secondary hover:text-white transition-all">
                    <Globe size={18} />
                  </a>
                ) : (
                  <div className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 flex justify-center text-text-muted opacity-30 cursor-not-allowed">
                    <Globe size={18} />
                  </div>
                )}
                {socials.twitter ? (
                  <a href={socials.twitter} target="_blank" rel="noreferrer" className="flex-1 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex justify-center text-text-secondary hover:text-white transition-all">
                    <Twitter size={18} />
                  </a>
                ) : (
                  <div className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 flex justify-center text-text-muted opacity-30 cursor-not-allowed">
                    <Twitter size={18} />
                  </div>
                )}
                {socials.telegram ? (
                  <a href={socials.telegram} target="_blank" rel="noreferrer" className="flex-1 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex justify-center text-text-secondary hover:text-white transition-all">
                    <MessageCircle size={18} />
                  </a>
                ) : (
                  <div className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 flex justify-center text-text-muted opacity-30 cursor-not-allowed">
                    <MessageCircle size={18} />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[8px] font-black text-text-muted uppercase tracking-widest ml-1">Tactical Analysis</span>
              <div className="flex gap-2">
                <a 
                  href={`https://dexscreener.com/solana/${token.mint}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-1 p-3 bg-accent-cyan/10 hover:bg-accent-cyan/20 rounded-xl border border-accent-cyan/20 flex items-center justify-center gap-2 text-accent-cyan font-black text-[10px] uppercase transition-all"
                >
                  <ExternalLink size={14} />
                  Charts
                </a>
                <a 
                  href={`https://solscan.io/token/${token.mint}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex items-center justify-center text-text-secondary hover:text-white transition-all"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 bg-background-elevated/50 border-t border-white/5">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs rounded-2xl border border-white/10 transition-all"
          >
            Close Intelligence
          </button>
        </div>
      </div>
    </div>
  )
}
