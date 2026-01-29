import { forwardRef, type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva(
  'backdrop-blur-xl border transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'bg-white/[0.03] border-white/[0.06]',
        solid: 'bg-[rgba(10,10,10,0.85)] border-white/10',
        elevated: 'bg-white/[0.04] border-white/10 shadow-lg',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
      rounded: {
        md: 'rounded-lg',
        lg: 'rounded-xl',
        xl: 'rounded-2xl',
      },
      interactive: {
        true: 'cursor-pointer hover:bg-white/[0.06] hover:border-white/10 hover:-translate-y-0.5 hover:shadow-xl',
        false: '',
      },
      selected: {
        true: 'border-[var(--accent-cyan)] shadow-[var(--glow-cyan)]',
        false: '',
      },
      glow: {
        none: '',
        cyan: 'shadow-[var(--glow-cyan)]',
        pink: 'shadow-[var(--glow-pink)]',
        green: 'shadow-[var(--glow-green)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      rounded: 'lg',
      interactive: false,
      selected: false,
      glow: 'none',
    },
  }
)

export interface GlassCardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant, padding, rounded, interactive, selected, glow, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, padding, rounded, interactive, selected, glow }), className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

GlassCard.displayName = 'GlassCard'

export { GlassCard, cardVariants }
