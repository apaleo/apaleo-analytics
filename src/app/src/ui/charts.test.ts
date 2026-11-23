import { describe, expect, it } from 'vitest'
import { CHARTS, DEFAULT_CHART_ID } from './charts.ts'
import { messages } from './i18n.tsx'

describe('analytics chrome catalog', () => {
  it('lists the thirteen views and opens Dashboard', () => {
    expect(CHARTS.map((chart) => chart.id)).toEqual([
      'dashboard',
      'cycle-time-scatterplot',
      'cycle-time-histogram',
      'throughput-histogram',
      'cumulative-flow',
      'monte-carlo-how-many',
      'monte-carlo-when',
      'aging-wip',
      'flow-efficiency',
      'heat-map',
      'throughput-run',
      'wip-run',
      'source-data',
    ])
    expect(DEFAULT_CHART_ID).toBe('dashboard')
    expect(CHARTS.map((chart) => messages.en[chart.labelKey])).toEqual([
      'Dashboard',
      'Cycle Time Scatterplot',
      'Cycle Time Histogram',
      'Throughput Histogram',
      'Cumulative Flow Diagram',
      'Monte Carlo: How Many',
      'Monte Carlo: When',
      'Aging Work In Progress',
      'Flow Efficiency',
      'Heat Map',
      'Throughput Run Chart',
      'WIP Run Chart',
      'Source Data',
    ])
  })

  it('keeps english chrome labels', () => {
    expect(messages.en.data).toBe('Data')
    expect(messages.en.export).toBe('Export')
    expect(messages.en.settings).toBe('Settings')
    expect('info' in messages.en).toBe(false)
    expect(Object.keys(messages)).toEqual(['en'])
    for (const chart of CHARTS) {
      expect(messages.en[chart.labelKey].length).toBeGreaterThan(0)
    }
  })
})
