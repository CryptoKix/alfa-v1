import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  variant?: 'cyan' | 'green' | 'red' | 'pink' | 'purple' | 'yellow'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const variants = {
  cyan: 'from-[var(--accent-cyan)] to-[rgba(0,255,255,0.5)]',
  green: 'from-[var(--accent-green)] to-[rgba(0,255,157,0.5)]',
  red: 'from-[var(--accent-red)] to-[rgba(255,42,109,0.5)]',
  pink: 'from-[var(--accent-pink)] to-[rgba(255,0,255,0.5)]',
  purple: 'from-[var(--accent-purple)] to-[rgba(153,69,255,0.5)]',
  yellow: 'from-[var(--accent-yellow)] to-[rgba(251,191,36,0.5)]',
}

const sizes = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
}

export function Progress({
  value,
  max = 100,
  variant = 'cyan',
  size = 'md',
  showLabel = false,
  className,
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-white/50 mb-1">
          <span>{value.toFixed(0)}</span>
          <span>{max}</span>
        </div>
      )}
      <div className={cn('w-full bg-white/[0.03] rounded-full overflow-hidden', sizes[size])}>
        <div
          className={cn(
            'h-full rounded-full bg-gradient-to-r transition-all duration-300',
            variants[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
