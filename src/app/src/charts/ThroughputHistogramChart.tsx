import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { useI18n } from '../ui/i18n.tsx'
import { AXIS_TICK, CHART_MARGIN, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame } from './ChartFrame.tsx'
import { projectThroughputHistogram } from './throughputHistogram.ts'
import { renderBinTip } from './tips.tsx'
import { fill } from './text.ts'
import { useAsOf } from './useAsOf.ts'

export function ThroughputHistogramChart({
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
  const series = projectThroughputHistogram(items, stages, when)
  const summary = [
    series.sampleSize === 0 ? null : fill(t('throughputSummary'), [series.sampleSize, series.weekCount]),
    t('throughputHint'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.bins.length > 0 ? undefined : items.length === 0 ? t('noItems') : t('noCompletedItems')

  return (
    <ChartFrame
      chartId="throughput-histogram"
      title={t('chart.throughputHistogram')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisWeeks'), t('axisItemsPerWeek')])}
      empty={empty}
    >
      {empty === undefined ? (
        <BarChart data={series.bins} margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="value" tick={AXIS_TICK} stroke="var(--aa-border)" />
          <YAxis allowDecimals={false} width={44} tick={AXIS_TICK} stroke="var(--aa-border)" />
          <Tooltip content={(props) => renderBinTip(props, t, 'throughputBin')} wrapperStyle={TIP_WRAPPER} />
          <Bar dataKey="count" fill="var(--aa-blue)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      ) : undefined}
    </ChartFrame>
  )
}
