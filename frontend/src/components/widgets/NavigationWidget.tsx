import { LayoutDashboard, Zap, Bot, Users, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Zap, label: 'Trade', path: '/trade' },
  { icon: Bot, label: 'Strategies', path: '/strategies' },
  { icon: Users, label: 'Copy Trade', path: '/copytrade' },
  { icon: Crosshair, label: 'Sniper', path: '/sniper', disabled: true },
]

export const NavigationWidget = () => {
  const activePath = window.location.pathname

  return (
    <aside className="w-20 md:w-64 bg-background-card border border-white/5 rounded-2xl flex flex-col shrink-0 h-full relative overflow-hidden shadow-xl p-4">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />

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
    </aside>
  )
}
