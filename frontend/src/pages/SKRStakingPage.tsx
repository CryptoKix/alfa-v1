import { useState, useMemo } from 'react'
import { WidgetGrid } from '@/components/layout'
import { WidgetContainer } from '@/components/widgets/base/WidgetContainer'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setChartPeriod, type ChartPeriod } from '@/features/skr/skrSlice'
import { socketManager } from '@/services/socket/SocketManager'
import { cn, shortenAddress, formatNumber } from '@/lib/utils'
import {
  Lock,
  TrendingUp,
  Activity,
  Trophy,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Helpers ────────────────────────────────────────────────────────────

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const PERIOD_OPTIONS: { label: string; value: ChartPeriod }[] = [
  { label: '4H', value: '4h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
]

// ─── Widget 1: SKR Staking Stats ────────────────────────────────────────

function SKRStatsWidget() {
  const { totalStaked, totalStakers, supplyPctStaked, connected } = useAppSelector(
    (state) => state.skr
  )

  const statItems = [
    {
      label: 'Total Staked',
      value: formatNumber(totalStaked),
      suffix: 'SKR',
      color: 'text-accent-cyan',
      large: true,
    },
    {
      label: 'Stakers',
      value: totalStakers.toLocaleString(),
      icon: <Users className="w-3 h-3" />,
      color: 'text-accent-purple',
    },
    {
      label: '% of Supply',
      value: `${supplyPctStaked}%`,
      color: 'text-accent-pink',
    },
  ]

  return (
    <WidgetContainer
      id="skr-stats"
      title="SKR STAKING"
      icon={<Lock className="w-4 h-4" />}
      badge={connected ? 'Live' : 'Offline'}
      badgeVariant={connected ? 'cyan' : 'red'}
    >
      <div className="flex flex-col gap-3 p-1">
        {statItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted uppercase tracking-wider">
              {item.label}
            </span>
            <div className={cn('flex items-center gap-1.5', item.color)}>
              {item.icon}
              <span
                className={cn(
                  'font-mono font-bold',
                  item.large ? 'text-lg' : 'text-sm'
                )}
              >
                {item.value}
              </span>
              {item.suffix && (
                <span className="text-[10px] text-text-muted">{item.suffix}</span>
              )}
            </div>
          </div>
        ))}

        {/* Connection status */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-accent-cyan' : 'bg-white/30'
            )}
            style={connected ? { boxShadow: '0 0 6px #00ffff' } : {}}
          />
          <span
            className={cn(
              'text-[10px]',
              connected ? 'text-accent-cyan' : 'text-text-muted'
            )}
          >
            {connected ? 'Monitoring active' : 'Not connected'}
          </span>
        </div>
      </div>
    </WidgetContainer>
  )
}

// ─── Widget 2: Net Staked Chart ─────────────────────────────────────────

function SKRChartWidget() {
  const dispatch = useAppDispatch()
  const { snapshots, snapshotsLoading, chartPeriod } = useAppSelector(
    (state) => state.skr
  )

  const chartData = useMemo(
    () =>
      snapshots.map((s) => ({
        timestamp: new Date(s.timestamp).getTime(),
        total_staked: s.total_staked,
        stakers: s.total_stakers,
        net_change: s.net_change_since_last,
      })),
    [snapshots]
  )

  const handlePeriodChange = (period: ChartPeriod) => {
    dispatch(setChartPeriod(period))
    socketManager.emit('skr', 'request_snapshots', { period })
  }

  return (
    <WidgetContainer
      id="skr-chart"
      title="NET STAKED"
      icon={<TrendingUp className="w-4 h-4" />}
      actions={
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                chartPeriod === opt.value
                  ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40'
                  : 'text-text-muted hover:text-white hover:bg-white/[0.06]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      }
      noPadding
    >
      <div className="h-full w-full p-2">
        {snapshotsLoading && snapshots.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-text-muted text-xs">Loading chart data...</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-text-muted text-xs">
              No snapshot data yet. Start the SKR Staking Monitor from Control Panel.
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="skrGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ffff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00ffff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.03)"
              />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(ts) => {
                  const d = new Date(ts)
                  return chartPeriod === '4h' || chartPeriod === '24h'
                    ? d.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
                }}
                tick={{ fill: '#555555', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatNumber(v, 1)}
                tick={{ fill: '#555555', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-background-elevated border border-white/10 rounded-lg px-3 py-2 text-xs shadow-lg">
                      <p className="text-text-muted">
                        {new Date(d.timestamp).toLocaleString()}
                      </p>
                      <p className="text-accent-cyan font-mono font-bold">
                        {formatNumber(d.total_staked)} SKR
                      </p>
                      <p className="text-text-secondary">
                        {d.stakers?.toLocaleString()} stakers
                      </p>
                      {d.net_change !== undefined && d.net_change !== null && (
                        <p
                          className={
                            d.net_change >= 0
                              ? 'text-accent-green'
                              : 'text-accent-red'
                          }
                        >
                          {d.net_change >= 0 ? '+' : ''}
                          {formatNumber(d.net_change)} net
                        </p>
                      )}
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="total_staked"
                stroke="#00ffff"
                strokeWidth={2}
                fill="url(#skrGradient)"
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </WidgetContainer>
  )
}

// ─── Widget 3: Staking Feed ─────────────────────────────────────────────

type EventFilter = 'all' | 'stake' | 'unstake'

function SKREventsWidget() {
  const { events } = useAppSelector((state) => state.skr)
  const [filter, setFilter] = useState<EventFilter>('all')

  const filteredEvents = useMemo(
    () =>
      filter === 'all'
        ? events
        : events.filter((e) => e.event_type === filter),
    [events, filter]
  )

  return (
    <WidgetContainer
      id="skr-events"
      title="STAKING FEED"
      icon={<Activity className="w-4 h-4" />}
      badge={`${events.length}`}
      badgeVariant="cyan"
      actions={
        <div className="flex gap-1">
          {(['all', 'stake', 'unstake'] as EventFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium transition-all capitalize',
                filter === f
                  ? f === 'stake'
                    ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                    : f === 'unstake'
                    ? 'bg-accent-red/20 text-accent-red border border-accent-red/40'
                    : 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40'
                  : 'text-text-muted hover:text-white hover:bg-white/[0.06]'
              )}
            >
              {f === 'all' ? 'All' : f === 'stake' ? 'Stakes' : 'Unstakes'}
            </button>
          ))}
        </div>
      }
      noPadding
    >
      <div className="h-full overflow-y-auto custom-scrollbar">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center p-4">
            <span className="text-text-muted text-xs text-center">
              No staking events yet.
              <br />
              Events will appear here in real-time.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filteredEvents.map((evt, i) => (
              <div
                key={evt.signature || i}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
              >
                {/* Type indicator */}
                <div
                  className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                    evt.event_type === 'stake'
                      ? 'bg-accent-green/10'
                      : 'bg-accent-red/10'
                  )}
                >
                  {evt.event_type === 'stake' ? (
                    <ArrowUpRight className="w-3.5 h-3.5 text-accent-green" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 text-accent-red" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-white truncate">
                      {shortenAddress(evt.wallet_address, 4)}
                    </span>
                    {evt.guardian && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple border border-accent-purple/20 whitespace-nowrap">
                        {evt.guardian}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {evt.block_time ? timeAgo(evt.block_time) : ''}
                  </span>
                </div>

                {/* Amount */}
                <span
                  className={cn(
                    'text-xs font-mono font-bold flex-shrink-0',
                    evt.event_type === 'stake'
                      ? 'text-accent-green'
                      : 'text-accent-red'
                  )}
                >
                  {evt.event_type === 'stake' ? '+' : '-'}
                  {formatNumber(evt.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetContainer>
  )
}

// ─── Widget 4: Whale Leaderboard ────────────────────────────────────────

const RANK_COLORS = ['text-yellow-400', 'text-gray-300', 'text-amber-600']
const RANK_GLOWS = [
  { boxShadow: '0 0 6px rgba(250, 204, 21, 0.4)' },
  { boxShadow: '0 0 6px rgba(209, 213, 219, 0.3)' },
  { boxShadow: '0 0 6px rgba(217, 119, 6, 0.3)' },
]

function SKRWhalesWidget() {
  const { whales, whalesLoading } = useAppSelector((state) => state.skr)

  return (
    <WidgetContainer
      id="skr-whales"
      title="WHALE VIEW"
      icon={<Trophy className="w-4 h-4" />}
      badge={`Top ${whales.length}`}
      badgeVariant="purple"
      noPadding
    >
      <div className="h-full overflow-y-auto custom-scrollbar">
        {whalesLoading && whales.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-text-muted text-xs">Loading leaderboard...</span>
          </div>
        ) : whales.length === 0 ? (
          <div className="h-full flex items-center justify-center p-4">
            <span className="text-text-muted text-xs text-center">
              No whale data yet.
              <br />
              Start the monitor to begin tracking.
            </span>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-background-card">
                <th className="text-[9px] text-text-muted font-medium uppercase tracking-wider text-left px-3 py-2">
                  #
                </th>
                <th className="text-[9px] text-text-muted font-medium uppercase tracking-wider text-left py-2">
                  Wallet
                </th>
                <th className="text-[9px] text-text-muted font-medium uppercase tracking-wider text-right py-2">
                  Net Staked
                </th>
                <th className="text-[9px] text-text-muted font-medium uppercase tracking-wider text-right py-2 hidden sm:table-cell">
                  Events
                </th>
                <th className="text-[9px] text-text-muted font-medium uppercase tracking-wider text-right px-3 py-2 hidden md:table-cell">
                  Last Active
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {whales.map((whale, i) => (
                <tr
                  key={whale.wallet_address}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  {/* Rank */}
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'text-xs font-bold',
                        i < 3 ? RANK_COLORS[i] : 'text-text-muted'
                      )}
                      style={i < 3 ? RANK_GLOWS[i] : undefined}
                    >
                      {i + 1}
                    </span>
                  </td>

                  {/* Wallet */}
                  <td className="py-2">
                    <a
                      href={`https://solscan.io/account/${whale.wallet_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] font-mono text-white hover:text-accent-cyan transition-colors group"
                    >
                      {whale.display_name || shortenAddress(whale.wallet_address, 4)}
                      <ExternalLink className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  </td>

                  {/* Net Staked */}
                  <td className="py-2 text-right">
                    <span className="text-xs font-mono font-bold text-accent-cyan">
                      {formatNumber(whale.net_staked)}
                    </span>
                  </td>

                  {/* Event count */}
                  <td className="py-2 text-right hidden sm:table-cell">
                    <span className="text-[11px] text-text-secondary">
                      {whale.event_count}
                    </span>
                  </td>

                  {/* Last active */}
                  <td className="px-3 py-2 text-right hidden md:table-cell">
                    <span className="text-[10px] text-text-muted">
                      {whale.last_activity ? timeAgo(whale.last_activity) : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </WidgetContainer>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function SKRStakingPage() {
  return (
    <WidgetGrid page="skr">
      <div key="skr-stats">
        <SKRStatsWidget />
      </div>
      <div key="skr-chart">
        <SKRChartWidget />
      </div>
      <div key="skr-events">
        <SKREventsWidget />
      </div>
      <div key="skr-whales">
        <SKRWhalesWidget />
      </div>
    </WidgetGrid>
  )
}
