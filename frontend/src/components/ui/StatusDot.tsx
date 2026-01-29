import { cn } from '@/lib/utils'

interface StatusDotProps {
  status: 'connected' | 'disconnected' | 'pending' | 'active' | 'paused' | 'error'
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
  className?: string
}

const statusColors = {
  connected: 'bg-[var(--accent-green)] shadow-[0_0_8px_var(--accent-green)]',
  disconnected: 'bg-[var(--accent-red)] shadow-[0_0_8px_var(--accent-red)]',
  pending: 'bg-[var(--accent-yellow)] shadow-[0_0_8px_var(--accent-yellow)]',
  active: 'bg-[var(--accent-green)] shadow-[0_0_8px_var(--accent-green)]',
  paused: 'bg-[var(--accent-yellow)] shadow-[0_0_8px_var(--accent-yellow)]',
  error: 'bg-[var(--accent-red)] shadow-[0_0_8px_var(--accent-red)]',
}

const sizes = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
}

export function StatusDot({ status, size = 'md', pulse = false, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full',
        statusColors[status],
        sizes[size],
        pulse && 'animate-pulse',
        className
      )}
    />
  )
}
