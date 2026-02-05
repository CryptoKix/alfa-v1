import { useState, useEffect, useCallback } from 'react'
import { Power, Users, TrendingUp, Crosshair, Newspaper, Loader2, RefreshCw, Shield } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ServiceStatus {
  name: string
  description: string
  icon: string
  color: string
  running: boolean
}

interface ServicesState {
  [key: string]: ServiceStatus
}

const ICON_MAP: Record<string, React.ElementType> = {
  Users: Users,
  TrendingUp: TrendingUp,
  Crosshair: Crosshair,
  Newspaper: Newspaper,
  Shield: Shield
}

const COLOR_MAP: Record<string, string> = {
  cyan: 'accent-cyan',
  green: 'accent-green',
  purple: 'accent-purple',
  pink: 'accent-pink'
}

export default function ControlPanelWidget() {
  const [services, setServices] = useState<ServicesState>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [initialLoading, setInitialLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/services/status')
      const data = await res.json()
      setServices(data)
    } catch (e) {
      console.error('Failed to fetch service status:', e)
    } finally {
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [fetchStatus])

  const toggleService = async (serviceKey: string) => {
    setLoading(prev => ({ ...prev, [serviceKey]: true }))
    try {
      const res = await fetch(`/api/services/${serviceKey}/toggle`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setServices(prev => ({
          ...prev,
          [serviceKey]: { ...prev[serviceKey], running: data.running }
        }))
      }
    } catch (e) {
      console.error('Failed to toggle service:', e)
    } finally {
      setLoading(prev => ({ ...prev, [serviceKey]: false }))
    }
  }

  const runningCount = Object.values(services).filter(s => s.running).length
  const totalCount = Object.keys(services).length

  if (initialLoading) {
    return (
      <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-4 shadow-xl flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-text-muted" size={24} />
      </div>
    )
  }

  return (
    <div className="bg-background-card border border-accent-cyan/10 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col gap-3 h-full">
      {/* Header accent */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 via-accent-cyan/20 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-accent-cyan/10 pb-3 -mx-4 px-4 -mt-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent-cyan/10 text-accent-cyan">
            <Power size={16} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-tight">Control Panel</h2>
            <p className="text-[9px] text-text-muted">Module Activation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            "text-[10px] font-bold px-2 py-1 rounded-full",
            runningCount > 0 ? "bg-accent-green/20 text-accent-green" : "bg-white/10 text-text-muted"
          )}>
            {runningCount}/{totalCount} ACTIVE
          </div>
          <button
            onClick={fetchStatus}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white transition-all"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Service Grid */}
      <div className="grid grid-cols-2 gap-2 flex-1">
        {Object.entries(services).map(([key, service]) => {
          const IconComponent = ICON_MAP[service.icon] || Power
          const colorClass = COLOR_MAP[service.color] || 'accent-cyan'
          const isLoading = loading[key]

          return (
            <button
              key={key}
              onClick={() => toggleService(key)}
              disabled={isLoading}
              className={cn(
                "relative rounded-xl border p-3 transition-all duration-300 group text-left",
                "hover:scale-[1.02] active:scale-[0.98]",
                service.running
                  ? `bg-${colorClass}/10 border-${colorClass}/50 shadow-[0_0_20px_rgba(0,255,255,0.1)]`
                  : "bg-background-elevated border-white/10 hover:border-white/20"
              )}
              style={{
                backgroundColor: service.running ? `var(--${colorClass})10` : undefined,
                borderColor: service.running ? `var(--${colorClass})50` : undefined
              }}
            >
              {/* Status indicator */}
              <div className={cn(
                "absolute top-2 right-2 w-2 h-2 rounded-full transition-all",
                service.running ? "bg-accent-green animate-pulse" : "bg-white/20"
              )} />

              {/* Icon */}
              <div className={cn(
                "p-2 rounded-lg w-fit mb-2 transition-all",
                service.running
                  ? `bg-${colorClass}/20 text-${colorClass}`
                  : "bg-white/5 text-text-muted group-hover:text-white"
              )}
              style={{
                backgroundColor: service.running ? `var(--${colorClass})20` : undefined,
                color: service.running ? `var(--${colorClass})` : undefined
              }}
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <IconComponent size={16} />
                )}
              </div>

              {/* Text */}
              <div className="text-[9px] font-bold text-white uppercase tracking-tight leading-tight">
                {service.name}
              </div>
              <div className="text-[7px] text-text-muted leading-tight mt-0.5 line-clamp-2">
                {service.description}
              </div>

              {/* Status text */}
              <div className={cn(
                "text-[8px] font-bold uppercase tracking-widest mt-2",
                service.running ? "text-accent-green" : "text-text-muted"
              )}>
                {isLoading ? 'SWITCHING...' : service.running ? 'ONLINE' : 'OFFLINE'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer hint */}
      <div className="text-[8px] text-text-muted text-center border-t border-white/5 pt-2 -mx-4 px-4">
        Click to toggle modules. Inactive modules save API requests.
      </div>
    </div>
  )
}
