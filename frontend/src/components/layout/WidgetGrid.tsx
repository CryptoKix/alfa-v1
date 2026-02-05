import { useCallback, useMemo, useEffect, useRef, useState, type ReactNode, Children, isValidElement, cloneElement } from 'react'
import { Responsive, type Layout, type Layouts } from 'react-grid-layout'
import { useLayoutStore, breakpoints, cols, pageLayouts, defaultDashboardLayouts } from '@/stores/layoutStore'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

interface WidgetGridProps {
  page: string
  children: ReactNode
}

export function WidgetGrid({ page, children }: WidgetGridProps) {
  const { layouts, isEditMode, updateLayout, setCurrentPage, hiddenWidgets } = useLayoutStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(30)
  const [containerWidth, setContainerWidth] = useState(0)

  // Get the current layout for this page, falling back to defaults
  // Also merge in any missing widgets from defaults (e.g., newly added widgets)
  const currentLayouts = useMemo(() => {
    const defaults = pageLayouts[page] || defaultDashboardLayouts
    const savedLayouts = layouts[page]

    if (!savedLayouts) return defaults

    // Merge: use saved layouts but add any missing widgets from defaults
    const merged: Layouts = {}
    for (const [bp, defaultBpLayouts] of Object.entries(defaults)) {
      const savedBpLayouts = savedLayouts[bp] || []
      const savedIds = new Set(savedBpLayouts.map((l: Layout) => l.i))

      // Start with saved layouts
      merged[bp] = [...savedBpLayouts]

      // Add any missing widgets from defaults
      for (const defaultLayout of defaultBpLayouts) {
        if (!savedIds.has(defaultLayout.i)) {
          merged[bp].push(defaultLayout)
        }
      }
    }

    return merged
  }, [layouts, page])

  // Filter out hidden widgets from children and fix keys
  const hidden = hiddenWidgets[page] || []
  const visibleChildren = useMemo(() => {
    return Children.toArray(children)
      .filter((child) => {
        if (isValidElement(child) && child.key) {
          const widgetId = String(child.key).replace(/^\.\$/, '')
          return !hidden.includes(widgetId)
        }
        return true
      })
      .map((child) => {
        // Clone child with clean key (remove .$ prefix added by Children.toArray)
        if (isValidElement(child) && child.key) {
          const cleanKey = String(child.key).replace(/^\.\$/, '')
          return cloneElement(child, { key: cleanKey })
        }
        return child
      })
  }, [children, hidden])

  // Filter layouts to only include visible widgets
  const filteredLayouts = useMemo(() => {
    const result: Layouts = {}
    for (const [bp, bpLayouts] of Object.entries(currentLayouts)) {
      result[bp] = bpLayouts.filter((l: Layout) => !hidden.includes(l.i))
    }
    return result
  }, [currentLayouts, hidden])

  // Update current page in store
  useEffect(() => {
    setCurrentPage(page)
  }, [page, setCurrentPage])

  // Calculate row height and width to fill container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const calculateDimensions = () => {
      const height = container.clientHeight
      const width = container.clientWidth

      if (height < 100 || width < 100) return

      setContainerWidth(width)

      const margin = 8
      const totalRows = 20
      const totalMargins = (totalRows - 1) * margin
      const calculatedHeight = (height - totalMargins) / totalRows
      setRowHeight(Math.max(30, calculatedHeight))
    }

    // Initial calculation with small delay to ensure layout
    const timer = setTimeout(calculateDimensions, 50)

    // Use ResizeObserver for subsequent changes
    const resizeObserver = new ResizeObserver(calculateDimensions)
    resizeObserver.observe(container)

    return () => {
      clearTimeout(timer)
      resizeObserver.disconnect()
    }
  }, [page])

  const handleLayoutChange = useCallback(
    (currentLayout: Layout[], allLayouts: Layouts) => {
      // Only save layout changes in edit mode
      if (!isEditMode) return

      // Get the current breakpoint from the layout
      const breakpoint = Object.keys(allLayouts).find(
        (bp) => allLayouts[bp] === currentLayout
      )
      if (breakpoint) {
        updateLayout(page, currentLayout, breakpoint)
      }
    },
    [isEditMode, page, updateLayout]
  )

  return (
    <div ref={containerRef} className="h-full w-full">
      {containerWidth > 0 && (
        <Responsive
          key={`${isEditMode ? 'edit' : 'view'}-${hidden.length}-${containerWidth}`}
          className="layout h-full"
          width={containerWidth}
          layouts={filteredLayouts}
          breakpoints={breakpoints}
          cols={cols}
          rowHeight={rowHeight}
          margin={[8, 8]}
          containerPadding={[0, 0]}
          onLayoutChange={handleLayoutChange}
          isDraggable={isEditMode}
          isResizable={isEditMode}
          draggableHandle=".glass-widget-header"
          resizeHandles={['se']}
          compactType="vertical"
          preventCollision={false}
          useCSSTransforms={true}
        >
          {visibleChildren}
        </Responsive>
      )}
    </div>
  )
}
