import { useState } from 'react'
import { Server, FileText, RefreshCw, CheckCircle, XCircle, AlertCircle, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { useMonitorStore, useMonitorSubscription } from '@/hooks/useMonitorData'

export function ServiceMonitorWidget() {
  useMonitorSubscription()
  const services = useMonitorStore(s => s.systemServices)
  const loading = useMonitorStore(s => s.loading)
  const fetchMonitor = useMonitorStore(s => s.refresh)

  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<string>('')
  const [logLoading, setLogLoading] = useState(false)

  const fetchLogs = async (serviceId: string) => {
    setLogLoading(true)
    try {
      const res = await fetch(`/api/system/services/${serviceId}/logs?lines=30`)
      const data = await res.json()
      if (data.success) {
        setLogContent(data.logs)
      }
    } catch {
      setLogContent('Failed to load logs')
    } finally {
      setLogLoading(false)
    }
  }

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
          onClick={() => fetchMonitor()}
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
