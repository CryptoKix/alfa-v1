import { useMemo, useState, useEffect, useRef } from 'react'
import { useAppSelector } from '@/app/hooks'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const COLORS = ['#00ffff', '#ff0080', '#9945FF', '#00ff9d', '#ffaa00', '#ffffff']

export const PortfolioWidget = () => {
  const { holdings, holdings24hAgo, totalUsd, totalUsd24hAgo } = useAppSelector(state => state.portfolio)
  const prices = useAppSelector(state => state.prices.prices)
  
  // Calculate live values - Memoized to prevent unnecessary re-calcs on other state changes
  const liveHoldings = useMemo(() => {
    return holdings.map(h => {
      const currentPrice = prices[h.mint] || h.price
      const baseline = holdings24hAgo.find(bh => bh.mint === h.mint)
      const pnl24h = (h.balance * currentPrice) - (baseline ? baseline.balance * (baseline.price || currentPrice) : (h.balance * currentPrice))
      
      return {
        ...h,
        currentPrice,
        liveValue: h.balance * currentPrice,
        pnl24h
      }
    }).sort((a, b) => b.liveValue - a.liveValue)
  }, [holdings, prices, holdings24hAgo])

  const liveTotal = useMemo(() => {
    return liveHoldings.reduce((acc, h) => acc + h.liveValue, 0) || totalUsd
  }, [liveHoldings, totalUsd])

  // PnL Calculations
  const pnl24h = liveTotal - (totalUsd24hAgo || liveTotal)
  const pnlPct24h = totalUsd24hAgo > 0 ? (pnl24h / totalUsd24hAgo) * 100 : 0
  const isProfitTotal = pnl24h >= 0

  // Throttle chart data to update max once every 2 seconds to improve performance
  const [chartData, setChartData] = useState(liveHoldings)
  const liveHoldingsRef = useRef(liveHoldings)
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    liveHoldingsRef.current = liveHoldings
    // If this is the first time we get real data, set it immediately
    if (!hasInitializedRef.current && liveHoldings.length > 0) {
        setChartData(liveHoldings)
        hasInitializedRef.current = true
    }
  }, [liveHoldings])

  useEffect(() => {
    const timer = setInterval(() => {
        if (liveHoldingsRef.current.length > 0) {
            setChartData(liveHoldingsRef.current)
        }
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="bg-background-card border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden group flex flex-col h-full">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-cyan via-accent-purple to-accent-pink opacity-50" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2 border-b border-white/5 shrink-0 h-[55px]">
        <h3 className="text-base font-bold flex items-center gap-2 shrink-0">
          <Wallet className="text-accent-purple" size={18} />
          Portfolio Snapshot
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="text-[9px] text-accent-cyan/70 uppercase tracking-[0.2em]">Value</div>
            <div className="text-xl font-black font-mono text-accent-cyan tracking-tight">
              ${liveTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className={cn(
            "text-[10px] font-bold font-mono flex items-center gap-1",
            isProfitTotal ? "text-accent-green" : "text-accent-red"
          )}>
            {isProfitTotal ? '+' : ''}${Math.abs(pnl24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="opacity-80">({isProfitTotal ? '+' : ''}{pnlPct24h.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
        {/* Table Section (Left) - Sized for ~6 rows */}
        <div className="flex-1 overflow-auto custom-scrollbar pr-2 min-h-0">
          {/* Table Header */}
          <div className="grid grid-cols-5 gap-4 px-2 pb-2 text-[9px] font-bold text-text-secondary uppercase tracking-wider shrink-0 sticky top-0 bg-background-card z-10">
            <div className="pl-1">Asset</div>
            <div>Price</div>
            <div>Balance</div>
            <div>24H CHG</div>
            <div>Value</div>
          </div>

          <div className="space-y-1">
              {liveHoldings.map((token, i) => {
                const isProfitToken = (token.pnl24h || 0) >= 0
                return (
                  <div key={token.mint} className="grid grid-cols-5 gap-4 items-center p-2 rounded-lg bg-background-elevated/30 border border-white/5 hover:border-white/10 transition-colors group text-[11px] font-mono">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-4 rounded-full transition-all group-hover:h-3" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <img 
                          src={token.logoURI || 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png'}
                          alt={token.symbol}
                          className="w-4 h-4 rounded-full shrink-0"
                          onError={(e) => (e.currentTarget.src = 'https://static.jup.ag/tokens/gen/So11111111111111111111111111111111111111112.png')}
                        />
                        <div className="font-bold text-white truncate">{token.symbol}</div>
                    </div>
                    <div className="text-left text-text-secondary">
                      ${token.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-left text-text-secondary">
                      {token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </div>
                    <div className={cn("text-left font-bold", isProfitToken ? "text-accent-green" : "text-accent-red")}>
                      {token.pnl24h !== 0 ? (
                        <>
                          {isProfitToken ? '+' : ''}${Math.abs(token.pnl24h || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </>
                      ) : (
                        <span className="text-text-muted">---</span>
                      )}
                    </div>
                    <div className="text-left font-bold text-white">
                      ${token.liveValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )
              })}
          </div>
          
          {liveHoldings.length === 0 && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted gap-2 opacity-50 pointer-events-none">
               <Wallet size={24} />
               <span className="text-xs italic tracking-widest uppercase">No assets detected</span>
             </div>
          )}
        </div>

        {/* Chart Section (Right) */}
        <div className="h-full w-full lg:w-[240px] relative shrink-0 flex flex-col items-center justify-center">
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mb-4 w-full text-center absolute top-2">Allocation</div>
          <div className="w-[220px] h-[220px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70} 
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="liveValue"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.mint} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#12121a', borderColor: '#2a2a3a', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number | undefined) => ['$' + (value?.toLocaleString() ?? '0'), 'Value']}
                />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-1">
               <span className="text-[10px] text-text-muted uppercase tracking-tighter leading-none">TOKENS</span>
               <span className="text-2xl font-black text-white leading-none mt-1">{liveHoldings.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
