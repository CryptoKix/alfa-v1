import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useLayoutStore } from '@/stores/layoutStore'
import { GripVertical, Maximize2, X } from 'lucide-react'
import { Button, Badge, Tooltip } from '@/components/ui'

interface WidgetContainerProps {
  id: string
  title: string
  icon?: ReactNode
  badge?: string
  badgeVariant?: 'cyan' | 'pink' | 'green' | 'red' | 'yellow' | 'purple'
  children: ReactNode
  actions?: ReactNode
  className?: string
  headerClassName?: string
  contentClassName?: string
  noPadding?: boolean
  onRemove?: () => void
  onExpand?: () => void
}

export function WidgetContainer({
  id,
  title,
  icon,
  badge,
  badgeVariant = 'cyan',
  children,
  actions,
  className,
  headerClassName,
  contentClassName,
  noPadding = false,
  onRemove,
  onExpand,
}: WidgetContainerProps) {
  const { isEditMode } = useLayoutStore()

  return (
    <div
      data-widget-id={id}
      className={cn(
        'h-full w-full flex flex-col glass-widget',
        isEditMode && 'ring-1 ring-[var(--accent-cyan)]/20',
        className
      )}
    >
      {/* Header - Drag handle */}
      <div
        className={cn(
          'glass-widget-header',
          isEditMode && 'cursor-grab active:cursor-grabbing',
          headerClassName
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isEditMode && (
            <GripVertical className="w-4 h-4 text-white/30 flex-shrink-0" />
          )}
          {icon && (
            <span className="text-[var(--accent-cyan)] flex-shrink-0">{icon}</span>
          )}
          <h3 className="text-sm font-semibold text-white/90 truncate">{title}</h3>
          {badge && (
            <Badge variant={badgeVariant} size="sm">
              {badge}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {actions}
          {isEditMode && (
            <>
              {onExpand && (
                <Tooltip content="Expand">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onExpand}
                  >
                    <Maximize2 className="w-3 h-3" />
                  </Button>
                </Tooltip>
              )}
              {onRemove && (
                <Tooltip content="Remove widget">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRemove}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 overflow-auto glass-scrollbar min-h-0',
          !noPadding && 'p-4',
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}
