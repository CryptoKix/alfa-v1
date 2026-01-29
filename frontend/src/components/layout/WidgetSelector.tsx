import { useState, useRef, useEffect } from 'react'
import { LayoutGrid, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useLayoutStore, availableWidgets } from '@/stores/layoutStore'
import { cn } from '@/lib/utils'

interface WidgetSelectorProps {
  page: string
}

export function WidgetSelector({ page }: WidgetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { hiddenWidgets, toggleWidget, resetLayout } = useLayoutStore()

  const widgets = availableWidgets[page] || []
  const hidden = hiddenWidgets[page] || []
  const hiddenCount = hidden.length

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (widgets.length === 0) return null

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
          isOpen
            ? "bg-accent-cyan/20 text-accent-cyan"
            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
        )}
      >
        <LayoutGrid size={14} />
        <span>Widgets</span>
        {hiddenCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-accent-red/20 text-accent-red text-[10px]">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-background-card border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              Toggle Widgets
            </span>
            <button
              onClick={() => {
                resetLayout(page)
                setIsOpen(false)
              }}
              className="flex items-center gap-1 text-[10px] text-white/40 hover:text-accent-cyan transition-colors"
              title="Reset layout"
            >
              <RotateCcw size={10} />
              Reset
            </button>
          </div>

          <div className="max-h-64 overflow-auto">
            {widgets.map((widget) => {
              const isVisible = !hidden.includes(widget.id)
              return (
                <button
                  key={widget.id}
                  onClick={() => toggleWidget(page, widget.id)}
                  className={cn(
                    "w-full px-3 py-2.5 flex items-center gap-3 transition-colors text-left",
                    isVisible
                      ? "hover:bg-white/5"
                      : "bg-white/[0.02] hover:bg-white/5"
                  )}
                >
                  <div
                    className={cn(
                      "p-1 rounded",
                      isVisible
                        ? "bg-accent-green/10 text-accent-green"
                        : "bg-white/5 text-white/30"
                    )}
                  >
                    {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium truncate",
                        isVisible ? "text-white" : "text-white/40"
                      )}
                    >
                      {widget.name}
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      {widget.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
