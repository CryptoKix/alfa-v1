import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

const selectVariants = cva(
  'w-full font-sans text-white bg-black/30 border outline-none transition-all duration-200 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'border-white/10 hover:border-white/15 focus:border-[var(--accent-cyan)] focus:shadow-[0_0_0_3px_rgba(0,255,255,0.1)]',
        error: 'border-[var(--accent-red)] focus:border-[var(--accent-red)] focus:shadow-[0_0_0_3px_rgba(255,42,109,0.1)]',
      },
      size: {
        sm: 'h-8 px-3 pr-8 text-sm rounded-md',
        md: 'h-9 px-3 pr-9 text-sm rounded-lg',
        lg: 'h-10 px-4 pr-10 text-base rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {
  options: SelectOption[]
  placeholder?: string
  error?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, variant, size, options, placeholder, error, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(selectVariants({ variant: error ? 'error' : variant, size }), className)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="bg-black text-white"
            >
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
        {error && (
          <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export { Select, selectVariants }
