import { cn } from '@/lib/utils'

interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Divider({ orientation = 'horizontal', className }: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        className={cn(
          'w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent mx-4',
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-4',
        className
      )}
    />
  )
}
