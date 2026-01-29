import { forwardRef, type InputHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const inputVariants = cva(
  'w-full font-sans text-white bg-black/30 border outline-none transition-all duration-200 placeholder:text-white/35 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'border-white/10 hover:border-white/15 focus:border-[var(--accent-cyan)] focus:shadow-[0_0_0_3px_rgba(0,255,255,0.1)]',
        error: 'border-[var(--accent-red)] focus:border-[var(--accent-red)] focus:shadow-[0_0_0_3px_rgba(255,42,109,0.1)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm rounded-md',
        md: 'h-9 px-3 text-sm rounded-lg',
        lg: 'h-10 px-4 text-base rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  icon?: React.ReactNode
  rightIcon?: React.ReactNode
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, icon, rightIcon, error, type = 'text', ...props }, ref) => {
    const hasIcon = !!icon
    const hasRightIcon = !!rightIcon

    return (
      <div className="relative w-full">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            inputVariants({ variant: error ? 'error' : variant, size }),
            hasIcon && 'pl-10',
            hasRightIcon && 'pr-10',
            className
          )}
          ref={ref}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35">
            {rightIcon}
          </div>
        )}
        {error && (
          <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input, inputVariants }
