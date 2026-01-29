import { useState } from 'react'
import { LayoutDashboard, Zap, Bot, Users, Crosshair, Newspaper, Percent, Layers, Settings, Smartphone, Sprout, ChevronLeft, ChevronRight, Navigation } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Zap, label: 'Trade', path: '/trade' },
  { icon: Bot, label: 'Strategies', path: '/strategies' },
  { icon: Users, label: 'Copy Trade', path: '/copytrade' },
  { icon: Crosshair, label: 'Sniper', path: '/sniper' },
  { icon: Layers, label: 'DLMM', path: '/dlmm' },
  { icon: Percent, label: 'Yield Hunter', path: '/yield' },
  { icon: Sprout, label: 'Yield Farm', path: '/yieldfarm' },
  { icon: Newspaper, label: 'Intel', path: '/news' },
  { icon: Settings, label: 'Control Panel', path: '/control' },
  { icon: Smartphone, label: 'Seeker', path: '/seeker' },
]

export const NavigationWidget = () => {
  const location = useLocation()
  const activePath = location.pathname
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background-card border-t border-accent-cyan/10 px-2 py-1">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 5).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[60px]",
                activePath === item.path
                  ? "text-accent-cyan"
                  : "text-text-muted"
              )}
            >
              <item.icon size={20} />
              <span className="text-[8px] font-bold uppercase tracking-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside
        style={{
          backgroundColor: '#0a0a0a',
          border: '1px solid rgba(0, 255, 255, 0.1)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          overflow: 'hidden',
        }}
        className={cn(
          "hidden md:flex flex-col shrink-0 h-full transition-all duration-300",
          isCollapsed ? "w-[72px]" : "w-[72px] lg:w-[220px]"
        )}
      >
        {/* Top glow line */}
        <div
          className="absolute top-0 left-0 w-full h-[1px] z-10"
          style={{ background: 'linear-gradient(to right, rgba(0, 255, 255, 0.6), rgba(0, 255, 255, 0.2), transparent)' }}
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-accent-cyan/10 shrink-0 h-[55px] px-4">
          <div className={cn("hidden items-center gap-2", !isCollapsed && "lg:flex")}>
            <Navigation className="text-accent-cyan" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-tight text-white">TACTIX</h3>
          </div>
          <div className={cn("flex items-center justify-center w-full", !isCollapsed && "lg:hidden")}>
            <Navigation className="text-accent-cyan" size={20} />
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const isActive = activePath === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 relative",
                  isActive
                    ? "bg-accent-cyan/10 text-accent-cyan"
                    : "text-text-muted hover:text-white hover:bg-white/5",
                  isCollapsed && "justify-center px-2"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-accent-cyan rounded-r-full" style={{ boxShadow: '0 0 8px #00ffff' }} />
                )}

                <item.icon
                  size={18}
                  className={cn(
                    "shrink-0",
                    isActive && "drop-shadow-[0_0_6px_#00ffff]"
                  )}
                />

                <span className={cn(
                  "text-xs font-medium tracking-wide truncate",
                  isCollapsed ? "hidden" : "hidden lg:block"
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-2 border-t border-accent-cyan/10 shrink-0">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg",
              "text-text-muted hover:text-white hover:bg-white/5 transition-all",
              isCollapsed && "justify-center"
            )}
          >
            {isCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={16} className="lg:block hidden" />
                <ChevronRight size={16} className="lg:hidden" />
                <span className="text-[11px] font-medium hidden lg:block">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
