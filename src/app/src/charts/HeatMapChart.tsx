import { useState } from 'react'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import type { MessageKey } from '../ui/i18n.tsx'
import { useI18n } from '../ui/i18n.tsx'
import { ChartFrame, SwatchLegend } from './ChartFrame.tsx'
import { projectHeatMap, type HeatMapSeries } from './heatMap.ts'
import { formatShortIso } from './metrics.ts'
import { fill } from './text.ts'
import { useAsOf } from './useAsOf.ts'

const WEEKDAYS = [
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
  'weekday.sun',
] as const satisfies readonly MessageKey[]

export function HeatMapChart({
  items,
  stages,
  asOf,
}: {
  items: readonly WorkItem[]
  stages: readonly WorkflowStage[]
  asOf?: Date
}) {
  const { t } = useI18n()
  const when = useAsOf(asOf)
  const series = projectHeatMap(items, stages, when)
  const summary = [
    series.total === 0 ? null : fill(t('heatSummary'), [series.total, series.weeks.length]),
    t('heatHint'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.total > 0 ? undefined : items.length === 0 ? t('noItems') : t('noCompletedItems')

  return (
    <ChartFrame
      chartId="heat-map"
      title={t('chart.heatMap')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisWeekday'), t('axisWeek')])}
      empty={empty}
      legend={
        <SwatchLegend
          shape="square"
          items={[
            { key: 'low', label: t('heatLow'), color: 'color-mix(in srgb, var(--aa-chart-1) 18%, var(--aa-row))' },
            { key: 'high', label: t('heatHigh'), color: 'var(--aa-chart-1)' },
          ]}
        />
      }
      plot={empty === undefined ? <HeatMapGrid series={series} /> : undefined}
    />
  )
}

function HeatMapGrid({ series }: { series: HeatMapSeries }) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<{ date: string; count: number } | null>(null)
  const detail =
    picked === null ? t('heatHover') : fill(t('heatDetail'), [formatShortIso(picked.date), picked.count])

  return (
    <div className="heat-map-layout">
      <div className="heat-map-scroll">
        <div
          className="heat-map"
          style={{ gridTemplateColumns: `52px repeat(${series.weeks.length}, minmax(14px, 1fr))` }}
          role="grid"
          aria-label={t('chart.heatMap')}
        >
          <span />
          {series.weeks.map((week, index) => (
            <span key={week} className="heat-map__week" title={formatShortIso(week)}>
              {weekLabel(series.weeks, index)}
            </span>
          ))}
          {WEEKDAYS.map((key, weekday) => (
            <WeekRow
              key={key}
              label={t(key)}
              counts={series.counts[weekday] ?? []}
              dates={series.dates[weekday] ?? []}
              max={series.max}
              onPick={setPicked}
            />
          ))}
        </div>
      </div>
      <p className="heat-map__detail">{detail}</p>
    </div>
  )
}

function WeekRow({
  label,
  counts,
  dates,
  max,
  onPick,
}: {
  label: string
  counts: readonly number[]
  dates: readonly string[]
  max: number
  onPick: (cell: { date: string; count: number }) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <span className="heat-map__day">{label}</span>
      {dates.map((date, index) => {
        const count = counts[index] ?? 0
        const name = fill(t('heatDetail'), [formatShortIso(date), count])
        return (
          <button
            key={date}
            type="button"
            className="heat-map__cell"
            style={{ background: heatColor(count, max) }}
            data-date={date}
            data-count={count}
            title={name}
            aria-label={name}
            onMouseEnter={() => onPick({ date, count })}
            onFocus={() => onPick({ date, count })}
          />
        )
      })}
    </>
  )
}

function weekLabel(weeks: readonly string[], index: number): string {
  const week = weeks[index]
  if (week === undefined) return ''
  const previous = weeks[index - 1]
  if (index !== 0 && previous !== undefined && previous.slice(0, 7) === week.slice(0, 7)) return ''
  return formatShortIso(week)
}

/** Zero stays the row color. Larger counts mix in more of the chart color. */
function heatColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return 'var(--aa-row)'
  const mix = Math.round(18 + (82 * count) / max)
  return `color-mix(in srgb, var(--aa-chart-1) ${mix}%, var(--aa-row))`
}
