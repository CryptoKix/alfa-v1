import { useState, useEffect } from 'react'
import { Clock, X, ExternalLink, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addNotification } from '@/features/notifications/notificationsSlice'
import { useAppDispatch } from '@/app/hooks'
import { WidgetContainer } from './base/WidgetContainer'

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
      console.error('Failed to fetch limit orders', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleCancel = async (orderAddress: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return
    setCancelling(orderAddress)
    try {
      const res = await fetch('/api/limit/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderAddress }),
      })
      const data = await res.json()
      if (data.success) {
        dispatch(
          addNotification({
            title: 'Order Cancelled',
            message: 'Limit order cancellation broadcasted.',
            type: 'success',
          })
        )
        fetchOrders()
      } else {
        dispatch(
          addNotification({
            title: 'Cancellation Failed',
            message: data.error || 'Unknown error',
            type: 'error',
          })
        )
      }
    } catch {
      dispatch(
        addNotification({
          title: 'Network Error',
          message: 'Could not connect to backend.',
          type: 'error',
        })
      )
    } finally {
      setCancelling(null)
    }
  }

  const shortenMint = (mint: string) => {
    if (!mint || mint.length < 12) return mint
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`
  }

  return (
    <WidgetContainer
      id="limit-orders"
      title="Limit Orders"
      icon={<Clock className="w-4 h-4" />}
      badge={orders.length > 0 ? `${orders.length}` : undefined}
      actions={
        <button
          onClick={fetchOrders}
          disabled={loading}
          className={cn(
            'p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors',
            loading && 'animate-spin'
          )}
        >
          <RefreshCw size={14} />
        </button>
      }
      noPadding
    >
      {/* Table Header */}
      <div className="grid grid-cols-[60px_1fr_1fr_50px] gap-2 px-4 py-2 bg-white/[0.02] border-b border-white/[0.06] text-[10px] text-white/40 uppercase tracking-wider font-bold shrink-0">
        <div>Type</div>
        <div>Input</div>
        <div>Output</div>
        <div className="text-right"></div>
      </div>

      {/* Orders List */}
      <div className="flex-1 overflow-auto glass-scrollbar">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-white/30">
            <Clock size={20} strokeWidth={1} />
            <span className="text-xs mt-2">No active orders</span>
          </div>
        ) : (
          orders.map((order, index) => (
            <div
              key={order.publicKey}
              className={cn(
                'grid grid-cols-[60px_1fr_1fr_50px] gap-2 px-4 py-2.5 items-center group transition-all',
                'hover:bg-accent-cyan/[0.03] border-l-2 border-l-transparent hover:border-l-accent-cyan/50',
                index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]'
              )}
            >
              {/* Type */}
              <div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-accent-cyan/10 text-accent-cyan">
                  Limit
                </span>
              </div>

              {/* Input */}
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-white/70">
                  {(order.account.makingAmount / 10 ** 9).toLocaleString()}
                </p>
                <p className="text-[8px] font-mono text-white/30 truncate">{shortenMint(order.account.inputMint)}</p>
              </div>

              {/* Output */}
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-accent-cyan font-bold">
                  {(order.account.takingAmount / 10 ** 9).toLocaleString()}
                </p>
                <p className="text-[8px] font-mono text-white/30 truncate">{shortenMint(order.account.outputMint)}</p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={`https://solscan.io/account/${order.publicKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-accent-cyan transition-colors"
                >
                  <ExternalLink size={12} />
                </a>
                <button
                  onClick={() => handleCancel(order.publicKey)}
                  disabled={cancelling === order.publicKey}
                  className="p-1 rounded hover:bg-accent-red/20 text-white/40 hover:text-accent-red transition-colors"
                >
                  {cancelling === order.publicKey ? <RefreshCw size={12} className="animate-spin" /> : <X size={12} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  )
}
