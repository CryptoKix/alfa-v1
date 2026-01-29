import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delayDuration?: number
  className?: string
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delayDuration = 200,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root delayDuration={delayDuration}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={5}
            className={cn(
              'z-[500] px-3 py-1.5 text-xs font-medium text-white',
              'bg-black/90 backdrop-blur-md border border-white/10 rounded-lg',
              'shadow-xl animate-fade-in',
              className
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-black/90" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
