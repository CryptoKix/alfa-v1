import { useEffect, useState } from 'react'
import { LayoutDashboard, Zap, Bot, Users, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/app/hooks'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Zap, label: 'Trade', path: '/trade' },
  { icon: Bot, label: 'Strategies', path: '/strategies' },
  { icon: Users, label: 'Copy Trade', path: '/copytrade' },
  { icon: Crosshair, label: 'Sniper', path: '/sniper', disabled: true },
]

export const NavigationWidget = () => {
  const activePath = window.location.pathname
  const { lastUpdate, connected: priceConnected } = useAppSelector(state => state.prices)
  const { connected: webConnected } = useAppSelector(state => state.portfolio)
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
    <aside className="w-20 md:w-64 bg-background-card border border-white/5 rounded-2xl flex flex-col shrink-0 h-full relative overflow-hidden shadow-xl p-4">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />

      <div className="h-16 flex items-center justify-center border-b border-white/5 mb-4 shrink-0">
        <h1 className="hidden md:block text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-accent-cyan to-accent-purple">
          TACTIX
        </h1>
        <h1 className="md:hidden text-2xl font-black text-accent-cyan">T</h1>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => (
          <a
            key={item.path}
            href={item.disabled ? '#' : item.path}
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group",
              activePath === item.path
                ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 shadow-[0_0_15px_rgba(0,255,255,0.1)]"
                : "text-text-secondary hover:text-white hover:bg-white/5",
              item.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <item.icon size={20} className={cn(
              "transition-transform duration-300",
              activePath === item.path ? "scale-110" : "group-hover:scale-110"
            )} />
            <span className="hidden md:block font-bold text-xs tracking-wide uppercase">{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="pt-4 border-t border-white/5 space-y-2 mt-auto">
        {/* Price Status */}
        <div className="flex items-center gap-3 px-3 py-2 bg-background-elevated/30 rounded-lg border border-white/5">
           <div className={cn("w-2 h-2 rounded-full transition-colors duration-500", priceColor, pricePulse && "animate-pulse")} />
           <span className={cn("hidden md:block text-[9px] font-mono font-bold uppercase transition-colors duration-500", priceTextClass)}>
             {priceStatusText}
           </span>
        </div>
        
        {/* Web Status */}
        <div className="flex items-center gap-3 px-3 py-2 bg-background-elevated/30 rounded-lg border border-white/5">
           <div className={cn("w-2 h-2 rounded-full transition-colors duration-500", webColor, webConnected && "animate-pulse")} />
           <span className={cn("hidden md:block text-[9px] font-mono font-bold uppercase transition-colors duration-500", webTextClass)}>
             {webStatusText}
           </span>
        </div>
      </div>
    </aside>
  )
}
