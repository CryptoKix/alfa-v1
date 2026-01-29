// Types are imported directly from slices where needed
// No re-exports to avoid naming conflicts

// Layout types
export interface WidgetLayout {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  static?: boolean
}

export interface LayoutPreset {
  name: string
  layouts: {
    lg: WidgetLayout[]
    md: WidgetLayout[]
    sm: WidgetLayout[]
    xs: WidgetLayout[]
  }
}

// Widget configuration
export type WidgetId =
  | 'portfolio'
  | 'chart'
  | 'trade-entry'
  | 'active-bots'
  | 'alerts'
  | 'whale-tracker'
  | 'signal-feed'
  | 'arb-scanner'
  | 'price-matrix'
  | 'token-sniper'
  | 'detected-tokens'
  | 'dlmm-pools'
  | 'dlmm-positions'
  | 'dlmm-strategy'
  | 'yield-opportunities'
  | 'yield-positions'
  | 'trade-history'
  | 'holdings'
  | 'bot-creator'
  | 'quick-trade'
  | 'equity-curve'
  | 'control-panel'
  | 'navigation'
  | 'limit-orders'
  | 'copy-signals'
  | 'seeker-logs'
  | 'signal-bot'
  | 'skr-staking'
  | 'skr-whale-feed'
  | 'skr-whale-leaderboard'

export interface WidgetConfig {
  id: WidgetId
  title: string
  icon: string
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
  category: 'core' | 'trading' | 'bots' | 'copy' | 'arb' | 'sniper' | 'dlmm' | 'yield' | 'system'
}

// Connection status
export interface ConnectionStatus {
  portfolio: boolean
  prices: boolean
  bots: boolean
  copytrade: boolean
  arb: boolean
  sniper: boolean
  intel: boolean
  history: boolean
  yield: boolean
  dlmm: boolean
}

// Common component props
export interface BaseProps {
  className?: string
  children?: React.ReactNode
}

export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type Variant = 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'ghost'
export type ColorAccent = 'cyan' | 'pink' | 'purple' | 'green' | 'red' | 'yellow' | 'orange'
