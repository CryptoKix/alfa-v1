import React, { useState } from 'react'
import { Newspaper, TrendingUp, TrendingDown, Zap, Clock, ExternalLink, Twitter, Filter } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { cn } from '@/lib/utils'

const NewsPage: React.FC = () => {
  const { news } = useAppSelector(state => state.intel)
  const [filter, setFilter] = useState<'all' | 'news' | 'social'>('all')

  const filteredNews = news.filter(item => {
    if (filter === 'all') return true
    return item.type === filter
  })

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
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Newspaper className="text-accent-purple" size={24} />
            TACTIX INTELLIGENCE
          </h1>
          <p className="text-xs text-text-muted">High-frequency fundamental stream & social signals</p>
        </div>
        
        {/* Filter Controls */}
        <div className="flex bg-background-card border border-white/5 rounded-xl p-1 gap-1">
          <button 
            onClick={() => setFilter('all')}
            className={cn(
              "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
              filter === 'all' ? "bg-white/10 text-white shadow-glow-white" : "text-text-muted hover:text-white"
            )}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('news')}
            className={cn(
              "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-2",
              filter === 'news' ? "bg-accent-purple/20 text-accent-purple border border-accent-purple/20" : "text-text-muted hover:text-white"
            )}
          >
            <Newspaper size={12} />
            News
          </button>
          <button 
            onClick={() => setFilter('social')}
            className={cn(
              "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-2",
              filter === 'social' ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/20" : "text-text-muted hover:text-white"
            )}
          >
            <Twitter size={12} />
            Social
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {filteredNews.length === 0 ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-text-muted opacity-50 italic border border-white/5 rounded-2xl bg-background-card">
              <Filter size={48} strokeWidth={1} className="mb-4" />
              <span className="text-sm uppercase tracking-widest">No signals found for filter: {filter}</span>
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