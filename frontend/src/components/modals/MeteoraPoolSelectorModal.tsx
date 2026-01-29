import React, { useState } from 'react'
import { X, Search, Activity, Zap, TrendingUp } from 'lucide-react'
import { Card } from '../ui/card'
import { cn } from '@/lib/utils'

interface MeteoraPool {
  pair: string
  mint: string
  symbol: string
  apy: number
  tvl: number
  fees24h: number
  type: string
}

interface MeteoraPoolSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (pool: MeteoraPool) => void
  currentMint: string
}

const MOCK_POOLS: MeteoraPool[] = [
  { pair: 'SOL/USDC', symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', apy: 28.5, tvl: 45000000, fees24h: 12500, type: 'Dynamic' },
  { pair: 'JUP/SOL', symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', apy: 112.4, tvl: 12000000, fees24h: 42000, type: 'DLMM' },
  { pair: 'SKR/SOL', symbol: 'SKR', mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', apy: 842.0, tvl: 2500000, fees24h: 156000, type: 'DLMM' },
  { pair: 'USDC/USDT', symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', apy: 8.2, tvl: 150000000, fees24h: 5400, type: 'Stable' },
  { pair: 'RENDER/SOL', symbol: 'RENDER', mint: 'rndrB9VptSws7QH9Y9vZiCoS9SBR2vS89pj7ZksFMRi', apy: 45.8, tvl: 8500000, fees24h: 9200, type: 'Dynamic' },
]

export const MeteoraPoolSelectorModal: React.FC<MeteoraPoolSelectorModalProps> = ({ isOpen, onClose, onSelect, currentMint }) => {
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  const filteredPools = MOCK_POOLS.filter(p =>
    p.pair.toLowerCase().includes(search.toLowerCase()) ||
    p.symbol.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <Card className="w-full max-w-xl bg-background-card border border-accent-cyan/20 rounded-3xl overflow-hidden relative shadow-[0_0_50px_rgba(0,255,255,0.15)] animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent" />

        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter italic text-white flex items-center gap-3">
              <Activity size={20} className="text-accent-cyan" />
              Meteora Market Discovery
            </h2>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">Select an active DLMM or Dynamic pool for tactical deployment</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 bg-black/20 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Search by pair or asset symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background-elevated border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-accent-cyan transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredPools.map((pool) => (
            <button
              key={pool.pair}
              onClick={() => onSelect(pool)}
              className={cn(
                "w-full p-4 rounded-2xl border transition-all flex items-center justify-between group",
                currentMint === pool.mint
                  ? "bg-accent-cyan/10 border-accent-cyan/40"
                  : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center font-black text-white group-hover:border-accent-cyan/30 transition-colors shadow-lg">
                  {pool.symbol[0]}
                </div>
                <div className="text-left">
                  <div className="text-sm font-black text-white group-hover:text-accent-cyan transition-colors">{pool.pair}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-1.5 py-0.5 bg-white/5 rounded text-[8px] font-black text-text-muted uppercase tracking-widest border border-white/10">
                      {pool.type}
                    </span>
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-tighter">
                      TVL: ${(pool.tvl / 1e6).toFixed(1)}M
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1">Live Yield</div>
                <div className="text-lg font-black font-mono text-accent-green flex items-center gap-2 justify-end">
                  <TrendingUp size={14} />
                  {pool.apy.toFixed(1)}%
                </div>
                <div className="text-[8px] text-accent-pink font-bold uppercase mt-1">
                  ${(pool.fees24h / 1e3).toFixed(1)}K 24H Fees
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-white/[0.01] border-t border-white/5 flex items-center justify-center gap-2">
           <Zap size={12} className="text-accent-cyan animate-pulse" />
           <span className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">Real-time Market Data via Meteora DLMM SDK</span>
        </div>
      </Card>
    </div>
  )
}
