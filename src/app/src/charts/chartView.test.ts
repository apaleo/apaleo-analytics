/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { loadExampleDataset } from '../data/exampleDataset.ts'
import type { WorkItem } from '../domain/types.ts'
import { PREFERENCES_KEY } from '../persistence/preferences.ts'
import type { ChartId } from '../ui/charts.ts'
import { I18nProvider } from '../ui/i18n.tsx'
import { ChartView } from './ChartView.tsx'
import { projectCumulativeFlow } from './cumulativeFlow.ts'
import { formatShortIso } from './metrics.ts'

const dataset = loadExampleDataset(new Date(2026, 10, 11))

function renderChart(chartId: ChartId, items: readonly WorkItem[] = dataset.items) {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      children: createElement(ChartView, { chartId, dataset, items, stages: dataset.metadata.stages }),
    }),
  )
}

describe('chart view wiring', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('mounts the flow charts from the filtered items', () => {
    const charts = [
      'aging-wip',
      'cycle-time-scatterplot',
      'cycle-time-histogram',
      'throughput-histogram',
      'cumulative-flow',
      'flow-efficiency',
      'heat-map',
      'throughput-run',
      'wip-run',
      'monte-carlo-how-many',
      'monte-carlo-when',
      'dashboard',
    ] as const
    for (const chartId of charts) {
      const html = renderChart(chartId)
      expect(html).toContain(`data-chart="${chartId}"`)
      expect(html).not.toContain('Coming soon')
      expect(html).toContain('chart-view__plot')
    }
    expect(renderChart('aging-wip', [])).toContain('No work items match the current filters.')
    expect(renderChart('throughput-run', [])).toContain('No work items match the current filters.')
    expect(renderChart('heat-map')).toContain('data-date="2026-01-15"')
    expect(renderChart('monte-carlo-how-many', [])).toContain('No work items match the current filters.')
    expect(renderChart('monte-carlo-when', [])).toContain('No work items match the current filters.')
    expect(renderChart('dashboard', [])).toContain('No work items match the current filters.')
    expect(renderChart('dashboard')).toContain('data-metric="cycle-time"')
    expect(renderChart('dashboard')).toContain('data-metric="wip"')
    expect(renderChart('dashboard')).toContain('data-metric="how-many"')
    expect(renderChart('dashboard')).toContain('data-metric="stability"')
    expect(renderChart('dashboard')).toContain('data-metric="when"')
    const howMany = renderChart('monte-carlo-how-many')
    expect(howMany).toContain('percentile-table')
    expect(howMany).toContain('10K')
    expect(howMany).toContain('100K')
    expect(howMany).toContain('500K')
    expect(howMany).toContain('1M')
    expect(howMany).toContain('value="week"')
    expect(howMany).toContain('Items completed')
    expect(howMany).not.toMatch(/Include \d+ open items in workflow/)
    const when = renderChart('monte-carlo-when')
    expect(when).toContain('percentile-table')
    expect(when).toMatch(/Include \d+ open items in workflow/)
    expect(when).toContain('Extra items')
    expect(when).toContain('Occurrences × Finish date')
    expect(when).toContain('type="checkbox"')
    expect(when).toContain('checked=""')
    expect(when).not.toContain('Remaining items')
    const source = renderChart('source-data')
    expect(source).toContain('data-chart="source-data"')
    expect(source).toContain('Workflow columns')
    expect(source).toContain('source__table')
    expect(source).not.toContain('Coming soon')
  })

  it('keeps the cycle time trend off until preferences turn the line on', () => {
    localStorage.clear()
    const off = renderChartLive('cycle-time-scatterplot')
    expect(off).toContain('Cycle Time Trend')
    expect(off).toContain('Show Trend Line')
    expect(checkboxTag(off)).not.toContain('checked')
    expect(off).not.toContain('>Interval<')
    expect(off).not.toContain('stroke-dasharray="4 1"')

    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ scatterShowTrend: true, scatterTrendPercentile: 85, scatterTrendInterval: 10 }),
    )
    const on = renderChartLive('cycle-time-scatterplot')
    expect(checkboxTag(on)).toContain('checked')
    expect(on).toContain('>Percentile<')
    expect(on).toContain('>Interval<')
    expect(on).toContain('>days<')
    expect(on).toContain('cycle-time-trend')
    expect(on).toContain('stroke="var(--aa-chart-1)"')
    expect(on).toContain('stroke-width="4"')
    expect(on).toContain('stroke-dasharray="4 1"')
  })

  it('offers a cumulative flow date range and shortens the axis for a saved window', () => {
    localStorage.clear()
    const asOf = new Date()
    const full = projectCumulativeFlow(dataset.items, dataset.metadata.stages, asOf)
    const narrowed = projectCumulativeFlow(dataset.items, dataset.metadata.stages, asOf, '1m')
    expect(narrowed.points.length).toBeLessThan(full.points.length)
    expect((narrowed.points[0]?.date ?? '') > (full.points[0]?.date ?? '')).toBe(true)
    expect(narrowed.points.at(-1)?.date).toBe(full.points.at(-1)?.date)

    const all = mountChart('cumulative-flow')
    expect(optionLabels(all.html)).toEqual([
      'Last 1 month',
      'Last 3 months',
      'Last 6 months',
      'Last 1 year',
      'All time',
    ])
    expect(all.selectValue).toBe('all')
    expect(optionText(all.html, 'all')).toBe('All time')
    expect(cfdBound(all.html, 'start')).toBe(full.points[0]?.date)
    expect(cfdBound(all.html, 'end')).toBe(full.points.at(-1)?.date)
    expect(xAxisLabel(all.html)).toContain(formatShortIso(full.points.at(-1)?.date ?? ''))

    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ cfdTimeRange: '1m' }))
    const month = mountChart('cumulative-flow')
    expect(month.selectValue).toBe('1m')
    expect(optionText(month.html, '1m')).toBe('Last 1 month')
    expect(cfdBound(month.html, 'start')).toBe(narrowed.points[0]?.date)
    expect(cfdBound(month.html, 'end')).toBe(narrowed.points.at(-1)?.date)
    expect(xAxisLabel(month.html)).toContain(formatShortIso(narrowed.points.at(-1)?.date ?? ''))
    expect(plottedSpan(month.html)).toBeLessThan(plottedSpan(all.html))
  })
})

function renderChartLive(chartId: ChartId, items: readonly WorkItem[] = dataset.items) {
  return mountChart(chartId, items).html
}

function mountChart(chartId: ChartId, items: readonly WorkItem[] = dataset.items) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = QuietResizeObserver as unknown as typeof ResizeObserver
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 720,
      bottom: 380,
      width: 720,
      height: 380,
      toJSON() {
        return {}
      },
    }) as DOMRect
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      createElement(I18nProvider, {
        children: createElement(ChartView, { chartId, dataset, items, stages: dataset.metadata.stages }),
      }),
    )
  })
  const html = host.innerHTML
  const selectValue = host.querySelector('select')?.value ?? ''
  act(() => {
    root.unmount()
  })
  host.remove()
  return { html, selectValue }
}

class QuietResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function checkboxTag(html: string): string {
  return html.match(/<input type="checkbox"[^>]*>/)?.[0] ?? ''
}

function optionLabels(html: string): string[] {
  return [...html.matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map((match) => match[1] ?? '')
}

function optionText(html: string, value: string): string {
  const match = new RegExp(`<option\\b[^>]*\\bvalue="${value}"[^>]*>([^<]*)`).exec(html)
  return match?.[1] ?? ''
}

function cfdBound(html: string, edge: 'start' | 'end'): string {
  return new RegExp(`data-cfd-${edge}="([^"]*)"`).exec(html)?.[1] ?? ''
}

function xAxisLabel(html: string): string {
  const at = html.indexOf('recharts-xAxis-tick-labels')
  if (at < 0) return ''
  const slice = html.slice(at, at + 4000)
  const yAxis = slice.indexOf('recharts-yAxis')
  const axis = yAxis > 0 ? slice.slice(0, yAxis) : slice
  return [...axis.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1] ?? '').join(' ')
}

function plottedSpan(html: string): number {
  let most = 0
  for (const match of html.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)) {
    const xs = new Set<string>()
    for (const point of (match[1] ?? '').matchAll(/[ML](-?\d+(?:\.\d+)?),/g)) xs.add(point[1] ?? '')
    if (xs.size > most) most = xs.size
  }
  return most
}
