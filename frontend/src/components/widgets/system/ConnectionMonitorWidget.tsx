import { Radio, Wifi, Database, Box, Hexagon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { useMonitorStore, useMonitorSubscription } from '@/hooks/useMonitorData'

interface ConnectionRow {
  label: string
  icon: typeof Radio
  connected: boolean
  latencyMs: number | null
  detail: string
}

function LatencyBar({ ms, max = 500 }: { ms: number | null; max?: number }) {
  if (ms === null) return <span className="text-[9px] text-white/30 font-mono">—</span>
  const pct = Math.min((ms / max) * 100, 100)
  const color = ms < 100 ? 'bg-accent-green' : ms < 300 ? 'bg-yellow-500' : 'bg-accent-red'
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-white/50 w-10 text-right">{ms}ms</span>
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <div className={cn(
      'w-2 h-2 rounded-full shrink-0',
      ok ? 'bg-accent-green animate-pulse' : 'bg-accent-red'
    )} />
  )
}

export function ConnectionMonitorWidget() {
  useMonitorSubscription()
  const shyft = useMonitorStore(s => s.shyft)
  const blockhash = useMonitorStore(s => s.blockhash)
  const sidecars = useMonitorStore(s => s.sidecars)
  const loading = useMonitorStore(s => s.loading)

  const connections: ConnectionRow[] = [
    {
      label: 'Geyser gRPC',
      icon: Radio,
      connected: shyft?.geyser_connected ?? false,
      latencyMs: shyft?.geyser_age_ms ?? null,
      detail: shyft ? `${(shyft.geyser_updates ?? 0).toLocaleString()} updates` : '',
    },
    {
      label: 'RabbitStream',
      icon: Wifi,
      connected: shyft?.rabbit_connected ?? false,
      latencyMs: shyft?.rabbit_age_ms ?? null,
      detail: shyft ? `${(shyft.rabbit_updates ?? 0).toLocaleString()} updates` : '',
    },
    {
      label: 'Blockhash',
      icon: Database,
      connected: blockhash ? blockhash.age_ms < 5000 : false,
      latencyMs: blockhash?.age_ms ?? null,
      detail: blockhash
        ? `slot ${blockhash.slot.toLocaleString()} · ${blockhash.hit_rate} hit · ${blockhash.grpc_active ? 'gRPC' : 'poll'}`
        : '',
    },
    {
      label: 'Meteora SDK',
      icon: Box,
      connected: sidecars?.meteora_sidecar?.status === 'running',
      latencyMs: sidecars?.meteora_sidecar?.response_ms ?? null,
      detail: sidecars?.meteora_sidecar ? `:${sidecars.meteora_sidecar.port}` : '',
    },
    {
      label: 'Orca SDK',
      icon: Hexagon,
      connected: sidecars?.orca_sidecar?.status === 'running',
      latencyMs: sidecars?.orca_sidecar?.response_ms ?? null,
      detail: sidecars?.orca_sidecar ? `:${sidecars.orca_sidecar.port}` : '',
    },
  ]

  const healthyCount = connections.filter(c => c.connected).length
  const total = connections.length
  const badgeVariant = healthyCount === total ? 'green' : healthyCount >= 3 ? 'yellow' : 'red'

  return (
    <WidgetContainer
      id="connection-monitor"
      title="Connections"
      icon={<Radio className="w-4 h-4" />}
      badge={`${healthyCount}/${total}`}
      badgeVariant={badgeVariant}
      noPadding
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-1.5">
        {loading && connections.every(c => !c.connected) ? (
          <div className="flex items-center justify-center h-32 text-white/30 text-[11px]">
            Loading...
          </div>
        ) : (
          connections.map((conn) => {
            const Icon = conn.icon
            return (
              <div
                key={conn.label}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl transition-all',
                  'bg-white/[0.02] border border-white/[0.06]',
                  conn.connected && 'border-accent-cyan/20'
                )}
              >
                {/* Status dot */}
                <StatusDot ok={conn.connected} />

                {/* Icon + label */}
                <div className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center shrink-0',
                  conn.connected ? 'bg-accent-cyan/15 text-accent-cyan' : 'bg-white/5 text-white/30'
                )}>
                  <Icon size={12} />
                </div>
                <div className="w-20 shrink-0">
                  <div className="text-[11px] font-semibold text-white truncate">{conn.label}</div>
                  <div className="text-[8px] text-white/35 truncate">{conn.detail || '—'}</div>
                </div>

                {/* Latency bar */}
                <LatencyBar ms={conn.latencyMs} max={conn.label === 'Blockhash' ? 5000 : 500} />
              </div>
            )
          })
        )}
      </div>
    </WidgetContainer>
  )
}
