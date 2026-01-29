import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-full border',
  {
    variants: {
      variant: {
        default: 'bg-white/5 border-white/10 text-white/70',
        cyan: 'bg-[rgba(0,255,255,0.1)] border-[rgba(0,255,255,0.3)] text-[var(--accent-cyan)]',
        pink: 'bg-[rgba(255,0,255,0.1)] border-[rgba(255,0,255,0.3)] text-[var(--accent-pink)]',
        purple: 'bg-[rgba(153,69,255,0.1)] border-[rgba(153,69,255,0.3)] text-[var(--accent-purple)]',
        green: 'bg-[rgba(0,255,157,0.1)] border-[rgba(0,255,157,0.3)] text-[var(--accent-green)]',
        red: 'bg-[rgba(255,42,109,0.1)] border-[rgba(255,42,109,0.3)] text-[var(--accent-red)]',
        yellow: 'bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.3)] text-[var(--accent-yellow)]',
        orange: 'bg-[rgba(255,107,53,0.1)] border-[rgba(255,107,53,0.3)] text-[var(--accent-orange)]',
      },
      size: {
        sm: 'text-[10px] px-1.5 py-0',
        md: 'text-[11px] px-2 py-0.5',
        lg: 'text-xs px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
