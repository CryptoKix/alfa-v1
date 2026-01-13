import { useState, useEffect } from 'react'
import { Wallet, Bell, Send } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { WalletModal } from '@/components/modals/WalletModal'
import { SendModal } from '@/components/modals/SendModal'
import { cn } from '@/lib/utils'

export const Header = () => {
  const { wallet, walletAlias, connected: webConnected } = useAppSelector(state => state.portfolio)
  const { lastUpdate, connected: priceConnected } = useAppSelector(state => state.prices)
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const timeDiff = now - lastUpdate
  
  // Price Status Logic
  let priceStatusText = 'PRICE: OFFLINE'
  let priceColor = 'bg-red-500'
  let priceTextClass = 'text-red-500'
  let pricePulse = false

  if (priceConnected) {
    if (lastUpdate > 0 && timeDiff < 5000) {
      priceStatusText = 'PRICE: ACTIVE'
      priceColor = 'bg-accent-green'
      priceTextClass = 'text-accent-green'
      pricePulse = true
    } else {
      priceStatusText = 'PRICE: STALLED'
      priceColor = 'bg-yellow-500'
      priceTextClass = 'text-yellow-500'
    }
  }

  // Web Status Logic
  const webStatusText = webConnected ? 'WEB: CONNECTED' : 'WEB: DISCONNECTED'
  const webColor = webConnected ? 'bg-accent-cyan' : 'bg-red-500'
  const webTextClass = webConnected ? 'text-accent-cyan' : 'text-red-500'

  return (
    <>
      <header className="h-16 flex items-center justify-between px-6 bg-background-card/50 backdrop-blur sticky top-0 z-10">
        {/* Breadcrumb / Page Title Placeholder */}
        <div className="flex items-center gap-4">
          <span className="text-text-secondary text-sm font-mono">Dashboard / Overview</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Status Indicators */}
          <div className="flex items-center gap-3 mr-2">
            <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded border border-white/10">
               <div className={cn("w-1.5 h-1.5 rounded-full transition-colors duration-500", priceColor, pricePulse && "animate-pulse")} />
               <span className={cn("text-[8px] font-mono font-bold uppercase transition-colors duration-500", priceTextClass)}>
                 {priceStatusText}
               </span>
            </div>
            <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded border border-white/10">
               <div className={cn("w-1.5 h-1.5 rounded-full transition-colors duration-500", webColor, webConnected && "animate-pulse")} />
               <span className={cn("text-[8px] font-mono font-bold uppercase transition-colors duration-500", webTextClass)}>
                 {webStatusText}
               </span>
            </div>
          </div>

          <div className="w-px h-6 bg-white/5" />

          {/* Send Button */}
          <button 
            onClick={() => setIsSendModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent-purple/10 border border-accent-purple/20 rounded-lg text-accent-purple hover:bg-accent-purple/20 transition-all group"
          >
            <Send size={14} className="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Send</span>
          </button>

          <div className="w-px h-6 bg-white/5" />

          {/* Notifications */}
          <button className="relative text-text-secondary hover:text-white transition-colors">
            <Bell size={18} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent-pink rounded-full" />
          </button>

          {/* Wallet Badge */}
          <button 
            onClick={() => setIsWalletModalOpen(true)}
            className="flex items-center gap-3 pl-2 py-1.5 pr-4 bg-background-elevated border border-white/10 rounded-full hover:bg-white/5 transition-colors group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-accent-purple/20 flex items-center justify-center border border-accent-purple/30 group-hover:border-accent-purple/50 transition-colors">
              <Wallet size={14} className="text-accent-purple group-hover:text-accent-purple/80 transition-colors" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-bold text-white leading-none">{walletAlias}</span>
              <span className="text-[9px] font-mono text-text-secondary leading-none mt-1">
                {wallet.slice(0, 4)}...{wallet.slice(-4)}
              </span>
            </div>
          </button>
        </div>
      </header>

      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
      <SendModal isOpen={isSendModalOpen} onClose={() => setIsSendModalOpen(false)} />
    </>
  )
}
