import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, shortenAddress } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'
import { useUIStore } from '@/stores/uiStore'
import { useLayoutStore } from '@/stores/layoutStore'
import {
  Bell,
  Search,
  LayoutGrid,
  RotateCcw,
  Copy,
  ExternalLink,
  Wallet,
  LogOut,
  Signal,
  SignalZero,
} from 'lucide-react'
import { Tooltip } from '@/components/ui'

// Widget container styles - exact same as other widgets
const widgetStyles: React.CSSProperties = {
  backgroundColor: '#0a0a0a',
  border: '1px solid rgba(0, 255, 255, 0.1)',
  borderRadius: '16px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  position: 'relative',
  overflow: 'hidden',
}

export function Header() {
  const { connected: portfolioConnected } = useAppSelector((state) => state.portfolio)
  const { connected: pricesConnected } = useAppSelector((state) => state.prices)
  const { notifications } = useAppSelector((state) => state.notifications)
  const unreadCount = notifications.filter((n) => !n.read).length

  const { setNotificationPanelOpen, setCommandPaletteOpen } = useUIStore()
  const { isEditMode, setEditMode, resetLayout, currentPage } = useLayoutStore()

  const [showWalletMenu, setShowWalletMenu] = useState(false)

  const { mode, browserWalletConnected, browserWalletAddress, serverWalletAddress } = useAppSelector((state) => state.wallet)

  // Use server wallet when in server mode, browser wallet when in browser mode
  const isServerMode = mode === 'server'
  const connected = isServerMode ? !!serverWalletAddress : browserWalletConnected
  const publicKeyStr = isServerMode ? serverWalletAddress : browserWalletAddress

  const handleCopyAddress = () => {
    if (publicKeyStr) {
      navigator.clipboard.writeText(publicKeyStr)
    }
  }

  return (
    <header style={widgetStyles} className="h-[55px] flex items-center justify-between px-4 shrink-0">
      {/* Top glow line */}
      <div
        className="absolute top-0 left-0 w-full h-[1px] z-10"
        style={{ background: 'linear-gradient(to right, rgba(0, 255, 255, 0.6), rgba(0, 255, 255, 0.2), transparent)' }}
      />

      {/* Left section - Search */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className={cn(
            'flex items-center gap-2 h-8 px-3 rounded-lg',
            'bg-white/[0.03] border border-white/[0.08]',
            'text-text-muted hover:text-white hover:bg-white/[0.06] hover:border-accent-cyan/30',
            'transition-all duration-200'
          )}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-[11px] hidden sm:inline">Search...</span>
          <kbd className="ml-2 text-[9px] text-text-muted bg-white/[0.06] px-1.5 py-0.5 rounded font-mono hidden sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Center section - Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {portfolioConnected ? (
            <Signal className="w-3.5 h-3.5 text-accent-green" />
          ) : (
            <SignalZero className="w-3.5 h-3.5 text-accent-red" />
          )}
          <span className={cn(
            "text-[11px] font-medium",
            portfolioConnected ? "text-accent-green" : "text-accent-red"
          )}>
            {portfolioConnected ? 'Connected' : 'Offline'}
          </span>
        </div>

        <div className="w-px h-4 bg-white/10" />

        <div className="flex items-center gap-2">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            pricesConnected
              ? "bg-accent-cyan"
              : "bg-white/30"
          )} style={pricesConnected ? { boxShadow: '0 0 6px #00ffff' } : {}} />
          <span className="text-[11px] text-text-muted">Prices</span>
        </div>
      </div>

      {/* Right section - Actions */}
      <div className="flex items-center gap-1.5">
        {/* Edit Mode Toggle */}
        <Tooltip content={isEditMode ? 'Exit edit mode' : 'Edit layout'}>
          <button
            onClick={() => setEditMode(!isEditMode)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-2.5 rounded-lg transition-all duration-200',
              isEditMode
                ? 'bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan'
                : 'text-text-muted hover:text-white hover:bg-white/5'
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {isEditMode && <span className="text-[11px] font-medium hidden sm:inline">Editing</span>}
          </button>
        </Tooltip>

        {isEditMode && (
          <Tooltip content="Reset layout">
            <button
              onClick={() => resetLayout(currentPage)}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        {/* Notifications */}
        <Tooltip content="Notifications">
          <button
            onClick={() => setNotificationPanelOpen(true)}
            className="relative h-8 w-8 flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-all"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-[8px] font-bold bg-accent-pink text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 0 6px #ff00ff' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </Tooltip>

        {/* Wallet Button */}
        <div className="relative ml-1">
          {connected && publicKeyStr ? (
            <button
              onClick={() => setShowWalletMenu(!showWalletMenu)}
              className={cn(
                'flex items-center gap-2 h-8 px-2.5 rounded-lg transition-all duration-200',
                isServerMode
                  ? 'bg-accent-purple/10 border border-accent-purple/30 hover:bg-accent-purple/15 hover:border-accent-purple/50'
                  : 'bg-accent-cyan/10 border border-accent-cyan/30 hover:bg-accent-cyan/15 hover:border-accent-cyan/50'
              )}
            >
              {isServerMode && (
                <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-accent-purple/20 text-accent-purple">
                  Server
                </span>
              )}
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green" style={{ boxShadow: '0 0 4px #00ff9d' }} />
              <span className={cn(
                "text-[11px] font-mono",
                isServerMode ? "text-accent-purple" : "text-accent-cyan"
              )}>
                {shortenAddress(publicKeyStr)}
              </span>
            </button>
          ) : (
            <button
              className={cn(
                'flex items-center gap-2 h-8 px-3 rounded-lg font-medium text-[11px] transition-all duration-200',
                'border border-accent-cyan/40',
                'text-white hover:border-accent-cyan/60'
              )}
              style={{ background: 'linear-gradient(to right, rgba(0, 255, 255, 0.2), rgba(153, 69, 255, 0.2))' }}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect</span>
            </button>
          )}

          {/* Wallet dropdown */}
          <AnimatePresence>
            {showWalletMenu && connected && publicKeyStr && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowWalletMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  style={{ ...widgetStyles, borderRadius: '12px' }}
                  className="absolute right-0 top-full mt-2 z-50 w-52"
                >
                  <div className="p-3 border-b border-accent-cyan/10">
                    <p className="text-[9px] uppercase tracking-wider text-text-muted mb-1">Wallet</p>
                    <p className="text-[12px] font-mono text-white">
                      {shortenAddress(publicKeyStr, 6)}
                    </p>
                  </div>

                  <div className="p-1">
                    <button
                      onClick={handleCopyAddress}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-white/5 hover:text-white transition-colors text-[12px]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Address
                    </button>

                    <a
                      href={`https://solscan.io/account/${publicKeyStr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-white/5 hover:text-white transition-colors text-[12px]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View on Solscan
                    </a>
                  </div>

                  <div className="p-1 border-t border-accent-cyan/10">
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-accent-red hover:bg-accent-red/10 transition-colors text-[12px]"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
