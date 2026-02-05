import { useState, useEffect } from 'react'
import { Power, Zap, Users, Newspaper, Skull, Shield, Lock, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'

interface ServiceStatus {
  name: string
  description: string
  running: boolean
  initialized: boolean
  icon?: string
  color?: string
}

interface SystemStatus {
  [key: string]: ServiceStatus
}

const modules = [
  { id: 'arb_engine', name: 'Arb Engine', icon: Zap, description: 'High-frequency scan & execute' },
  { id: 'copy_trader', name: 'Copy Trader', icon: Users, description: 'Whale tracking & replication' },
  { id: 'wolf_pack', name: 'Wolf Pack', icon: Crosshair, description: 'Whale consensus trading' },
  { id: 'dlmm_sniper', name: 'DLMM Sniper', icon: Skull, description: 'Meteora pool detection' },
  { id: 'news', name: 'Intel Feed', icon: Newspaper, description: 'News & social aggregation' },
  { id: 'network_monitor', name: 'Network Monitor', icon: Shield, description: 'Security surveillance & alerts' },
  { id: 'skr_staking', name: 'SKR Staking', icon: Lock, description: 'SKR staking event tracking' },
]

export function TradingModulesWidget() {
  const [status, setStatus] = useState<SystemStatus>({})
  const [loading, setLoading] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/services/status')
      const data = await res.json()
      setStatus(data)
    } catch (e) {
      console.error('Failed to fetch status', e)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const toggleService = async (serviceId: string) => {
    setLoading(serviceId)
    try {
      await fetch(`/api/services/${serviceId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      await fetchStatus()
    } catch (e) {
      console.error('Toggle failed', e)
    } finally {
      setLoading(null)
    }
  }

  const isServiceRunning = (serviceId: string): boolean => {
    return status[serviceId]?.running ?? false
  }

  const activeCount = modules.filter(m => isServiceRunning(m.id)).length

  return (
    <WidgetContainer
      id="trading-modules"
      title="Trading Modules"
      icon={<Zap className="w-4 h-4" />}
      badge={`${activeCount}/${modules.length}`}
      badgeVariant={activeCount === modules.length ? 'green' : activeCount > 0 ? 'yellow' : 'red'}
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3">
        <div className="grid grid-cols-2 gap-2">
          {modules.map((module) => {
            const isOn = isServiceRunning(module.id)
            const isLoading = loading === module.id
            const Icon = module.icon

            return (
              <div
                key={module.id}
                className={cn(
                  'p-3 rounded-xl border transition-all',
                  'bg-white/[0.02] border-white/[0.06]',
                  isOn && 'border-accent-cyan/30 bg-accent-cyan/5'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center',
                    isOn ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-white/5 text-white/40'
                  )}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-white truncate">{module.name}</div>
                    <div className="text-[9px] text-white/40 truncate">{module.description}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className={cn(
                    'flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider',
                    isOn ? 'text-accent-green' : 'text-accent-red'
                  )}>
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      isOn ? 'bg-accent-green animate-pulse' : 'bg-accent-red'
                    )} />
                    {isOn ? 'Active' : 'Stopped'}
                  </div>

                  <button
                    onClick={() => toggleService(module.id)}
                    disabled={isLoading}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all',
                      isOn
                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                        : 'bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20',
                      isLoading && 'opacity-50 cursor-wait'
                    )}
                  >
                    <Power size={10} />
                    {isLoading ? '...' : isOn ? 'Stop' : 'Start'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </WidgetContainer>
  )
}
