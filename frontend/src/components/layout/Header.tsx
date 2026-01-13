import { useState } from 'react'
import { Wallet, Bell } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { WalletModal } from '@/components/modals/WalletModal'

export const Header = () => {
  const { wallet, walletAlias } = useAppSelector(state => state.portfolio)
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  return (
    <>
      <header className="h-16 flex items-center justify-between px-6 bg-background-card/50 backdrop-blur border-b border-border sticky top-0 z-10">
        {/* Breadcrumb / Page Title Placeholder */}
        <div className="flex items-center gap-4">
          <span className="text-text-secondary text-sm font-mono">Dashboard / Overview</span>
        </div>

        <div className="flex items-center gap-6">
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
    </>
  )
}
