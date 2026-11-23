import type { MessageKey } from './i18n.tsx'

export const CHARTS = [
  { id: 'dashboard', labelKey: 'chart.dashboard' },
  { id: 'cycle-time-scatterplot', labelKey: 'chart.cycleTimeScatterplot' },
  { id: 'cycle-time-histogram', labelKey: 'chart.cycleTimeHistogram' },
  { id: 'throughput-histogram', labelKey: 'chart.throughputHistogram' },
  { id: 'cumulative-flow', labelKey: 'chart.cumulativeFlow' },
  { id: 'monte-carlo-how-many', labelKey: 'chart.monteCarloHowMany' },
  { id: 'monte-carlo-when', labelKey: 'chart.monteCarloWhen' },
  { id: 'aging-wip', labelKey: 'chart.agingWip' },
  { id: 'flow-efficiency', labelKey: 'chart.flowEfficiency' },
  { id: 'heat-map', labelKey: 'chart.heatMap' },
  { id: 'throughput-run', labelKey: 'chart.throughputRun' },
  { id: 'wip-run', labelKey: 'chart.wipRun' },
  { id: 'source-data', labelKey: 'chart.sourceData' },
] as const satisfies readonly { id: string; labelKey: MessageKey }[]

export type ChartId = (typeof CHARTS)[number]['id']

export const DEFAULT_CHART_ID: ChartId = 'aging-wip'
