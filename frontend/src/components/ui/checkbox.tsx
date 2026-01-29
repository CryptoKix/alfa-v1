import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          ref={ref}
          {...props}
        />
        <div
          className={cn(
            "w-5 h-5 rounded-md transition-all duration-200 flex items-center justify-center",
            "border border-border bg-background-elevated",
            "peer-checked:bg-accent-cyan peer-checked:border-accent-cyan",
            "peer-focus:ring-2 peer-focus:ring-accent-cyan/30",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            className
          )}
        >
          <Check
            className={cn(
              "w-3.5 h-3.5 text-black transition-opacity duration-200",
              checked ? "opacity-100" : "opacity-0"
            )}
          />
        </div>
      </label>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
