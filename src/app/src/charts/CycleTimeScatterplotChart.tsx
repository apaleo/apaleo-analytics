import { useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import type { MessageKey } from '../ui/i18n.tsx'
import { useI18n } from '../ui/i18n.tsx'
import {
  DEFAULT_SCATTER_TREND_INTERVAL,
  DEFAULT_SCATTER_TREND_PERCENTILE,
  SCATTER_TREND_PERCENTILES,
  isScatterTrendPercentile,
  readPreferences,
  updatePreferences,
  type ScatterTrendPercentile,
} from '../persistence/preferences.ts'
import { AXIS_TICK, CHART_MARGIN, percentileColor, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame } from './ChartFrame.tsx'
import { projectCycleTimeScatter, projectCycleTimeTrend, type CycleTimeTrendPoint } from './cycleTimeScatter.ts'
import { formatDayTick, type CompletedItem } from './metrics.ts'
import { type ChartTipProps } from './tips.tsx'
import { axisTop, fill, formatDays, percentileSentence } from './text.ts'
import { useAsOf } from './useAsOf.ts'

export function CycleTimeScatterplotChart({
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
  const [showTrend, setShowTrend] = useState(() => readPreferences().scatterShowTrend ?? false)
  const [trendPercent, setTrendPercent] = useState<ScatterTrendPercentile>(
    () => readPreferences().scatterTrendPercentile ?? DEFAULT_SCATTER_TREND_PERCENTILE,
  )
  const [trendInterval, setTrendInterval] = useState(
    () => readPreferences().scatterTrendInterval ?? DEFAULT_SCATTER_TREND_INTERVAL,
  )
  const series = projectCycleTimeScatter(items, stages, when)
  const trend = showTrend ? projectCycleTimeTrend(series.points, trendPercent, trendInterval) : []
  const shared = trend.findIndex((point) => !point.warmup)
  const warmup = shared < 0 ? trend : trend.slice(0, shared + 1)
  const solid = shared < 0 ? [] : trend.slice(shared)
  const summary = [
    series.points.length === 0 ? null : fill(t('completedCount'), [series.points.length]),
    t('cycleTimeHint'),
    series.points.length === 0 ? null : percentileSentence(series.percentiles, t('percentileNeed'), t('percentileList')),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.points.length > 0 ? undefined : items.length === 0 ? t('noItems') : t('noCompletedItems')
  const yValues = [
    ...series.points.map((point) => point.cycleTimeDays),
    ...series.percentiles.map((level) => level.days),
    ...trend.map((point) => point.days),
  ]

  return (
    <ChartFrame
      chartId="cycle-time-scatterplot"
      title={t('chart.cycleTimeScatterplot')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisCycleTime'), t('axisCompletion')])}
      empty={empty}
      toolbar={
        <TrendToolbar
          showTrend={showTrend}
          percent={trendPercent}
          interval={trendInterval}
          onShowTrend={(checked) => {
            setShowTrend(checked)
            updatePreferences({ scatterShowTrend: checked })
          }}
          onPercent={(value) => {
            const next = Number(value)
            if (!isScatterTrendPercentile(next)) return
            setTrendPercent(next)
            updatePreferences({ scatterTrendPercentile: next })
          }}
          onInterval={(value) => {
            const next = Number.parseInt(value, 10)
            if (!Number.isInteger(next) || next < 1) return
            setTrendInterval(next)
            updatePreferences({ scatterTrendInterval: next })
          }}
        />
      }
    >
      {empty === undefined ? (
        <ComposedChart margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="completedDay"
            type="number"
            domain={dayDomain(series.points.map((point) => point.completedDay))}
            tickFormatter={(value) => formatDayTick(Number(value))}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
            minTickGap={28}
          />
          <YAxis
            dataKey="cycleTimeDays"
            type="number"
            domain={[0, axisTop(yValues)]}
            allowDecimals={false}
            width={44}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
          />
          <Tooltip content={(props) => renderCycleTip(props, t)} cursor={{ stroke: 'var(--aa-muted)' }} wrapperStyle={TIP_WRAPPER} />
          {series.percentiles.map((level) => (
            <ReferenceLine
              key={level.percentile}
              y={level.days}
              stroke={percentileColor(level.percentile)}
              strokeDasharray="5 4"
              label={{
                value: `${level.percentile}% ${formatDays(level.days)}`,
                position: 'right',
                fill: 'var(--aa-muted)',
                fontSize: 11,
              }}
            />
          ))}
          <Scatter data={series.points} dataKey="cycleTimeDays" fill="var(--aa-accent)" isAnimationActive={false} />
          {warmup.length > 0 ? <TrendLine points={warmup} opacity={0.4} /> : null}
          {solid.length > 0 ? <TrendLine points={solid} opacity={1} /> : null}
        </ComposedChart>
      ) : undefined}
    </ChartFrame>
  )
}

function TrendLine({ points, opacity }: { points: CycleTimeTrendPoint[]; opacity: number }) {
  return (
    <Line
      className="cycle-time-trend"
      data={points}
      dataKey="days"
      type="linear"
      stroke="var(--aa-chart-1)"
      strokeOpacity={opacity}
      strokeWidth={4}
      strokeDasharray="4 1"
      dot={false}
      activeDot={false}
      isAnimationActive={false}
      tooltipType="none"
      legendType="none"
    />
  )
}

function TrendToolbar({
  showTrend,
  percent,
  interval,
  onShowTrend,
  onPercent,
  onInterval,
}: {
  showTrend: boolean
  percent: ScatterTrendPercentile
  interval: number
  onShowTrend: (checked: boolean) => void
  onPercent: (value: string) => void
  onInterval: (value: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="scatter-trend">
      <p className="scatter-trend__title">{t('trendTitle')}</p>
      <div className="mc-controls">
        <label className="mc-control mc-control--check">
          <input type="checkbox" checked={showTrend} onChange={(event) => onShowTrend(event.target.checked)} />
          <span>{t('trendShow')}</span>
        </label>
        {showTrend ? (
          <>
            <label className="mc-control">
              <span>{t('trendPercentile')}</span>
              <select value={percent} onChange={(event) => onPercent(event.target.value)}>
                {SCATTER_TREND_PERCENTILES.map((option) => (
                  <option key={option} value={option}>
                    {option}%
                  </option>
                ))}
              </select>
            </label>
            <label className="mc-control">
              <span>{t('trendInterval')}</span>
              <span className="mc-control__field">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={interval}
                  onChange={(event) => onInterval(event.target.value)}
                />
                <span className="mc-control__unit">{t('trendDays')}</span>
              </span>
            </label>
          </>
        ) : null}
      </div>
    </div>
  )
}

function dayDomain(days: readonly number[]): [number, number] {
  if (days.length === 0) return [0, 1]
  let min = days[0] ?? 0
  let max = min
  for (const day of days) {
    if (day < min) min = day
    if (day > max) max = day
  }
  const pad = min === max ? 3 : 1
  return [min - pad, max + pad]
}

function renderCycleTip(props: ChartTipProps, t: (key: MessageKey) => string) {
  if (!props.active) return null
  const point = completedPoint(props.payload)
  if (point === undefined) return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{point.id}</p>
      {point.title === undefined ? null : <p>{point.title}</p>}
      <p>{point.completedOn}</p>
      <p>
        {point.cycleTimeDays} {t('dayUnit')}
      </p>
    </div>
  )
}

function completedPoint(payload: ChartTipProps['payload']): CompletedItem | undefined {
  if (payload === undefined) return undefined
  for (const entry of payload) {
    const value = entry.payload
    if (value === null || typeof value !== 'object' || !('cycleTimeDays' in value)) continue
    if (typeof value.cycleTimeDays !== 'number') continue
    return value as CompletedItem
  }
  return undefined
}
