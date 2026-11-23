import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import type { MessageKey } from '../ui/i18n.tsx'
import { useI18n } from '../ui/i18n.tsx'
import { AXIS_TICK, CHART_MARGIN, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame } from './ChartFrame.tsx'
import { formatShortIso } from './metrics.ts'
import { pointFrom, type ChartTipProps } from './tips.tsx'
import { axisTop, fill, formatDays } from './text.ts'
import { useAsOf } from './useAsOf.ts'
import { projectWipRun, type WipRunPoint } from './wipRun.ts'

export function WipRunChart({
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
  const series = projectWipRun(items, stages, when)
  const summary = [
    series.points.length === 0
      ? null
      : fill(t('wipRunSummary'), [formatDays(series.average), series.ending, formatShortIso(series.endingOn)]),
    t('wipRunHint'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.points.length > 0 ? undefined : items.length === 0 ? t('noItems') : t('noDatedItems')

  return (
    <ChartFrame
      chartId="wip-run"
      title={t('chart.wipRun')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisWipCount'), t('axisDate')])}
      empty={empty}
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
            domain={[0, axisTop(series.points.map((point) => point.wip))]}
            allowDecimals={false}
            width={44}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
          />
          <Tooltip content={(props) => renderWipTip(props, t)} wrapperStyle={TIP_WRAPPER} />
          <Line
            type="stepAfter"
            dataKey="wip"
            name={t('axisWipCount')}
            stroke="var(--aa-chart-2)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      ) : undefined}
    </ChartFrame>
  )
}

function renderWipTip(props: ChartTipProps, t: (key: MessageKey) => string) {
  if (!props.active) return null
  const point = pointFrom<WipRunPoint>(props.payload)
  if (point === undefined || typeof point.wip !== 'number') return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{formatShortIso(point.date)}</p>
      <p>
        {point.wip} · {t('axisWipCount')}
      </p>
    </div>
  )
}
