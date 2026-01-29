import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Play, Pause, Trash2, Eye } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import { WidgetContainer } from '../base/WidgetContainer'
import { BotDetailsModal } from '../../modals/BotDetailsModal'
import axios from 'axios'

const strategyColors: Record<string, string> = {
  grid: 'bg-accent-purple/10 text-accent-purple',
  dca: 'bg-accent-cyan/10 text-accent-cyan',
  twap: 'bg-accent-pink/10 text-accent-pink',
  vwap: 'bg-accent-green/10 text-accent-green',
}

export function ActiveBotsWidget() {
  const { bots } = useAppSelector((state) => state.bots)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedBot, setSelectedBot] = useState<any | null>(null)

  const activeBots = bots.filter((b) => b.status === 'running' || b.status === 'paused')

  const handleBotClick = (bot: any) => {
    setSelectedBot(bot)
  }
  const runningCount = activeBots.filter((b) => b.status === 'running').length
  const totalProfit = bots.reduce((sum, b) => sum + (b.profit_realized || 0), 0)
  const isProfit = totalProfit >= 0

  const handleAction = async (e: React.MouseEvent, botId: string, action: 'pause' | 'resume' | 'stop') => {
    e.stopPropagation()
    setActionLoading(botId)
    try {
      await axios.post(`/api/dca/${action}/${botId}`)
    } catch (err) {
      console.error(`Failed to ${action} bot:`, err)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <WidgetContainer
      id="active-bots"
      title="Active Bots"
      icon={<Bot className="w-4 h-4" />}
      noPadding
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-white/40">Total:</span>
            <span className="font-mono font-semibold text-white">{bots.length}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-white/40">Running:</span>
            <span className="font-mono font-semibold text-accent-green">{runningCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-white/40">PnL:</span>
            <span className={cn('font-mono font-semibold', isProfit ? 'text-accent-green' : 'text-accent-red')}>
              {isProfit ? '+' : ''}${Math.abs(totalProfit).toFixed(2)}
            </span>
          </div>
        </div>
      }
    >
      <div className="flex-1 overflow-auto glass-scrollbar min-h-0 p-3 space-y-2">
        {/* Table Header */}
        <div className="grid grid-cols-[45px_1fr_90px_70px_70px_60px] gap-3 px-3 py-1.5 items-center text-[10px] text-white/40 uppercase tracking-wider font-bold border border-transparent rounded-xl">
          <div className="-ml-1">Type</div>
          <div>Name</div>
          <div>Pair</div>
          <div>Progress</div>
          <div>PnL</div>
          <div></div>
        </div>

        {bots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/30">
            <Bot size={24} strokeWidth={1} className="mb-2 opacity-50" />
            <span className="text-xs">No bots configured</span>
          </div>
        ) : (
          bots.map((bot) => {
            const isRunning = bot.status === 'running'
            const isPaused = bot.status === 'paused'
            const profit = bot.profit_realized || 0
            const botIsProfit = profit >= 0

            return (
              <div
                key={bot.id}
                onClick={() => handleBotClick(bot)}
                className={cn(
                  'grid grid-cols-[45px_1fr_90px_70px_70px_60px] gap-3 px-3 py-1.5 items-center group transition-all cursor-pointer',
                  'bg-white/[0.02] border border-white/[0.06] rounded-xl',
                  'hover:bg-white/[0.04] hover:border-accent-cyan/30'
                )}
              >
                {/* Type */}
                <div className="-ml-1 flex items-center">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded leading-none uppercase', strategyColors[bot.type] || 'bg-white/10 text-white/70')}>
                    {bot.type?.slice(0, 4) || 'Bot'}
                  </span>
                </div>

                {/* Name */}
                <div className="text-[12px] font-semibold text-white truncate flex items-center gap-1.5">
                  <span>{bot.alias || `${bot.type?.toUpperCase()} Bot`}</span>
                  <Eye size={10} className="text-white/20 group-hover:text-accent-cyan shrink-0 transition-colors" />
                </div>

                {/* Pair */}
                <div className="text-[12px] font-mono text-white/70 truncate">
                  {bot.input_symbol}/{bot.output_symbol}
                </div>

                {/* Progress */}
                <div className="text-[12px] font-mono text-white/50">
                  {bot.run_count || 0}
                  {bot.max_runs && <span className="text-white/30">/{bot.max_runs}</span>}
                </div>

                {/* PnL */}
                <div className="-ml-2">
                  <span className={cn(
                    'inline-block text-[10px] font-bold px-1.5 py-0.5 rounded leading-none',
                    botIsProfit ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'
                  )}>
                    {botIsProfit ? '+' : ''}${Math.abs(profit).toFixed(2)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isRunning ? (
                    <button
                      onClick={(e) => handleAction(e, bot.id, 'pause')}
                      disabled={actionLoading === bot.id}
                      className="p-1 rounded text-white/40 hover:text-yellow-500 hover:bg-yellow-500/10 transition-colors"
                      title="Pause"
                    >
                      <Pause size={14} />
                    </button>
                  ) : isPaused ? (
                    <button
                      onClick={(e) => handleAction(e, bot.id, 'resume')}
                      disabled={actionLoading === bot.id}
                      className="p-1 rounded text-white/40 hover:text-accent-green hover:bg-accent-green/10 transition-colors"
                      title="Resume"
                    >
                      <Play size={14} />
                    </button>
                  ) : null}
                  <button
                    onClick={(e) => handleAction(e, bot.id, 'stop')}
                    disabled={actionLoading === bot.id}
                    className="p-1 rounded text-white/40 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                    title="Stop"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Bot Details Modal - rendered via portal to escape widget container */}
      {selectedBot && createPortal(
        <BotDetailsModal
          bot={selectedBot}
          onClose={() => setSelectedBot(null)}
        />,
        document.body
      )}
    </WidgetContainer>
  )
}
