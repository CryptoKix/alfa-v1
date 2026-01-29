import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  showValue?: boolean
  formatValue?: (value: number) => string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, showValue = false, formatValue, ...props }, ref) => {
    const value = Number(props.value || props.defaultValue || 0)

    return (
      <div className="relative w-full">
        <input
          type="range"
          className={cn(
            "w-full h-2 bg-background-elevated rounded-full appearance-none cursor-pointer",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-cyan [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-glow-cyan [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110",
            "[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent-cyan [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer",
            className
          )}
          ref={ref}
          {...props}
        />
        {showValue && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-mono text-accent-cyan">
            {formatValue ? formatValue(value) : value}
          </div>
        )}
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
