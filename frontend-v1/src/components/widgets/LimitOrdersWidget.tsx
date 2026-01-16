import { useState, useEffect } from 'react'
import { Clock, X, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { useAppDispatch } from '@/app/hooks'

export const LimitOrdersWidget = () => {
  const dispatch = useAppDispatch()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/limit/list')
      const data = await res.json()
      if (Array.isArray(data)) {
        setOrders(data)
      }
    } catch (e) {
      console.error("Failed to fetch limit orders", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 30000) // Auto-refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const handleCancel = async (orderAddress: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return
    setCancelling(orderAddress)
    try {
      const res = await fetch('/api/limit/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderAddress })
      })
      const data = await res.json()
      if (data.success) {
        dispatch(addNotification({
          title: 'Order Cancelled',
          message: 'Limit order cancellation broadcasted.',
          type: 'success'
        }))
        fetchOrders()
      } else {
        dispatch(addNotification({
          title: 'Cancellation Failed',
          message: data.error || 'Unknown error',
          type: 'error'
        }))
      }
    } catch (e) {
      dispatch(addNotification({
        title: 'Network Error',
        message: 'Could not connect to backend.',
        type: 'error'
      }))
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="bg-background-card border border-accent-pink/30 rounded-lg p-6 shadow-floating relative overflow-hidden flex flex-col h-full min-h-0">
      
      <div className="flex items-center justify-between mb-2 border-b border-accent-pink/30 shrink-0 h-[55px] -mx-6 px-6 -mt-6">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent-cyan/10 rounded-lg text-accent-cyan">
            <Clock size={18} />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">Open Limit Orders</h2>
        </div>
        <button 
          onClick={fetchOrders}
          disabled={loading}
          className={cn(
            "p-1.5 hover:bg-white/10 rounded-lg text-white transition-colors",
            loading && "animate-spin"
          )}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar pr-1 -mr-1">
        {orders.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in-95 duration-500">
             <div className="p-4 rounded-full bg-accent-pink/5 border border-accent-pink/20 shadow-[0_0_30px_rgba(255,0,128,0.1)]">
               <Clock size={32} strokeWidth={1.5} className="text-accent-pink" />
             </div>
             <div className="text-center space-y-1">
               <div className="font-black text-xs uppercase tracking-[0.2em] text-white">No Orders</div>
               <div className="text-[10px] font-bold text-accent-pink/70">Order book is clear</div>
             </div>
           </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.publicKey} className="bg-white/[0.02] border border-border rounded-md p-3 group hover:border-border5 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                      // Detection of buy/sell based on mints would be better here
                      "bg-accent-purple/10 text-accent-purple"
                    )}>
                      Limit Order
                    </span>
                    <span className="text-[10px] font-bold text-white uppercase tracking-tight">
                      {order.account.makingAmount / (10**9)} → {order.account.takingAmount / (10**9)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={`https://solscan.io/account/${order.publicKey}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-purple transition-colors"
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button 
                      onClick={() => handleCancel(order.publicKey)}
                      disabled={cancelling === order.publicKey}
                      className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-accent-purple transition-colors"
                    >
                      {cancelling === order.publicKey ? <RefreshCw size={12} className="animate-spin" /> : <X size={12} />}
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex flex-col">
                    <span className="text-[7px] text-text-muted uppercase font-bold tracking-[0.2em]">In</span>
                    <span className="text-[9px] font-mono text-white truncate max-w-[120px]">{order.account.inputMint}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[7px] text-text-muted uppercase font-bold tracking-[0.2em]">Out</span>
                    <span className="text-[9px] font-mono text-white truncate max-w-[120px]">{order.account.outputMint}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
