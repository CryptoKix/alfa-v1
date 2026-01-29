import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
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
            "w-11 h-6 rounded-full transition-all duration-200",
            "bg-background-elevated border border-border",
            "peer-checked:bg-accent-cyan peer-checked:border-accent-cyan",
            "peer-focus:ring-2 peer-focus:ring-accent-cyan/30",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            "after:content-[''] after:absolute after:top-[2px] after:left-[2px]",
            "after:w-5 after:h-5 after:rounded-full after:bg-text-primary",
            "after:transition-all after:duration-200",
            "peer-checked:after:translate-x-5 peer-checked:after:bg-black",
            className
          )}
        />
      </label>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
