import { useMemo, useState, type ReactNode } from 'react'
import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import { useI18n } from '../../ui/i18n.tsx'
import { ChartFrame } from '../ChartFrame.tsx'
import { formatShortIso } from '../metrics.ts'
import { fill, formatDays } from '../text.ts'
import { useAsOf } from '../useAsOf.ts'
import { projectDashboardFlow, projectDashboardForecast } from './dashboard.ts'
import { DASHBOARD_PERCENTILE, FORECAST_PERCENTILES } from './simulate.ts'

export function DashboardChart({
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
  const [percentile, setPercentile] = useState(DASHBOARD_PERCENTILE)
  const flow = useMemo(
    () => projectDashboardFlow(items, stages, when, percentile),
    [items, stages, when, percentile],
  )
  const forecast = useMemo(() => projectDashboardForecast(items, stages, when), [items, stages, when])
  const stability =
    flow.predictability === 'stable'
      ? t('dashStable')
      : flow.predictability === 'moderate'
        ? t('dashModerate')
        : flow.predictability === 'variable'
          ? t('dashVariable')
          : t('dashStabilityEmpty')

  return (
    <ChartFrame
      chartId="dashboard"
      title={t('chart.dashboard')}
      summary={t('dashSummary')}
      empty={items.length === 0 ? t('noItems') : undefined}
      plot={
        items.length === 0 ? undefined : (
          <div className="metric-grid">
            <MetricCard
              metric="cycle-time"
              label={t('dashCycleTime')}
              value={
                flow.medianCycleDays === undefined ? '—' : fill(t('dashDays'), [formatDays(flow.medianCycleDays)])
              }
              detail={
                flow.selectedCycleDays === undefined
                  ? t('noCompletedItems')
                  : fill(t('dashCycleDetail'), [percentile, formatDays(flow.selectedCycleDays), flow.completed])
              }
              extra={
                <label className="metric-card__percentile">
                  <span>{t('dashPercentile')}</span>
                  <select value={percentile} onChange={(event) => setPercentile(Number(event.target.value))}>
                    {FORECAST_PERCENTILES.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              }
            />
            <MetricCard
              metric="wip"
              label={t('dashWip')}
              value={String(flow.wip)}
              detail={t('dashWipDetail')}
            />
            <MetricCard
              metric="how-many"
              label={t('dashHowMany')}
              value={forecast.howManyItems === undefined ? '—' : fill(t('dashHowManyValue'), [forecast.howManyItems])}
              detail={
                forecast.howManyItems === undefined
                  ? t('mcNoThroughput')
                  : fill(t('dashHowManyDetail'), [forecast.lookaheadDays])
              }
            />
            <MetricCard
              metric="stability"
              label={t('dashStability')}
              value={flow.cv === undefined ? '—' : fill(t('dashCv'), [formatCv(flow.cv)])}
              detail={stability}
            />
            <MetricCard
              metric="when"
              label={t('dashWhen')}
              value={forecast.whenDays === undefined ? '—' : fill(t('dashDays'), [forecast.whenDays])}
              detail={
                forecast.wip === 0
                  ? t('dashWhenIdle')
                  : forecast.whenDate === undefined
                    ? t('dashWhenEmpty')
                    : fill(t('dashWhenDetail'), [forecast.wip, formatShortIso(forecast.whenDate)])
              }
            />
          </div>
        )
      }
    />
  )
}

function MetricCard({
  metric,
  label,
  value,
  detail,
  extra,
}: {
  metric: string
  label: string
  value: string
  detail: string
  extra?: ReactNode
}) {
  return (
    <article className="metric-card" data-metric={metric}>
      <p className="metric-card__label">{label}</p>
      <p className="metric-card__value">{value}</p>
      <p className="metric-card__detail">{detail}</p>
      {extra}
    </article>
  )
}

function formatCv(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}
