import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { useI18n } from '../ui/i18n.tsx'
import { AXIS_TICK, CHART_MARGIN, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame } from './ChartFrame.tsx'
import { projectFlowEfficiency } from './flowEfficiency.ts'
import { renderBinTip } from './tips.tsx'
import { fill, formatDays } from './text.ts'
import { useAsOf } from './useAsOf.ts'

export function FlowEfficiencyChart({
  items,
  stages,
  useBlockedDays,
  asOf,
}: {
  items: readonly WorkItem[]
  stages: readonly WorkflowStage[]
  useBlockedDays: boolean
  asOf?: Date
}) {
  const { t } = useI18n()
  const when = useAsOf(asOf)
  const series = projectFlowEfficiency(items, stages, when, useBlockedDays)
  const summary = [
    series.sampleSize === 0
      ? null
      : fill(t('flowSummary'), [
          formatDays(series.averagePercent),
          series.sampleSize,
          formatDays(series.activeDays),
          formatDays(series.waitDays),
        ]),
    items.length === 0 ? null : t(series.basis === 'blocked' ? 'flowBlockedHint' : 'flowStageHint'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.bins.length > 0 ? undefined : items.length === 0 ? t('noItems') : t('noCompletedItems')

  return (
    <ChartFrame
      chartId="flow-efficiency"
      title={t('chart.flowEfficiency')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisFrequency'), t('axisFlowPercent')])}
      empty={empty}
    >
      {empty === undefined ? (
        <BarChart data={series.bins} margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="value" tick={AXIS_TICK} stroke="var(--aa-border)" />
          <YAxis allowDecimals={false} width={44} tick={AXIS_TICK} stroke="var(--aa-border)" />
          <Tooltip content={(props) => renderBinTip(props, t, 'flowBin')} wrapperStyle={TIP_WRAPPER} />
          <Bar dataKey="count" fill="var(--aa-chart-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      ) : undefined}
    </ChartFrame>
  )
}
