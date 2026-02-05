import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Bot,
  Users,
  Zap,
  Crosshair,
  Layers,
  Droplets,
  Sprout,
  Lock,
  Newspaper,
  Settings,
  ChevronLeft,
  ChevronRight,
  Navigation,
} from 'lucide-react'
import { Tooltip } from '@/components/ui'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/trade', icon: ArrowLeftRight, label: 'Trade' },
  { path: '/bots', icon: Bot, label: 'Bots' },
  { path: '/copytrade', icon: Users, label: 'Copy Trade' },
  { path: '/arb', icon: Zap, label: 'Arbitrage' },
  { path: '/sniper', icon: Crosshair, label: 'Sniper' },
  { path: '/liquidity', icon: Droplets, label: 'Liquidity' },
  { path: '/dlmm', icon: Layers, label: 'DLMM (Legacy)' },
  { path: '/yield', icon: Sprout, label: 'Yield' },
  { path: '/skr', icon: Lock, label: 'SKR Staking' },
  { path: '/intel', icon: Newspaper, label: 'Intel' },
  { path: '/control', icon: Settings, label: 'Control Panel' },
]

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore()

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 72 : 220 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      style={{
        backgroundColor: '#0a0a0a',
        border: '1px solid rgba(0, 255, 255, 0.1)',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}
      className="h-full flex flex-col"
    >
      {/* Top glow line - same as widgets */}
      <div
        className="absolute top-0 left-0 w-full h-[1px] z-10"
        style={{ background: 'linear-gradient(to right, rgba(0, 255, 255, 0.6), rgba(0, 255, 255, 0.2), transparent)' }}
      />

      {/* Logo - matches header height */}
      <div className="h-[55px] flex items-center border-b border-[rgba(0,255,255,0.1)] px-4 shrink-0">
        <AnimatePresence mode="wait">
          {sidebarCollapsed ? (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex justify-center"
            >
              <Navigation className="text-[var(--accent-cyan)]" size={20} />
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Navigation className="text-[var(--accent-cyan)]" size={18} />
              <span className="text-sm font-bold uppercase tracking-tight text-white">TACTIX</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon

          const linkContent = (
            <NavLink
              to={item.path}
              className={cn(
                'flex items-center gap-3 h-10 px-3 rounded-lg transition-all duration-150 relative',
                isActive
                  ? 'bg-[rgba(0,240,255,0.1)] text-[var(--accent-cyan)]'
                  : 'text-white/50 hover:text-white/80 hover:bg-[rgba(255,255,255,0.04)]'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-[var(--accent-cyan)] rounded-r-full" style={{ boxShadow: '0 0 8px #00ffff' }} />
              )}
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'drop-shadow-[0_0_6px_var(--accent-cyan)]')} />
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-sm font-medium whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          )

          return (
            <div key={item.path}>
              {sidebarCollapsed ? (
                <Tooltip content={item.label} side="right">
                  {linkContent}
                </Tooltip>
              ) : (
                linkContent
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-2 border-t border-[rgba(0,255,255,0.1)] shrink-0">
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn(
            'w-full flex items-center gap-3 h-10 px-3 rounded-lg',
            'text-white/30 hover:text-white/60 hover:bg-[rgba(255,255,255,0.04)] transition-all',
            sidebarCollapsed && 'justify-center'
          )}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  )
}
