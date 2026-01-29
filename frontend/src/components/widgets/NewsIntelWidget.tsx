import React from 'react'
import { Newspaper, ExternalLink, Zap, TrendingUp, TrendingDown, Clock, Bitcoin, BarChart3, Globe, DollarSign } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import type { NewsCategory } from '@/features/intel/intelSlice'

export const NewsIntelWidget: React.FC = () => {
  const { news } = useAppSelector(state => state.intel)

  const getSentimentStyles = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
      case 'bearish': return 'bg-accent-pink/10 text-accent-pink border-accent-pink/30'
      case 'urgent': return 'bg-accent-purple/20 text-accent-purple border-accent-purple/40 animate-pulse'
      default: return 'bg-white/5 text-text-muted border-white/10'
    }
  }

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return <TrendingUp size={10} />
      case 'bearish': return <TrendingDown size={10} />
      case 'urgent': return <Zap size={10} />
      default: return <Clock size={10} />
    }
  }

  const getCategoryIcon = (category: NewsCategory) => {
    switch (category) {
      case 'crypto': return <Bitcoin size={8} className="text-accent-cyan" />
      case 'stocks': return <BarChart3 size={8} className="text-green-400" />
      case 'forex': return <Globe size={8} className="text-yellow-400" />
      case 'macro': return <DollarSign size={8} className="text-accent-purple" />
      default: return null
    }
  }

  return (
    <div className="bg-background-card border border-white/5 rounded-2xl p-6 shadow-xl h-full flex flex-col relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-purple via-accent-cyan to-accent-pink opacity-50 z-20" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2 border-b border-white/5 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
        <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-white">
          <Newspaper className="text-accent-purple" size={18} />
          Tactix Intel <span className="text-[10px] text-text-muted font-normal">/ Fundamentals</span>
        </h3>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
          <span className="text-[9px] text-accent-cyan font-black uppercase tracking-widest">Live Stream</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar pr-2 -mr-2 space-y-2 mt-2">
        {news.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50 italic">
            <Newspaper size={24} strokeWidth={1} className="mb-2" />
            <span className="text-[10px] uppercase tracking-widest">Aggregating Intel...</span>
          </div>
        ) : (
          news.map((item) => (
            <div 
              key={item.id} 
              className={cn(
                "p-3 rounded-xl border transition-all duration-300 relative overflow-hidden group/item",
                item.is_relevant 
                  ? "bg-accent-cyan/[0.03] border-accent-cyan/20 ring-1 ring-accent-cyan/10" 
                  : "bg-white/[0.02] border-white/5 hover:border-white/10"
              )}
            >
              {item.is_relevant && (
                <div className="absolute top-0 left-0 w-1 h-full bg-accent-cyan" />
              )}
              
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.category && (
                        <span className="p-1 rounded bg-white/5">
                          {getCategoryIcon(item.category)}
                        </span>
                      )}
                      <span className={cn(
                        "px-1.5 py-0.5 rounded border text-[8px] font-black uppercase flex items-center gap-1",
                        getSentimentStyles(item.sentiment)
                      )}>
                        {getSentimentIcon(item.sentiment)}
                        {item.sentiment}
                      </span>
                      {item.is_relevant && (
                        <span className="px-1.5 py-0.5 rounded bg-accent-cyan text-black text-[8px] font-black uppercase shadow-glow-cyan">
                          Portfolio Match
                        </span>
                      )}
                      <span className="text-[8px] text-text-muted font-bold uppercase tracking-tighter truncate max-w-[80px]">
                        {item.source}
                      </span>
                    </div>
                    <h4 className="text-[11px] font-bold text-white/90 leading-relaxed group-hover/item:text-accent-cyan transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                    {/* Ticker chips for stock news */}
                    {item.tickers && item.tickers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tickers.slice(0, 3).map(ticker => (
                          <span
                            key={ticker}
                            className="px-1 py-0.5 rounded bg-green-500/10 text-green-400 text-[7px] font-black"
                          >
                            ${ticker}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-text-muted hover:text-white transition-colors mt-1 shrink-0"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {item.currencies?.slice(0, 3).map(cur => (
                      <span key={cur} className="text-[8px] font-black text-accent-cyan/70 uppercase">#{cur}</span>
                    ))}
                  </div>
                  <span className="text-[8px] text-text-muted font-mono">
                    {(() => {
                      try {
                        return item.published_at ? new Date(item.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'
                      } catch (e) {
                        return 'recently'
                      }
                    })()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
