import React, { useState, useEffect } from 'react'
import { Terminal, ShieldCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogEntry {
  id: string
  timestamp: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export const SeekerLogsWidget: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: '10:42:01', type: 'info', message: 'HFA-ENCLAVE initialized' },
    { id: '2', timestamp: '10:42:05', type: 'success', message: 'Handshake with Tactix Terminal established' },
    { id: '3', timestamp: '10:45:12', type: 'info', message: 'Syncing encrypted keystore...' },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      const types: ('info' | 'success' | 'warning' | 'error')[] = ['info', 'success', 'warning']
      const messages = [
        'Telemetry heartbeat sent',
        'Encryption keys rotated',
        'Secure channel ping: 12ms',
        'Background sync complete',
        'Signal strength optimized'
      ]

      const newLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        type: types[Math.floor(Math.random() * types.length)],
        message: messages[Math.floor(Math.random() * messages.length)]
      }

      setLogs(prev => [newLog, ...prev].slice(0, 10))
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-accent-cyan" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Enclave Logs</span>
        </div>
        <div className="flex items-center gap-1.5">
           <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
           <span className="text-[8px] font-bold text-accent-cyan uppercase">Live Feed</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {logs.map((log) => (
          <div key={log.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex gap-3 group hover:border-white/10 transition-all">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-1 h-1 rounded-full mt-1.5",
                log.type === 'info' && "bg-accent-cyan",
                log.type === 'success' && "bg-accent-green",
                log.type === 'warning' && "bg-accent-pink",
                log.type === 'error' && "bg-red-500"
              )} />
            </div>
            <div className="flex-1 min-w-0">
               <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[8px] font-mono text-text-muted">{log.timestamp}</span>
                  {log.type === 'success' && <ShieldCheck size={10} className="text-accent-green opacity-50" />}
               </div>
               <p className={cn(
                 "text-[9px] font-medium leading-tight",
                 log.type === 'info' && "text-white/70",
                 log.type === 'success' && "text-accent-cyan",
                 log.type === 'warning' && "text-accent-pink/80",
                 log.type === 'error' && "text-red-400"
               )}>
                 {log.message}
               </p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-white/[0.01] border-t border-white/5">
         <div className="flex items-center justify-between text-[8px] font-black text-text-muted uppercase tracking-tighter">
            <div className="flex items-center gap-2">
               <Clock size={10} />
               <span>Uptime: 04:12:33</span>
            </div>
            <span>SEC_LEVEL: ALPHA</span>
         </div>
      </div>
    </div>
  )
}
