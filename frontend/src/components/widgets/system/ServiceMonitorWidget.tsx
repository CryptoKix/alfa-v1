import { useState, useEffect } from 'react'
import { Server, Activity, FileText, RefreshCw, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'

interface Service {
  id: string
  name: string
  description: string
  port: number | null
  status: 'running' | 'stopped' | 'error' | 'unknown'
  last_log: string
}

export function ServiceMonitorWidget() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<string>('')
  const [logLoading, setLogLoading] = useState(false)

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/system/services')
      const data = await res.json()
      if (data.success) {
        setServices(data.services)
      }
    } catch (e) {
      console.error('Failed to fetch services:', e)
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async (serviceId: string) => {
    setLogLoading(true)
    try {
      const res = await fetch(`/api/system/services/${serviceId}/logs?lines=30`)
      const data = await res.json()
      if (data.success) {
        setLogContent(data.logs)
      }
    } catch (e) {
      setLogContent('Failed to load logs')
    } finally {
      setLogLoading(false)
    }
  }

  useEffect(() => {
    fetchServices()
    const interval = setInterval(fetchServices, 10000) // Poll every 10s
    return () => clearInterval(interval)
  }, [])

  const toggleLogs = (serviceId: string) => {
    if (expandedLogs === serviceId) {
      setExpandedLogs(null)
      setLogContent('')
    } else {
      setExpandedLogs(serviceId)
      fetchLogs(serviceId)
    }
  }

  const runningCount = services.filter(s => s.status === 'running').length
  const totalCount = services.length

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="w-4 h-4 text-accent-green" />
      case 'stopped':
        return <XCircle className="w-4 h-4 text-accent-red" />
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-accent-green'
      case 'stopped':
        return 'text-accent-red'
      default:
        return 'text-yellow-500'
    }
  }

  return (
    <WidgetContainer
      id="service-monitor"
      title="Service Monitor"
      icon={<Server className="w-4 h-4" />}
      badge={`${runningCount}/${totalCount}`}
      badgeVariant={runningCount === totalCount ? 'green' : runningCount > 0 ? 'yellow' : 'red'}
      actions={
        <button
          onClick={() => { setLoading(true); fetchServices(); }}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40 hover:text-accent-cyan transition-colors font-semibold"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </button>
      }
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_70px_50px_40px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold">
          <div>Service</div>
          <div>Status</div>
          <div>Port</div>
          <div>Logs</div>
        </div>

        {loading && services.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-white/30">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          services.map((service) => (
            <div key={service.id} className="space-y-0">
              <div
                className={cn(
                  'grid grid-cols-[1fr_70px_50px_40px] gap-3 px-3 py-2 items-center transition-all',
                  'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                  'hover:bg-white/[0.04] hover:border-accent-cyan/30',
                  expandedLogs === service.id && 'rounded-b-none border-b-0'
                )}
              >
                {/* Service Name */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      service.status === 'running' ? 'bg-accent-green animate-pulse' : 'bg-accent-red'
                    )} />
                    <span className="text-[12px] font-semibold text-white truncate">
                      {service.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/40 truncate pl-4">{service.description}</p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1">
                  {getStatusIcon(service.status)}
                  <span className={cn('text-[10px] font-bold uppercase', getStatusColor(service.status))}>
                    {service.status}
                  </span>
                </div>

                {/* Port */}
                <div className="text-[11px] font-mono text-white/50">
                  {service.port || '-'}
                </div>

                {/* Logs Button */}
                <button
                  onClick={() => toggleLogs(service.id)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                >
                  {expandedLogs === service.id ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Expanded Logs */}
              {expandedLogs === service.id && (
                <div className="bg-black/40 border border-white/[0.06] border-t-0 rounded-b-xl p-3 max-h-48 overflow-auto">
                  {logLoading ? (
                    <div className="flex items-center justify-center py-4 text-white/30">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    </div>
                  ) : (
                    <pre className="text-[9px] font-mono text-white/60 whitespace-pre-wrap break-all">
                      {logContent || 'No logs available'}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  )
}
