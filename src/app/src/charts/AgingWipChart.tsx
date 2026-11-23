import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import type { MessageKey } from '../ui/i18n.tsx'
import { useI18n } from '../ui/i18n.tsx'
import { AGE_BANDS, projectAgingWip, type AgeBand, type AgingPoint } from './agingWip.ts'
import { AXIS_TICK, BAND_COLOR, CHART_MARGIN, percentileColor, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame, SwatchLegend } from './ChartFrame.tsx'
import { pointFrom, type ChartTipProps } from './tips.tsx'
import { axisTop, fill } from './text.ts'
import { useAsOf } from './useAsOf.ts'

const PERCENTILE_LABEL: Record<AgeBand, MessageKey> = {
  within50: 'band.within50',
  within70: 'band.within70',
  within85: 'band.within85',
  within95: 'band.within95',
  beyond: 'band.beyond',
}

const FIXED_LABEL: Record<AgeBand, MessageKey> = {
  within50: 'band.days7',
  within70: 'band.days14',
  within85: 'band.days30',
  within95: 'band.days60',
  beyond: 'band.days61',
}

export function AgingWipChart({
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
  const series = projectAgingWip(items, stages, when)
  const labels = series.coloring === 'percentile' ? PERCENTILE_LABEL : FIXED_LABEL
  const summary = [
    series.points.length === 0 ? null : fill(t('agingCount'), [series.points.length]),
    t('agingAge'),
    series.coloring === 'percentile' ? t('agingColorPercentile') : t('agingColorFixed'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = series.points.length > 0 ? undefined : items.length === 0 ? t('noItems') : t('noOpenItems')
  const plotted = withPlotX(series.points)
  const yValues = [
    ...series.points.map((point) => point.ageDays),
    ...series.percentiles.map((level) => level.days),
  ]

  return (
    <ChartFrame
      chartId="aging-wip"
      title={t('chart.agingWip')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('axisAge'), t('axisStage')])}
      empty={empty}
      legend={
        <SwatchLegend
          items={AGE_BANDS.map((band) => ({ key: band, label: t(labels[band]), color: BAND_COLOR[band] }))}
        />
      }
    >
      {empty === undefined ? (
        <ScatterChart margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[-0.5, Math.max(series.stages.length - 0.5, 0.5)]}
            ticks={series.stages.map((stage) => stage.index)}
            tickFormatter={(value) => series.stages.find((stage) => stage.index === Number(value))?.name ?? ''}
            interval={0}
            angle={-28}
            textAnchor="end"
            height={72}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={[0, axisTop(yValues)]}
            allowDecimals={false}
            width={44}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
          />
          <Tooltip content={(props) => renderAgingTip(props, t)} cursor={{ stroke: 'var(--aa-muted)' }} wrapperStyle={TIP_WRAPPER} />
          {series.percentiles.map((level) => (
            <ReferenceLine
              key={level.percentile}
              y={level.days}
              stroke={percentileColor(level.percentile)}
              strokeDasharray="5 4"
              label={{ value: `${level.percentile}%`, position: 'right', fill: 'var(--aa-muted)', fontSize: 11 }}
            />
          ))}
          {AGE_BANDS.map((band) => {
            const data = plotted.filter((point) => point.band === band)
            if (data.length === 0) return null
            return <Scatter key={band} data={data} fill={BAND_COLOR[band]} isAnimationActive={false} />
          })}
        </ScatterChart>
      ) : undefined}
    </ChartFrame>
  )
}

function withPlotX(points: readonly AgingPoint[]): (AgingPoint & { x: number; y: number })[] {
  const counts = new Map<number, number>()
  for (const point of points) counts.set(point.stageIndex, (counts.get(point.stageIndex) ?? 0) + 1)
  const seen = new Map<number, number>()
  return points.map((point) => {
    const count = counts.get(point.stageIndex) ?? 1
    const order = seen.get(point.stageIndex) ?? 0
    seen.set(point.stageIndex, order + 1)
    const width = count <= 1 ? 0 : Math.min(0.5, 0.12 * (count - 1))
    const x = count <= 1 ? point.stageIndex : point.stageIndex - width / 2 + (width * order) / (count - 1)
    return { ...point, x, y: point.ageDays }
  })
}

function renderAgingTip(props: ChartTipProps, t: (key: MessageKey) => string) {
  if (!props.active) return null
  const point = pointFrom<AgingPoint>(props.payload)
  if (point === undefined || typeof point.ageDays !== 'number') return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{point.id}</p>
      {point.title === undefined ? null : <p>{point.title}</p>}
      <p>{point.stageName}</p>
      <p>
        {point.ageDays} {t('dayUnit')}
      </p>
      {point.stageAgeDays === point.ageDays ? null : <p>{fill(t('stageAge'), [point.stageAgeDays])}</p>}
    </div>
  )
}
