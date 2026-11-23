import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import type { MessageKey } from '../ui/i18n.tsx'
import { useI18n } from '../ui/i18n.tsx'
import { AXIS_TICK, CHART_MARGIN, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame, SwatchLegend } from './ChartFrame.tsx'
import { formatShortIso } from './metrics.ts'
import { projectThroughputRun, type ThroughputRunPoint } from './throughputRun.ts'
import { pointFrom, type ChartTipProps } from './tips.tsx'
import { axisTop, fill, formatDays } from './text.ts'
import { useAsOf } from './useAsOf.ts'

export function ThroughputRunChart({
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
  const series = projectThroughputRun(items, stages, when)
  const summary = [
    series.sampleSize === 0
      ? null
      : fill(t('throughputRunSummary'), [series.sampleSize, series.dayCount, formatDays(series.average)]),
    t('throughputRunHint'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.points.length > 0 ? undefined : items.length === 0 ? t('noItems') : t('noCompletedItems')

  return (
    <ChartFrame
      chartId="throughput-run"
      title={t('chart.throughputRun')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisDailyThroughput'), t('axisDate')])}
      empty={empty}
      legend={
        <SwatchLegend
          items={[
            { key: 'daily', label: t('dailyThroughput'), color: 'var(--aa-chart-2)' },
            { key: 'trailing', label: t('trailingAverage'), color: 'var(--aa-chart-1)' },
          ]}
        />
      }
    >
      {empty === undefined ? (
        <LineChart data={series.points} margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => formatShortIso(String(value))}
            minTickGap={32}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
          />
          <YAxis
            domain={[0, axisTop(series.points.flatMap((point) => [point.count, point.trailing]))]}
            width={44}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
          />
          <Tooltip content={(props) => renderThroughputTip(props, t)} wrapperStyle={TIP_WRAPPER} />
          <Line
            type="linear"
            dataKey="count"
            name={t('dailyThroughput')}
            stroke="var(--aa-chart-2)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="trailing"
            name={t('trailingAverage')}
            stroke="var(--aa-chart-1)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      ) : undefined}
    </ChartFrame>
  )
}

function renderThroughputTip(props: ChartTipProps, t: (key: MessageKey) => string) {
  if (!props.active) return null
  const point = pointFrom<ThroughputRunPoint>(props.payload)
  if (point === undefined || typeof point.count !== 'number') return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{formatShortIso(point.date)}</p>
      <p>
        {point.count} · {t('dailyThroughput')}
      </p>
      <p>
        {t('trailingAverage')}: {formatDays(point.trailing)}
      </p>
    </div>
  )
}
