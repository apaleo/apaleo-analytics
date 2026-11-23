import type { CSSProperties } from 'react'
import type { AgeBand } from './agingWip.ts'

export const BAND_COLOR: Record<AgeBand, string> = {
  within50: 'var(--aa-chart-1)',
  within70: 'var(--aa-chart-2)',
  within85: 'var(--aa-chart-3)',
  within95: 'var(--aa-chart-4)',
  beyond: 'var(--aa-chart-5)',
}

export const AXIS_TICK = { fill: 'var(--aa-muted)', fontSize: 12, fontFamily: 'inherit' }

export const CHART_MARGIN = { top: 12, right: 52, bottom: 8, left: 4 }

export const TIP_WRAPPER: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  boxShadow: 'none',
}

export function stageColor(index: number): string {
  return `var(--aa-chart-${(index % 5) + 1})`
}

export function percentileColor(percentile: number): string {
  if (percentile === 50) return 'var(--aa-chart-1)'
  if (percentile === 70) return 'var(--aa-chart-2)'
  if (percentile === 85) return 'var(--aa-chart-3)'
  if (percentile === 95) return 'var(--aa-chart-4)'
  return 'var(--aa-muted)'
}
