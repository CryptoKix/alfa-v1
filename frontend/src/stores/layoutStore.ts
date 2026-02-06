import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout, Layouts } from 'react-grid-layout'

// Default breakpoints for react-grid-layout
export const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
export const cols = { lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 }

// Default layouts for Dashboard - overview focused
// 20 rows total, each row 10 units high for perfect alignment
export const defaultDashboardLayouts: Layouts = {
  lg: [
    // Left: Portfolio (full height) | Right: Chart, Bots, History
    { i: 'portfolio', x: 0, y: 0, w: 7, h: 20, minW: 6, minH: 10 },
    { i: 'chart', x: 7, y: 0, w: 17, h: 10, minW: 8, minH: 6 },
    { i: 'active-bots', x: 7, y: 10, w: 8, h: 10, minW: 4, minH: 6 },
    { i: 'trade-history', x: 15, y: 10, w: 9, h: 10, minW: 6, minH: 6 },
  ],
  md: [
    { i: 'portfolio', x: 0, y: 0, w: 6, h: 20, minW: 5, minH: 10 },
    { i: 'chart', x: 6, y: 0, w: 14, h: 10, minW: 6, minH: 6 },
    { i: 'active-bots', x: 6, y: 10, w: 7, h: 10, minW: 4, minH: 6 },
    { i: 'trade-history', x: 13, y: 10, w: 7, h: 10, minW: 5, minH: 6 },
  ],
  sm: [
    { i: 'chart', x: 0, y: 0, w: 12, h: 8, minW: 6, minH: 6 },
    { i: 'portfolio', x: 0, y: 8, w: 6, h: 12, minW: 4, minH: 6 },
    { i: 'active-bots', x: 6, y: 8, w: 6, h: 6, minW: 4, minH: 6 },
    { i: 'trade-history', x: 6, y: 14, w: 6, h: 6, minW: 6, minH: 6 },
  ],
  xs: [
    { i: 'chart', x: 0, y: 0, w: 8, h: 7, minW: 4, minH: 5 },
    { i: 'portfolio', x: 0, y: 7, w: 8, h: 10, minW: 4, minH: 6 },
    { i: 'active-bots', x: 0, y: 17, w: 8, h: 7, minW: 4, minH: 5 },
    { i: 'trade-history', x: 0, y: 24, w: 8, h: 8, minW: 4, minH: 6 },
  ],
  xxs: [
    { i: 'chart', x: 0, y: 0, w: 4, h: 5, minW: 4, minH: 4 },
    { i: 'portfolio', x: 0, y: 5, w: 4, h: 8, minW: 4, minH: 6 },
    { i: 'active-bots', x: 0, y: 13, w: 4, h: 5, minW: 4, minH: 4 },
    { i: 'trade-history', x: 0, y: 18, w: 4, h: 5, minW: 4, minH: 4 },
  ],
}

// Layouts for specific pages
export const pageLayouts: Record<string, Layouts> = {
  dashboard: defaultDashboardLayouts,
  trade: {
    lg: [
      // Chart dominates top, Trade entry on right
      { i: 'chart', x: 0, y: 0, w: 16, h: 14, minW: 10, minH: 8 },
      { i: 'trade-entry', x: 16, y: 0, w: 8, h: 14, minW: 5, minH: 8 },
      // Bottom row: Limit orders and Trade history
      { i: 'limit-orders', x: 0, y: 14, w: 12, h: 6, minW: 6, minH: 4 },
      { i: 'trade-history', x: 12, y: 14, w: 12, h: 6, minW: 6, minH: 4 },
    ],
    md: [
      { i: 'chart', x: 0, y: 0, w: 12, h: 12, minW: 8, minH: 8 },
      { i: 'trade-entry', x: 12, y: 0, w: 8, h: 12, minW: 5, minH: 8 },
      { i: 'limit-orders', x: 0, y: 12, w: 10, h: 8, minW: 6, minH: 4 },
      { i: 'trade-history', x: 10, y: 12, w: 10, h: 8, minW: 6, minH: 4 },
    ],
    sm: [
      { i: 'chart', x: 0, y: 0, w: 12, h: 8, minW: 6, minH: 6 },
      { i: 'trade-entry', x: 0, y: 8, w: 12, h: 8, minW: 6, minH: 6 },
      { i: 'limit-orders', x: 0, y: 16, w: 6, h: 6, minW: 4, minH: 4 },
      { i: 'trade-history', x: 6, y: 16, w: 6, h: 6, minW: 4, minH: 4 },
    ],
    xs: [
      { i: 'chart', x: 0, y: 0, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'trade-entry', x: 0, y: 8, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'limit-orders', x: 0, y: 16, w: 8, h: 6, minW: 4, minH: 4 },
      { i: 'trade-history', x: 0, y: 22, w: 8, h: 6, minW: 4, minH: 4 },
    ],
    xxs: [
      { i: 'chart', x: 0, y: 0, w: 4, h: 6, minW: 4, minH: 4 },
      { i: 'trade-entry', x: 0, y: 6, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'limit-orders', x: 0, y: 14, w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'trade-history', x: 0, y: 19, w: 4, h: 5, minW: 4, minH: 4 },
    ],
  },
  bots: {
    lg: [
      { i: 'active-bots', x: 0, y: 0, w: 8, h: 10, minW: 5, minH: 6 },
      { i: 'bot-creator', x: 8, y: 0, w: 8, h: 10, minW: 5, minH: 6 },
      { i: 'bot-preview', x: 16, y: 0, w: 8, h: 10, minW: 5, minH: 6 },
      { i: 'trade-history', x: 0, y: 10, w: 24, h: 10, minW: 8, minH: 4 },
    ],
    md: [
      { i: 'active-bots', x: 0, y: 0, w: 10, h: 10, minW: 5, minH: 6 },
      { i: 'bot-creator', x: 10, y: 0, w: 10, h: 10, minW: 5, minH: 6 },
      { i: 'bot-preview', x: 0, y: 10, w: 14, h: 10, minW: 5, minH: 6 },
      { i: 'trade-history', x: 14, y: 10, w: 6, h: 10, minW: 4, minH: 4 },
    ],
    sm: [
      { i: 'active-bots', x: 0, y: 0, w: 12, h: 8, minW: 6, minH: 6 },
      { i: 'bot-creator', x: 0, y: 8, w: 12, h: 10, minW: 6, minH: 6 },
      { i: 'bot-preview', x: 0, y: 18, w: 12, h: 10, minW: 6, minH: 6 },
      { i: 'trade-history', x: 0, y: 28, w: 12, h: 8, minW: 4, minH: 4 },
    ],
    xs: [
      { i: 'active-bots', x: 0, y: 0, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'bot-creator', x: 0, y: 8, w: 8, h: 10, minW: 4, minH: 6 },
      { i: 'bot-preview', x: 0, y: 18, w: 8, h: 10, minW: 4, minH: 6 },
      { i: 'trade-history', x: 0, y: 28, w: 8, h: 8, minW: 4, minH: 4 },
    ],
    xxs: [
      { i: 'active-bots', x: 0, y: 0, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'bot-creator', x: 0, y: 8, w: 4, h: 10, minW: 4, minH: 6 },
      { i: 'bot-preview', x: 0, y: 18, w: 4, h: 10, minW: 4, minH: 6 },
      { i: 'trade-history', x: 0, y: 28, w: 4, h: 8, minW: 4, minH: 4 },
    ],
  },
  copytrade: {
    lg: [
      { i: 'whale-tracker', x: 0, y: 0, w: 8, h: 20, minW: 6, minH: 8 },
      { i: 'signal-feed', x: 8, y: 0, w: 10, h: 20, minW: 6, minH: 8 },
      { i: 'alerts', x: 18, y: 0, w: 6, h: 20, minW: 4, minH: 6 },
    ],
    md: [
      { i: 'whale-tracker', x: 0, y: 0, w: 8, h: 20, minW: 6, minH: 8 },
      { i: 'signal-feed', x: 8, y: 0, w: 8, h: 20, minW: 6, minH: 8 },
      { i: 'alerts', x: 16, y: 0, w: 4, h: 20, minW: 4, minH: 6 },
    ],
    sm: [
      { i: 'whale-tracker', x: 0, y: 0, w: 6, h: 10, minW: 6, minH: 8 },
      { i: 'signal-feed', x: 6, y: 0, w: 6, h: 10, minW: 6, minH: 8 },
      { i: 'alerts', x: 0, y: 10, w: 12, h: 10, minW: 4, minH: 6 },
    ],
    xs: [
      { i: 'whale-tracker', x: 0, y: 0, w: 8, h: 7, minW: 4, minH: 6 },
      { i: 'signal-feed', x: 0, y: 7, w: 8, h: 7, minW: 4, minH: 6 },
      { i: 'alerts', x: 0, y: 14, w: 8, h: 6, minW: 4, minH: 4 },
    ],
    xxs: [
      { i: 'whale-tracker', x: 0, y: 0, w: 4, h: 7, minW: 4, minH: 6 },
      { i: 'signal-feed', x: 0, y: 7, w: 4, h: 7, minW: 4, minH: 6 },
      { i: 'alerts', x: 0, y: 14, w: 4, h: 6, minW: 4, minH: 4 },
    ],
  },
  sniper: {
    lg: [
      { i: 'token-sniper', x: 0, y: 0, w: 6, h: 20, minW: 5, minH: 8 },
      { i: 'active-positions', x: 6, y: 0, w: 9, h: 10, minW: 6, minH: 6 },
      { i: 'detected-tokens', x: 6, y: 10, w: 9, h: 10, minW: 6, minH: 6 },
      { i: 'alerts', x: 15, y: 0, w: 9, h: 20, minW: 4, minH: 6 },
    ],
    md: [
      { i: 'token-sniper', x: 0, y: 0, w: 6, h: 20, minW: 5, minH: 8 },
      { i: 'active-positions', x: 6, y: 0, w: 8, h: 10, minW: 5, minH: 6 },
      { i: 'detected-tokens', x: 6, y: 10, w: 8, h: 10, minW: 5, minH: 6 },
      { i: 'alerts', x: 14, y: 0, w: 6, h: 20, minW: 4, minH: 6 },
    ],
    sm: [
      { i: 'token-sniper', x: 0, y: 0, w: 6, h: 10, minW: 5, minH: 8 },
      { i: 'active-positions', x: 6, y: 0, w: 6, h: 10, minW: 4, minH: 6 },
      { i: 'detected-tokens', x: 0, y: 10, w: 7, h: 10, minW: 4, minH: 6 },
      { i: 'alerts', x: 7, y: 10, w: 5, h: 10, minW: 4, minH: 6 },
    ],
    xs: [
      { i: 'token-sniper', x: 0, y: 0, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'active-positions', x: 0, y: 8, w: 8, h: 6, minW: 4, minH: 5 },
      { i: 'detected-tokens', x: 0, y: 14, w: 8, h: 6, minW: 4, minH: 5 },
      { i: 'alerts', x: 0, y: 20, w: 8, h: 6, minW: 4, minH: 4 },
    ],
    xxs: [
      { i: 'token-sniper', x: 0, y: 0, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'active-positions', x: 0, y: 8, w: 4, h: 6, minW: 4, minH: 5 },
      { i: 'detected-tokens', x: 0, y: 14, w: 4, h: 6, minW: 4, minH: 5 },
      { i: 'alerts', x: 0, y: 20, w: 4, h: 6, minW: 4, minH: 4 },
    ],
  },
  arb: {
    lg: [
      // Left column: Add pair + Monitored pairs + Engine control
      { i: 'add-pair', x: 0, y: 0, w: 6, h: 12, minW: 5, minH: 10 },
      { i: 'pair-selector', x: 0, y: 12, w: 6, h: 8, minW: 5, minH: 6 },
      // Middle top: Engine control
      { i: 'arb-control', x: 6, y: 0, w: 6, h: 8, minW: 5, minH: 6 },
      // Middle: Price matrix
      { i: 'price-matrix', x: 6, y: 8, w: 6, h: 12, minW: 5, minH: 8 },
      // Right: Opportunities (tall)
      { i: 'opportunities', x: 12, y: 0, w: 12, h: 20, minW: 6, minH: 8 },
    ],
    md: [
      { i: 'add-pair', x: 0, y: 0, w: 6, h: 12, minW: 5, minH: 10 },
      { i: 'pair-selector', x: 0, y: 12, w: 6, h: 8, minW: 5, minH: 6 },
      { i: 'arb-control', x: 6, y: 0, w: 6, h: 8, minW: 5, minH: 6 },
      { i: 'price-matrix', x: 6, y: 8, w: 6, h: 12, minW: 5, minH: 8 },
      { i: 'opportunities', x: 12, y: 0, w: 8, h: 20, minW: 5, minH: 8 },
    ],
    sm: [
      { i: 'add-pair', x: 0, y: 0, w: 6, h: 12, minW: 4, minH: 10 },
      { i: 'arb-control', x: 6, y: 0, w: 6, h: 6, minW: 4, minH: 5 },
      { i: 'pair-selector', x: 6, y: 6, w: 6, h: 6, minW: 4, minH: 5 },
      { i: 'price-matrix', x: 0, y: 12, w: 6, h: 10, minW: 4, minH: 8 },
      { i: 'opportunities', x: 6, y: 12, w: 6, h: 10, minW: 4, minH: 8 },
    ],
    xs: [
      { i: 'add-pair', x: 0, y: 0, w: 8, h: 12, minW: 4, minH: 10 },
      { i: 'pair-selector', x: 0, y: 12, w: 8, h: 6, minW: 4, minH: 5 },
      { i: 'arb-control', x: 0, y: 18, w: 8, h: 6, minW: 4, minH: 5 },
      { i: 'price-matrix', x: 0, y: 24, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'opportunities', x: 0, y: 32, w: 8, h: 8, minW: 4, minH: 6 },
    ],
    xxs: [
      { i: 'add-pair', x: 0, y: 0, w: 4, h: 12, minW: 4, minH: 10 },
      { i: 'pair-selector', x: 0, y: 12, w: 4, h: 6, minW: 4, minH: 5 },
      { i: 'arb-control', x: 0, y: 18, w: 4, h: 6, minW: 4, minH: 5 },
      { i: 'price-matrix', x: 0, y: 24, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'opportunities', x: 0, y: 32, w: 4, h: 8, minW: 4, minH: 6 },
    ],
  },
  dlmm: {
    lg: [
      // Left column: Pools list (tall)
      { i: 'dlmm-pools', x: 0, y: 0, w: 8, h: 20, minW: 6, minH: 8 },
      // Middle column: Favorites (top) + Positions (bottom)
      { i: 'dlmm-favorites', x: 8, y: 0, w: 8, h: 8, minW: 5, minH: 6 },
      { i: 'dlmm-positions', x: 8, y: 8, w: 8, h: 12, minW: 5, minH: 6 },
      // Right column: Strategy builder (tall)
      { i: 'dlmm-strategy', x: 16, y: 0, w: 8, h: 20, minW: 6, minH: 10 },
    ],
    md: [
      { i: 'dlmm-pools', x: 0, y: 0, w: 7, h: 20, minW: 5, minH: 8 },
      { i: 'dlmm-favorites', x: 7, y: 0, w: 6, h: 8, minW: 4, minH: 6 },
      { i: 'dlmm-positions', x: 7, y: 8, w: 6, h: 12, minW: 4, minH: 6 },
      { i: 'dlmm-strategy', x: 13, y: 0, w: 7, h: 20, minW: 5, minH: 10 },
    ],
    sm: [
      { i: 'dlmm-pools', x: 0, y: 0, w: 6, h: 10, minW: 4, minH: 6 },
      { i: 'dlmm-favorites', x: 6, y: 0, w: 6, h: 10, minW: 4, minH: 6 },
      { i: 'dlmm-positions', x: 0, y: 10, w: 6, h: 10, minW: 4, minH: 6 },
      { i: 'dlmm-strategy', x: 6, y: 10, w: 6, h: 10, minW: 4, minH: 8 },
    ],
    xs: [
      { i: 'dlmm-pools', x: 0, y: 0, w: 8, h: 7, minW: 4, minH: 5 },
      { i: 'dlmm-favorites', x: 0, y: 7, w: 8, h: 5, minW: 4, minH: 4 },
      { i: 'dlmm-positions', x: 0, y: 12, w: 8, h: 5, minW: 4, minH: 4 },
      { i: 'dlmm-strategy', x: 0, y: 17, w: 8, h: 8, minW: 4, minH: 6 },
    ],
    xxs: [
      { i: 'dlmm-pools', x: 0, y: 0, w: 4, h: 7, minW: 4, minH: 5 },
      { i: 'dlmm-favorites', x: 0, y: 7, w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'dlmm-positions', x: 0, y: 12, w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'dlmm-strategy', x: 0, y: 17, w: 4, h: 8, minW: 4, minH: 6 },
    ],
  },
  yield: {
    lg: [
      { i: 'yield-opportunities', x: 0, y: 0, w: 14, h: 20, minW: 8, minH: 10 },
      { i: 'yield-positions', x: 14, y: 0, w: 10, h: 12, minW: 6, minH: 8 },
      { i: 'alerts', x: 14, y: 12, w: 10, h: 8, minW: 4, minH: 6 },
    ],
    md: [
      { i: 'yield-opportunities', x: 0, y: 0, w: 12, h: 20, minW: 8, minH: 10 },
      { i: 'yield-positions', x: 12, y: 0, w: 8, h: 12, minW: 6, minH: 8 },
      { i: 'alerts', x: 12, y: 12, w: 8, h: 8, minW: 4, minH: 6 },
    ],
    sm: [
      { i: 'yield-opportunities', x: 0, y: 0, w: 12, h: 10, minW: 6, minH: 8 },
      { i: 'yield-positions', x: 0, y: 10, w: 6, h: 10, minW: 6, minH: 8 },
      { i: 'alerts', x: 6, y: 10, w: 6, h: 10, minW: 4, minH: 6 },
    ],
    xs: [
      { i: 'yield-opportunities', x: 0, y: 0, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'yield-positions', x: 0, y: 8, w: 8, h: 6, minW: 4, minH: 5 },
      { i: 'alerts', x: 0, y: 14, w: 8, h: 6, minW: 4, minH: 4 },
    ],
    xxs: [
      { i: 'yield-opportunities', x: 0, y: 0, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'yield-positions', x: 0, y: 8, w: 4, h: 6, minW: 4, minH: 5 },
      { i: 'alerts', x: 0, y: 14, w: 4, h: 6, minW: 4, minH: 4 },
    ],
  },
  liquidity: {
    lg: [
      // Left column: Protocol selector + Favorites + Rebalance
      { i: 'protocol-selector', x: 0, y: 0, w: 5, h: 4, minW: 4, minH: 3 },
      { i: 'liquidity-favorites', x: 0, y: 4, w: 5, h: 8, minW: 4, minH: 6 },
      { i: 'rebalance-manager', x: 0, y: 12, w: 5, h: 8, minW: 4, minH: 6 },
      // Middle: Pools list
      { i: 'liquidity-pools', x: 5, y: 0, w: 11, h: 12, minW: 8, minH: 8 },
      // Right column: Create position
      { i: 'create-position', x: 16, y: 0, w: 8, h: 12, minW: 6, minH: 8 },
      // Bottom: Positions (wide)
      { i: 'liquidity-positions', x: 5, y: 12, w: 19, h: 8, minW: 8, minH: 6 },
    ],
    md: [
      { i: 'protocol-selector', x: 0, y: 0, w: 5, h: 4, minW: 4, minH: 3 },
      { i: 'liquidity-favorites', x: 0, y: 4, w: 5, h: 8, minW: 4, minH: 6 },
      { i: 'liquidity-pools', x: 5, y: 0, w: 9, h: 12, minW: 6, minH: 8 },
      { i: 'create-position', x: 14, y: 0, w: 6, h: 12, minW: 5, minH: 8 },
      { i: 'liquidity-positions', x: 0, y: 12, w: 14, h: 8, minW: 6, minH: 6 },
      { i: 'rebalance-manager', x: 14, y: 12, w: 6, h: 8, minW: 4, minH: 6 },
    ],
    sm: [
      { i: 'protocol-selector', x: 0, y: 0, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'liquidity-favorites', x: 4, y: 0, w: 8, h: 4, minW: 4, minH: 3 },
      { i: 'liquidity-pools', x: 0, y: 4, w: 6, h: 10, minW: 4, minH: 6 },
      { i: 'create-position', x: 6, y: 4, w: 6, h: 10, minW: 4, minH: 6 },
      { i: 'liquidity-positions', x: 0, y: 14, w: 12, h: 6, minW: 6, minH: 5 },
      { i: 'rebalance-manager', x: 0, y: 20, w: 12, h: 5, minW: 4, minH: 4 },
    ],
    xs: [
      { i: 'protocol-selector', x: 0, y: 0, w: 8, h: 3, minW: 4, minH: 3 },
      { i: 'liquidity-favorites', x: 0, y: 3, w: 8, h: 5, minW: 4, minH: 4 },
      { i: 'liquidity-pools', x: 0, y: 8, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'create-position', x: 0, y: 16, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'liquidity-positions', x: 0, y: 24, w: 8, h: 7, minW: 4, minH: 5 },
      { i: 'rebalance-manager', x: 0, y: 31, w: 8, h: 5, minW: 4, minH: 4 },
    ],
    xxs: [
      { i: 'protocol-selector', x: 0, y: 0, w: 4, h: 3, minW: 4, minH: 3 },
      { i: 'liquidity-favorites', x: 0, y: 3, w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'liquidity-pools', x: 0, y: 8, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'create-position', x: 0, y: 16, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'liquidity-positions', x: 0, y: 24, w: 4, h: 7, minW: 4, minH: 5 },
      { i: 'rebalance-manager', x: 0, y: 31, w: 4, h: 5, minW: 4, minH: 4 },
    ],
  },
  skr: {
    lg: [
      { i: 'skr-stats', x: 0, y: 0, w: 6, h: 6, minW: 5, minH: 4 },
      { i: 'skr-chart', x: 6, y: 0, w: 18, h: 10, minW: 10, minH: 8 },
      { i: 'skr-events', x: 0, y: 6, w: 6, h: 14, minW: 5, minH: 8 },
      { i: 'skr-whales', x: 6, y: 10, w: 18, h: 10, minW: 8, minH: 6 },
    ],
    md: [
      { i: 'skr-stats', x: 0, y: 0, w: 6, h: 6, minW: 5, minH: 4 },
      { i: 'skr-chart', x: 6, y: 0, w: 14, h: 10, minW: 8, minH: 8 },
      { i: 'skr-events', x: 0, y: 6, w: 6, h: 14, minW: 5, minH: 8 },
      { i: 'skr-whales', x: 6, y: 10, w: 14, h: 10, minW: 6, minH: 6 },
    ],
    sm: [
      { i: 'skr-stats', x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
      { i: 'skr-chart', x: 0, y: 4, w: 12, h: 8, minW: 6, minH: 6 },
      { i: 'skr-events', x: 0, y: 12, w: 6, h: 8, minW: 4, minH: 6 },
      { i: 'skr-whales', x: 6, y: 12, w: 6, h: 8, minW: 4, minH: 6 },
    ],
    xs: [
      { i: 'skr-stats', x: 0, y: 0, w: 8, h: 4, minW: 4, minH: 3 },
      { i: 'skr-chart', x: 0, y: 4, w: 8, h: 7, minW: 4, minH: 5 },
      { i: 'skr-events', x: 0, y: 11, w: 8, h: 7, minW: 4, minH: 5 },
      { i: 'skr-whales', x: 0, y: 18, w: 8, h: 7, minW: 4, minH: 5 },
    ],
    xxs: [
      { i: 'skr-stats', x: 0, y: 0, w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'skr-chart', x: 0, y: 5, w: 4, h: 6, minW: 4, minH: 5 },
      { i: 'skr-events', x: 0, y: 11, w: 4, h: 7, minW: 4, minH: 5 },
      { i: 'skr-whales', x: 0, y: 18, w: 4, h: 7, minW: 4, minH: 5 },
    ],
  },
  control: {
    lg: [
      // Top row: Service monitor + Connection monitor
      { i: 'service-monitor', x: 0, y: 0, w: 14, h: 8, minW: 8, minH: 6 },
      { i: 'connection-monitor', x: 14, y: 0, w: 10, h: 8, minW: 6, minH: 6 },
      // Bottom row: Trading modules + Alerts
      { i: 'trading-modules', x: 0, y: 8, w: 12, h: 12, minW: 6, minH: 8 },
      { i: 'alerts', x: 12, y: 8, w: 12, h: 12, minW: 6, minH: 6 },
    ],
    md: [
      { i: 'service-monitor', x: 0, y: 0, w: 12, h: 8, minW: 8, minH: 6 },
      { i: 'connection-monitor', x: 12, y: 0, w: 8, h: 8, minW: 6, minH: 6 },
      { i: 'trading-modules', x: 0, y: 8, w: 10, h: 12, minW: 6, minH: 8 },
      { i: 'alerts', x: 10, y: 8, w: 10, h: 12, minW: 5, minH: 6 },
    ],
    sm: [
      { i: 'service-monitor', x: 0, y: 0, w: 12, h: 8, minW: 6, minH: 6 },
      { i: 'connection-monitor', x: 0, y: 8, w: 12, h: 7, minW: 6, minH: 5 },
      { i: 'trading-modules', x: 0, y: 15, w: 12, h: 10, minW: 6, minH: 8 },
      { i: 'alerts', x: 0, y: 25, w: 12, h: 8, minW: 4, minH: 6 },
    ],
    xs: [
      { i: 'service-monitor', x: 0, y: 0, w: 8, h: 8, minW: 4, minH: 6 },
      { i: 'connection-monitor', x: 0, y: 8, w: 8, h: 7, minW: 4, minH: 5 },
      { i: 'trading-modules', x: 0, y: 15, w: 8, h: 10, minW: 4, minH: 8 },
      { i: 'alerts', x: 0, y: 25, w: 8, h: 8, minW: 4, minH: 6 },
    ],
    xxs: [
      { i: 'service-monitor', x: 0, y: 0, w: 4, h: 8, minW: 4, minH: 6 },
      { i: 'connection-monitor', x: 0, y: 8, w: 4, h: 7, minW: 4, minH: 5 },
      { i: 'trading-modules', x: 0, y: 15, w: 4, h: 10, minW: 4, minH: 8 },
      { i: 'alerts', x: 0, y: 25, w: 4, h: 8, minW: 4, minH: 6 },
    ],
  },
}

// Available widgets per page with metadata
export const availableWidgets: Record<string, Array<{ id: string; name: string; description: string }>> = {
  dashboard: [
    { id: 'portfolio', name: 'Portfolio', description: 'Holdings and balances' },
    { id: 'chart', name: 'Chart', description: 'Price chart' },
    { id: 'active-bots', name: 'Active Bots', description: 'Running bot strategies' },
    { id: 'trade-history', name: 'Trade History', description: 'Recent trades' },
    { id: 'alerts', name: 'Alerts', description: 'System notifications' },
  ],
  trade: [
    { id: 'chart', name: 'Chart', description: 'Price chart' },
    { id: 'trade-entry', name: 'Trade Entry', description: 'Execute trades' },
    { id: 'limit-orders', name: 'Limit Orders', description: 'Open limit orders' },
    { id: 'trade-history', name: 'Trade History', description: 'Recent trades' },
  ],
  bots: [
    { id: 'active-bots', name: 'Active Bots', description: 'Running strategies' },
    { id: 'bot-creator', name: 'Bot Creator', description: 'Create new bots' },
    { id: 'bot-preview', name: 'Bot Preview', description: 'Strategy preview' },
    { id: 'trade-history', name: 'Trade History', description: 'Bot trade history' },
  ],
  dlmm: [
    { id: 'dlmm-pools', name: 'DLMM Pools', description: 'Available pools' },
    { id: 'dlmm-favorites', name: 'Favorites', description: 'Saved pools' },
    { id: 'dlmm-positions', name: 'Positions', description: 'Your LP positions' },
    { id: 'dlmm-strategy', name: 'Strategy', description: 'Create position' },
    { id: 'alerts', name: 'Alerts', description: 'System notifications' },
  ],
  copytrade: [
    { id: 'whale-tracker', name: 'Whale Tracker', description: 'Track whale wallets' },
    { id: 'signal-feed', name: 'Signal Feed', description: 'Copy trade signals' },
    { id: 'alerts', name: 'Alerts', description: 'System notifications' },
  ],
  sniper: [
    { id: 'token-sniper', name: 'Token Sniper', description: 'Sniper settings' },
    { id: 'active-positions', name: 'Active Positions', description: 'Sniped token positions' },
    { id: 'detected-tokens', name: 'Detected Tokens', description: 'New token alerts' },
    { id: 'alerts', name: 'Alerts', description: 'System notifications' },
  ],
  arb: [
    { id: 'add-pair', name: 'Add Pair', description: 'Add new pairs to monitor' },
    { id: 'pair-selector', name: 'Monitored Pairs', description: 'List of monitored pairs' },
    { id: 'arb-control', name: 'Arb Engine', description: 'Engine controls and settings' },
    { id: 'price-matrix', name: 'Price Matrix', description: 'Cross-venue price comparison' },
    { id: 'opportunities', name: 'Opportunities', description: 'Detected arb opportunities' },
  ],
  yield: [
    { id: 'yield-opportunities', name: 'Opportunities', description: 'Yield farming options' },
    { id: 'yield-positions', name: 'Positions', description: 'Active yield positions' },
    { id: 'alerts', name: 'Alerts', description: 'System notifications' },
  ],
  liquidity: [
    { id: 'protocol-selector', name: 'Protocol', description: 'Select Orca, Meteora, or all' },
    { id: 'liquidity-favorites', name: 'Favorites', description: 'Your favorite pools' },
    { id: 'liquidity-pools', name: 'Pools', description: 'Available liquidity pools' },
    { id: 'liquidity-positions', name: 'Positions', description: 'Your LP positions' },
    { id: 'create-position', name: 'Create Position', description: 'Open new LP position' },
    { id: 'rebalance-manager', name: 'Rebalance', description: 'Auto-rebalance settings' },
  ],
  skr: [
    { id: 'skr-stats', name: 'Staking Stats', description: 'Total staked and staker count' },
    { id: 'skr-chart', name: 'Net Staked Chart', description: 'Staking trend over time' },
    { id: 'skr-events', name: 'Staking Feed', description: 'Real-time stake/unstake events' },
    { id: 'skr-whales', name: 'Whale View', description: 'Top SKR stakers leaderboard' },
  ],
  control: [
    { id: 'service-monitor', name: 'Service Monitor', description: 'Backend service status' },
    { id: 'trading-modules', name: 'Trading Modules', description: 'Trading service controls' },
    { id: 'connection-monitor', name: 'Connections', description: 'gRPC, RabbitStream & sidecar latency' },
    { id: 'alerts', name: 'Alerts', description: 'System notifications' },
  ],
}

interface LayoutState {
  // Layout state per page
  layouts: Record<string, Layouts>
  currentPage: string
  isEditMode: boolean
  // Hidden widgets per page
  hiddenWidgets: Record<string, string[]>

  // Actions
  setLayouts: (page: string, layouts: Layouts) => void
  setCurrentPage: (page: string) => void
  setEditMode: (isEdit: boolean) => void
  resetLayout: (page: string) => void
  updateLayout: (page: string, newLayout: Layout[], breakpoint: string) => void
  // Widget visibility actions
  hideWidget: (page: string, widgetId: string) => void
  showWidget: (page: string, widgetId: string) => void
  toggleWidget: (page: string, widgetId: string) => void
  isWidgetVisible: (page: string, widgetId: string) => boolean
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      layouts: {},
      currentPage: 'dashboard',
      isEditMode: false,
      hiddenWidgets: {},

      setLayouts: (page, layouts) =>
        set((state) => ({
          layouts: { ...state.layouts, [page]: layouts },
        })),

      setCurrentPage: (page) => set({ currentPage: page }),

      setEditMode: (isEdit) => set({ isEditMode: isEdit }),

      resetLayout: (page) =>
        set((state) => {
          const defaults = pageLayouts[page] || defaultDashboardLayouts
          return {
            layouts: { ...state.layouts, [page]: defaults },
            hiddenWidgets: { ...state.hiddenWidgets, [page]: [] },
          }
        }),

      updateLayout: (page, newLayout, breakpoint) =>
        set((state) => {
          const currentLayouts = state.layouts[page] || pageLayouts[page] || defaultDashboardLayouts
          return {
            layouts: {
              ...state.layouts,
              [page]: {
                ...currentLayouts,
                [breakpoint]: newLayout,
              },
            },
          }
        }),

      hideWidget: (page, widgetId) =>
        set((state) => {
          const current = state.hiddenWidgets[page] || []
          if (current.includes(widgetId)) return state
          return {
            hiddenWidgets: {
              ...state.hiddenWidgets,
              [page]: [...current, widgetId],
            },
          }
        }),

      showWidget: (page, widgetId) =>
        set((state) => {
          const current = state.hiddenWidgets[page] || []
          return {
            hiddenWidgets: {
              ...state.hiddenWidgets,
              [page]: current.filter((id) => id !== widgetId),
            },
          }
        }),

      toggleWidget: (page, widgetId) => {
        const state = get()
        const current = state.hiddenWidgets[page] || []
        if (current.includes(widgetId)) {
          state.showWidget(page, widgetId)
        } else {
          state.hideWidget(page, widgetId)
        }
      },

      isWidgetVisible: (page, widgetId) => {
        const state = get()
        const hidden = state.hiddenWidgets[page] || []
        return !hidden.includes(widgetId)
      },
    }),
    {
      name: 'tactix-layouts',
      version: 5, // Bump this when adding new widgets to force layout refresh
      partialize: (state) => ({ layouts: state.layouts, hiddenWidgets: state.hiddenWidgets }),
      migrate: (persistedState: any, version: number) => {
        if (version < 3) {
          return {
            ...persistedState,
            layouts: {
              ...persistedState?.layouts,
              skr: undefined,
            },
          }
        }
        if (version < 4) {
          // Reset control page layout to pick up new ConnectionMonitor widget
          return {
            ...persistedState,
            layouts: {
              ...persistedState?.layouts,
              control: undefined,
            },
          }
        }
        if (version < 5) {
          // Reset sniper page layout to pick up new ActivePositions widget
          return {
            ...persistedState,
            layouts: {
              ...persistedState?.layouts,
              sniper: undefined,
            },
          }
        }
        return persistedState
      },
    }
  )
)
