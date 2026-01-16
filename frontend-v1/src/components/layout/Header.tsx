import { useState, useEffect } from 'react'
import { Wallet, Bell, Send } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { WalletModal } from '@/components/modals/WalletModal'
import { SendModal } from '@/components/modals/SendModal'
import { cn } from '@/lib/utils'
import { useLocation } from 'react-router-dom'
import { StrategyTabs } from './StrategyTabs'

export const Header = () => {
  const location = useLocation()
  const { walletAlias, connected: webConnected } = useAppSelector(state => state.portfolio)
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
  const isPriceUp = priceConnected && lastUpdate > 0 && timeDiff < 5000
  const priceColor = isPriceUp ? 'bg-accent-cyan' : 'bg-accent-pink'
  const priceTextClass = isPriceUp ? 'text-accent-cyan' : 'text-accent-pink'
  const pricePulse = isPriceUp

  // Web Status Logic
  const webStatusText = 'Web'
  const webColor = webConnected ? 'bg-accent-cyan' : 'bg-accent-pink'
  const webTextClass = webConnected ? 'text-accent-cyan' : 'text-accent-pink'

  const handleRestart = async () => {
    if (!confirm("Initiate emergency system restart? All active strategy threads will be re-synchronized.")) return;
    try {
      await fetch('/api/system/restart', { method: 'POST' });
      alert("Restart signal broadcasted. System will go offline briefly.");
    } catch (e) {
      console.error("Restart failed", e);
    }
  }

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard / Overview'
      case '/trade': return 'Terminal / Trade'
      case '/strategies': return 'Engine / Strategies'
      case '/copytrade': return 'Intelligence / Copy Trade'
      default: return 'Tactix / System'
    }
  }

  return (
    <>
      <header className="h-16 flex items-center justify-between px-6 bg-background-card/50 backdrop-blur sticky top-0 z-10">
        {/* Breadcrumb / Page Title Placeholder */}
        <div className="flex items-center gap-4 min-w-[200px]">
          <span className="text-text-secondary text-[10px] font-mono uppercase tracking-widest">{getPageTitle()}</span>
        </div>

        {/* Dynamic Center Content (Tabs for Strategies) */}
        <div className="flex-1 flex justify-center">
          {location.pathname === '/strategies' && <StrategyTabs />}
        </div>

        <div className="flex items-center gap-4 min-w-[200px] justify-end">
          {/* Status Indicators */}
          <div className="flex items-center gap-2 mr-2">
            <button 
              onClick={handleRestart}
              title="System Health: Click to Restart Services"
              className={cn(
                "flex items-center justify-center gap-2 w-20 h-8 rounded-md border transition-all duration-500 bg-background-elevated/50 hover:bg-white/5 group cursor-pointer",
                isPriceUp ? "border-accent-cyan/20 shadow-[0_0_10px_rgba(0,255,234,0.05)]" : "border-accent-pink/20 shadow-[0_0_10px_rgba(255,0,128,0.05)]"
              )}
            >
               <div className={cn("w-1.5 h-1.5 rounded-full transition-colors duration-500", priceColor, pricePulse && "animate-pulse shadow-[0_0_8px_currentColor]")} />
               <span className={cn("text-[9px] font-black uppercase tracking-widest transition-colors duration-500", priceTextClass)}>
                 Price
               </span>
            </button>
            <button 
              onClick={handleRestart}
              title="API Health: Click to Restart Services"
              className={cn(
                "flex items-center justify-center gap-2 w-20 h-8 rounded-md border transition-all duration-500 bg-background-elevated/50 hover:bg-white/5 group cursor-pointer",
                webConnected ? "border-accent-cyan/20 shadow-[0_0_10px_rgba(0,255,234,0.05)]" : "border-accent-pink/20 shadow-[0_0_10px_rgba(255,0,128,0.05)]"
              )}
            >
               <div className={cn("w-1.5 h-1.5 rounded-full transition-colors duration-500", webColor, webConnected && "animate-pulse shadow-[0_0_8px_currentColor]")} />
               <span className={cn("text-[9px] font-black uppercase tracking-widest transition-colors duration-500", webTextClass)}>
                 {webStatusText}
               </span>
            </button>
          </div>

          <div className="w-px h-6 bg-white/5" />

          {/* Send Button */}
          <button 
            onClick={() => setIsSendModalOpen(true)}
            className="flex items-center gap-2 px-3 h-8 bg-accent-purple/10 border border-accent-purple/20 rounded-lg text-accent-purple hover:bg-accent-purple/20 transition-all group"
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
            className="flex items-center gap-3 pl-2 py-1.5 pr-4 bg-background-elevated border border-border rounded-full hover:bg-white/5 transition-colors group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-accent-purple/20 flex items-center justify-center border border-accent-purple/30 group-hover:border-accent-purple/50 transition-colors">
              <Wallet size={14} className="text-accent-purple group-hover:text-accent-purple/80 transition-colors" />
            </div>
            <div className="flex flex-col items-start justify-center">
              <span className="text-[10px] font-bold text-white leading-none">{walletAlias}</span>
            </div>
          </button>
        </div>
      </header>

      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
      <SendModal isOpen={isSendModalOpen} onClose={() => setIsSendModalOpen(false)} />
    </>
  )
}
