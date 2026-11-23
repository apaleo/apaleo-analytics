import type { ReactElement, ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'
import type { ChartId } from '../ui/charts.ts'

export function ChartFrame({
  chartId,
  title,
  summary,
  caption,
  empty,
  toolbar,
  legend,
  plot,
  children,
}: {
  chartId: ChartId
  title: string
  summary: string
  caption?: string
  empty?: string
  toolbar?: ReactNode
  legend?: ReactNode
  /** A sized graphic that is not a Recharts chart, such as the heat map grid. */
  plot?: ReactNode
  children?: ReactElement
}) {
  const hasGraphic = children !== undefined || plot !== undefined
  return (
    <section className="chart-view" data-chart={chartId}>
      <h1 className="view-title">{title}</h1>
      <p className="chart-view__summary">{summary}</p>
      {toolbar}
      {empty !== undefined || !hasGraphic ? (
        <p className="chart-view__empty">{empty}</p>
      ) : (
        <>
          {caption === undefined ? null : <p className="chart-view__axes">{caption}</p>}
          <div className="chart-view__plot">
            {plot !== undefined ? (
              plot
            ) : children !== undefined ? (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height: 380 }}>
                {children}
              </ResponsiveContainer>
            ) : null}
          </div>
          {legend}
        </>
      )}
    </section>
  )
}

export function SwatchLegend({
  items,
  shape = 'circle',
}: {
  items: readonly { key: string; label: string; color: string }[]
  shape?: 'circle' | 'square'
}) {
  return (
    <ul className="chart-view__legend">
      {items.map((item) => (
        <li key={item.key}>
          <span
            className={shape === 'square' ? 'chart-view__swatch chart-view__swatch--square' : 'chart-view__swatch'}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
