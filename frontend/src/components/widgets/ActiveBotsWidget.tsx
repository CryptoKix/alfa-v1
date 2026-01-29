import { useState } from 'react'
import { Activity, Pause, Play, Trash2, ChevronRight, Bot, Eye } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { WidgetContainer } from './base/WidgetContainer'
import { BotDetailsModal } from '../modals/BotDetailsModal'

export const ActiveBotsWidget = ({ onViewAll }: { onViewAll?: () => void }) => {
  const { bots } = useAppSelector((state) => state.bots)
  const runningBots = bots.filter((b) => b && b.status !== 'deleted' && b.status !== 'completed')
  const [selectedBot, setSelectedBot] = useState<any | null>(null)

  const handlePauseBot = async (e: React.MouseEvent, id: string, currentStatus: string) => {
    e.stopPropagation()
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active'
      await fetch('/api/dca/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
    } catch (e) {
      console.error('Failed to toggle bot status', e)
    }
  }

  const handleDeleteBot = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to terminate this strategy?')) return
    try {
      await fetch('/api/dca/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch (e) {
      console.error('Failed to delete bot', e)
    }
  }

  const handleBotClick = (bot: any) => {
    setSelectedBot(bot)
  }

  const getTypeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'GRID':
        return 'bg-accent-purple/20 text-accent-purple'
      case 'DCA':
        return 'bg-accent-cyan/20 text-accent-cyan'
      case 'TWAP':
        return 'bg-accent-pink/20 text-accent-pink'
      case 'VWAP':
        return 'bg-accent-green/20 text-accent-green'
      default:
        return 'bg-white/10 text-white/70'
    }
  }

  return (
    <WidgetContainer
      id="active-bots"
      title="Active Bots"
      icon={<Activity className="w-4 h-4" />}
      badge={runningBots.length > 0 ? `${runningBots.length} running` : undefined}
      badgeVariant="green"
      actions={
        onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[10px] uppercase tracking-wider text-white/40 hover:text-accent-cyan transition-colors font-semibold"
          >
            View All
          </button>
        )
      }
      noPadding
    >
      {/* Table Header */}
      <div className="grid grid-cols-[1fr_80px_70px_70px] gap-3 px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-[10px] text-white/40 uppercase tracking-wider font-bold shrink-0">
        <div>Strategy</div>
        <div>Progress</div>
        <div className="text-right">PnL</div>
        <div className="text-right"></div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto glass-scrollbar">
        {runningBots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <Bot size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">No active bots</span>
            <span className="text-[10px] text-white/20 mt-1">Launch a strategy to begin</span>
          </div>
        ) : (
          runningBots.map((bot, index) => {
            const isActive = bot.status === 'active'
            const isGrid = bot.type?.toUpperCase() === 'GRID'
            const profit = bot.profit_realized || 0
            const isProfit = profit >= 0

            return (
              <div key={bot.id} className="flex flex-col">
                <div
                  onClick={() => handleBotClick(bot)}
                  className={cn(
                    'grid grid-cols-[1fr_80px_70px_70px] gap-3 px-4 py-3 items-center group transition-all cursor-pointer',
                    'hover:bg-white/[0.03] border-l-2 border-l-transparent hover:border-l-accent-cyan/50',
                    index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'
                  )}
                >
                  {/* Strategy */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full absolute -top-0.5 -right-0.5',
                          isActive ? 'bg-accent-green animate-pulse' : 'bg-yellow-500'
                        )}
                      />
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold',
                          getTypeColor(bot.type || '')
                        )}
                      >
                        {bot.type?.slice(0, 2) || 'N/A'}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-white truncate">
                          {bot.alias || `${bot.input_symbol}/${bot.output_symbol}`}
                        </p>
                        <Eye size={12} className="text-white/20 group-hover:text-accent-cyan shrink-0 transition-colors" />
                      </div>
                      <p className="text-[10px] text-white/40">
                        {isGrid && bot.lower_bound && bot.upper_bound
                          ? `$${bot.lower_bound} - $${bot.upper_bound}`
                          : bot.amount
                          ? `${bot.amount.toLocaleString()} ${bot.input_symbol}`
                          : bot.type}
                      </p>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="text-[11px] font-mono text-white/60">
                    {bot.run_count || 0}
                    {(bot.type === 'TWAP' || bot.type === 'DCA') && bot.max_runs && (
                      <span className="text-white/30">/{bot.max_runs}</span>
                    )}
                    <span className="text-white/30 ml-1">runs</span>
                  </div>

                  {/* PnL */}
                  <div className="text-right">
                    <span
                      className={cn(
                        'text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded',
                        isProfit ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'
                      )}
                    >
                      {isProfit ? '+' : ''}${Math.abs(profit).toFixed(2)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={(e) => handlePauseBot(e, bot.id, bot.status)}
                      className={cn(
                        'p-1.5 rounded transition-colors',
                        isActive
                          ? 'text-white/40 hover:text-yellow-500 hover:bg-yellow-500/10'
                          : 'text-white/40 hover:text-accent-green hover:bg-accent-green/10'
                      )}
                      title={isActive ? 'Pause' : 'Resume'}
                    >
                      {isActive ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                      onClick={(e) => handleDeleteBot(e, bot.id)}
                      className="p-1.5 rounded text-white/40 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                      title="Stop"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Bot Details Modal */}
      {selectedBot && (
        <BotDetailsModal
          bot={selectedBot}
          onClose={() => setSelectedBot(null)}
        />
      )}
    </WidgetContainer>
  )
}
