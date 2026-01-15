import { LayoutDashboard, Zap, Bot, Users, Crosshair, Newspaper } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Zap, label: 'Trade', path: '/trade' },
  { icon: Bot, label: 'Strategies', path: '/strategies' },
  { icon: Users, label: 'Copy Trade', path: '/copytrade' },
  { icon: Crosshair, label: 'Sniper', path: '/sniper' },
  { icon: Newspaper, label: 'Intel', path: '/news' },
  { image: '/cherry.jpg', label: 'Cherry', path: '/cherry', disabled: true },
]

export const NavigationWidget = () => {
  const location = useLocation()
  const activePath = location.pathname

  return (
    <aside className="w-20 md:w-64 bg-background-card border border-white/5 rounded-2xl flex flex-col shrink-0 h-full relative overflow-hidden shadow-xl px-4 pb-4">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />

      <div className="h-16 flex items-center justify-center border-b border-white/5 mb-2 shrink-0">
        <div className="hidden md:flex items-center gap-3">
          <img src="/logo_concept_1.svg" alt="Tactix" className="w-8 h-8 drop-shadow-glow-cyan" />
          <div className="flex flex-col">
            <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-accent-cyan to-accent-purple leading-none">
              TACTIX.sol
            </h1>
            <span className="text-[7px] font-bold text-accent-cyan uppercase tracking-[0.3em] opacity-80 mt-1">
              v1.0.1 Alpha
            </span>
          </div>
        </div>
        <div className="md:hidden flex items-center justify-center">
          <img src="/logo_concept_1.svg" alt="T" className="w-10 h-10 drop-shadow-glow-cyan" />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar mt-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.disabled ? '#' : item.path}
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group",
              activePath === item.path
                ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 shadow-[0_0_15px_rgba(0,255,255,0.1)]"
                : "text-text-secondary hover:text-white hover:bg-white/5",
              item.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="w-6 flex items-center justify-center shrink-0">
              {item.icon ? (
                <item.icon size={20} className={cn(
                  "transition-transform duration-300",
                  activePath === item.path ? "scale-110" : "group-hover:scale-110"
                )} />
              ) : (
                <img 
                  src={item.image} 
                  className={cn(
                    "w-6 h-6 rounded-sm object-cover transition-transform duration-300",
                    activePath === item.path ? "scale-110 shadow-glow-pink" : "group-hover:scale-110"
                  )} 
                  alt="" 
                />
              )}
            </div>
            <span className="hidden md:block font-bold text-xs tracking-wide uppercase">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
