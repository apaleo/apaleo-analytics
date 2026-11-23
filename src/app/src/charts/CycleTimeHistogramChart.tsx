import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { useI18n } from '../ui/i18n.tsx'
import { AXIS_TICK, CHART_MARGIN, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame } from './ChartFrame.tsx'
import { projectCycleTimeHistogram } from './cycleTimeHistogram.ts'
import { renderBinTip } from './tips.tsx'
import { fill, percentileSentence } from './text.ts'
import { useAsOf } from './useAsOf.ts'

export function CycleTimeHistogramChart({
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
  const series = projectCycleTimeHistogram(items, stages, when)
  const summary = [
    series.sampleSize === 0 ? null : fill(t('completedCount'), [series.sampleSize]),
    t('cycleTimeHint'),
    series.sampleSize === 0 ? null : percentileSentence(series.percentiles, t('percentileNeed'), t('percentileList')),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.bins.length > 0 ? undefined : items.length === 0 ? t('noItems') : t('noCompletedItems')

  return (
    <ChartFrame
      chartId="cycle-time-histogram"
      title={t('chart.cycleTimeHistogram')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisFrequency'), t('axisCycleTime')])}
      empty={empty}
    >
      {empty === undefined ? (
        <BarChart data={series.bins} margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="value" tick={AXIS_TICK} stroke="var(--aa-border)" />
          <YAxis allowDecimals={false} width={44} tick={AXIS_TICK} stroke="var(--aa-border)" />
          <Tooltip content={(props) => renderBinTip(props, t, 'cycleBin')} wrapperStyle={TIP_WRAPPER} />
          <Bar dataKey="count" fill="var(--aa-accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      ) : undefined}
    </ChartFrame>
  )
}
