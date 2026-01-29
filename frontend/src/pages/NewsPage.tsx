import React, { useState } from 'react'
import { Newspaper, TrendingUp, TrendingDown, Zap, Clock, ExternalLink, Twitter, Filter, Bitcoin, DollarSign, Globe, BarChart3 } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'
import type { NewsCategory } from '@/features/intel/intelSlice'

type CategoryFilter = 'all' | 'crypto' | 'tradfi'
type TypeFilter = 'all' | 'news' | 'social'

const NewsPage: React.FC = () => {
  const { news } = useAppSelector(state => state.intel)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const filteredNews = news.filter(item => {
    // Type filter
    if (typeFilter !== 'all' && item.type !== typeFilter) return false

    // Category filter
    if (categoryFilter === 'crypto') return item.category === 'crypto'
    if (categoryFilter === 'tradfi') return ['stocks', 'forex', 'macro'].includes(item.category)

    return true
  })

  const getCategoryStyles = (category: NewsCategory) => {
    switch (category) {
      case 'crypto': return 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
      case 'stocks': return 'bg-green-500/10 text-green-400 border-green-500/30'
      case 'forex': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
      case 'macro': return 'bg-accent-purple/10 text-accent-purple border-accent-purple/30'
      default: return 'bg-white/5 text-text-muted border-white/10'
    }
  }

  const getCategoryIcon = (category: NewsCategory) => {
    switch (category) {
      case 'crypto': return <Bitcoin size={10} />
      case 'stocks': return <BarChart3 size={10} />
      case 'forex': return <Globe size={10} />
      case 'macro': return <DollarSign size={10} />
      default: return <Newspaper size={10} />
    }
  }

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
      case 'bullish': return <TrendingUp size={12} />
      case 'bearish': return <TrendingDown size={12} />
      case 'urgent': return <Zap size={12} />
      default: return <Clock size={12} />
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 items-center gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Newspaper className="text-accent-purple" size={24} />
            TACTIX INTELLIGENCE
          </h1>
        </div>
        
        {/* Center Filter Controls */}
        <div className="flex justify-center gap-2">
          {/* Category Filter */}
          <div className="flex bg-background-card border border-white/5 rounded-xl p-1 gap-1">
            <button
              onClick={() => setCategoryFilter('all')}
              className={cn(
                "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                categoryFilter === 'all' ? "bg-white/10 text-white shadow-glow-white" : "text-text-muted hover:text-white"
              )}
            >
              All
            </button>
            <button
              onClick={() => setCategoryFilter('crypto')}
              className={cn(
                "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-2",
                categoryFilter === 'crypto' ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/20" : "text-text-muted hover:text-white"
              )}
            >
              <Bitcoin size={12} />
              Crypto
            </button>
            <button
              onClick={() => setCategoryFilter('tradfi')}
              className={cn(
                "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-2",
                categoryFilter === 'tradfi' ? "bg-green-500/20 text-green-400 border border-green-500/20" : "text-text-muted hover:text-white"
              )}
            >
              <DollarSign size={12} />
              TradFi
            </button>
          </div>

          {/* Type Filter */}
          <div className="flex bg-background-card border border-white/5 rounded-xl p-1 gap-1">
            <button
              onClick={() => setTypeFilter('all')}
              className={cn(
                "px-2 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                typeFilter === 'all' ? "bg-white/10 text-white" : "text-text-muted hover:text-white"
              )}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('news')}
              className={cn(
                "px-2 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-1",
                typeFilter === 'news' ? "bg-accent-purple/20 text-accent-purple" : "text-text-muted hover:text-white"
              )}
            >
              <Newspaper size={10} />
            </button>
            <button
              onClick={() => setTypeFilter('social')}
              className={cn(
                "px-2 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-1",
                typeFilter === 'social' ? "bg-accent-cyan/20 text-accent-cyan" : "text-text-muted hover:text-white"
              )}
            >
              <Twitter size={10} />
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="flex items-center gap-2 bg-accent-cyan/5 border border-accent-cyan/20 px-3 py-1.5 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
            <span className="text-[10px] font-black text-accent-cyan uppercase tracking-widest">Global Feed Active</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {filteredNews.length === 0 ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-text-muted opacity-50 italic border border-white/5 rounded-2xl bg-background-card">
              <Filter size={48} strokeWidth={1} className="mb-4" />
              <span className="text-sm uppercase tracking-widest">
                No signals found for {categoryFilter !== 'all' ? categoryFilter : ''} {typeFilter !== 'all' ? typeFilter : 'selected filters'}
              </span>
            </div>
          ) : (
            filteredNews.map((item) => (
              <div 
                key={item.id} 
                className={cn(
                  "bg-background-card border rounded-2xl p-5 transition-all duration-300 relative overflow-hidden group flex flex-col gap-4",
                  item.is_relevant 
                    ? "border-accent-cyan/30 shadow-[0_0_20px_rgba(0,255,255,0.05)] ring-1 ring-accent-cyan/10" 
                    : "border-white/5 hover:border-white/15 hover:shadow-xl"
                )}
              >
                {item.is_relevant && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-accent-cyan" />
                )}
                
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "p-1 rounded bg-white/5",
                        item.type === 'social' ? "text-accent-cyan" : "text-accent-purple"
                      )}>
                        {item.type === 'social' ? <Twitter size={12} /> : <Newspaper size={12} />}
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded border text-[9px] font-black uppercase flex items-center gap-1.5",
                        getCategoryStyles(item.category)
                      )}>
                        {getCategoryIcon(item.category)}
                        {item.category}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 rounded border text-[9px] font-black uppercase flex items-center gap-1.5",
                        getSentimentStyles(item.sentiment)
                      )}>
                        {getSentimentIcon(item.sentiment)}
                        {item.sentiment}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-tighter truncate max-w-[120px]">
                      {item.source}
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-white leading-relaxed group-hover:text-accent-cyan transition-colors">
                    {item.title}
                  </h3>

                  {/* Ticker chips for stock news */}
                  {item.tickers && item.tickers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tickers.map(ticker => (
                        <span
                          key={ticker}
                          className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[9px] font-black"
                        >
                          ${ticker}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                  <div className="flex gap-2">
                    {item.is_relevant && (
                      <span className="px-2 py-0.5 rounded bg-accent-cyan text-black text-[9px] font-black uppercase shadow-glow-cyan">
                        Portfolio Match
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-text-muted font-mono">
                      {(() => {
                        try {
                          return item.published_at ? new Date(item.published_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'recently'
                        } catch (e) {
                          return 'recently'
                        }
                      })()}
                    </span>
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-text-secondary hover:text-white transition-all border border-white/5"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default NewsPage