import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import type { MessageKey } from '../ui/i18n.tsx'
import { useI18n } from '../ui/i18n.tsx'
import {
  CFD_TIME_RANGES,
  isCfdTimeRange,
  readPreferences,
  updatePreferences,
  type CfdTimeRange,
} from '../persistence/preferences.ts'
import { AXIS_TICK, CHART_MARGIN, stageColor, TIP_WRAPPER } from './chartTheme.ts'
import { ChartFrame, SwatchLegend } from './ChartFrame.tsx'
import { cfdStackTopToBottom, projectCumulativeFlow } from './cumulativeFlow.ts'
import { formatShortIso } from './metrics.ts'
import type { ChartTipProps } from './tips.tsx'
import { fill } from './text.ts'
import { useAsOf } from './useAsOf.ts'

const CFD_RANGE_LABEL: Record<CfdTimeRange, MessageKey> = {
  '1m': 'cfdRange1m',
  '3m': 'cfdRange3m',
  '6m': 'cfdRange6m',
  '1y': 'cfdRange1y',
  all: 'cfdRangeAll',
}

export function CumulativeFlowChart({
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
  const [range, setRange] = useState<CfdTimeRange>(() => readPreferences().cfdTimeRange ?? 'all')
  const series = projectCumulativeFlow(items, stages, when, range)
  const stackTopToBottom = cfdStackTopToBottom(series.stages)
  const empty = series.points.length > 0 ? undefined : t(items.length === 0 ? 'noItems' : 'noCompletedItems')
  const rows = series.points.map((point) => {
    const row: Record<string, string | number> = { date: point.date }
    series.stages.forEach((stage, index) => {
      row[stage.key] = point.values[index] ?? 0
    })
    return row
  })

  return (
    <ChartFrame
      chartId="cumulative-flow"
      title={t('chart.cumulativeFlow')}
      summary={t('cfdSummary')}
      caption={fill(t('axisCaption'), [t('axisItems'), t('axisDate')])}
      empty={empty}
      toolbar={
        <div
          className="mc-controls"
          data-cfd-start={series.points[0]?.date ?? ''}
          data-cfd-end={series.points.at(-1)?.date ?? ''}
        >
          <label className="mc-control">
            <span>{t('cfdDateRange')}</span>
            <select
              value={range}
              onChange={(event) => {
                const next = event.target.value
                if (!isCfdTimeRange(next)) return
                setRange(next)
                updatePreferences({ cfdTimeRange: next })
              }}
            >
              {CFD_TIME_RANGES.map((option) => (
                <option key={option} value={option}>
                  {t(CFD_RANGE_LABEL[option])}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      legend={
        <SwatchLegend
          shape="square"
          items={stackTopToBottom.map((stage) => ({
            key: stage.key,
            label: stage.name,
            color: stageColor(series.stages.findIndex((candidate) => candidate.key === stage.key)),
          }))}
        />
      }
    >
      {empty === undefined ? (
        <AreaChart data={rows} margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => formatShortIso(String(value))}
            minTickGap={32}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
          />
          <YAxis allowDecimals={false} width={44} tick={AXIS_TICK} stroke="var(--aa-border)" />
          <Tooltip content={(props) => renderFlowTip(props)} wrapperStyle={TIP_WRAPPER} />
          {[...stackTopToBottom].reverse().map((stage) => {
            const color = stageColor(series.stages.findIndex((candidate) => candidate.key === stage.key))
            return (
              <Area
                key={stage.key}
                type="stepAfter"
                dataKey={stage.key}
                name={stage.name}
                stackId="flow"
                stroke={color}
                fill={color}
                fillOpacity={0.82}
                isAnimationActive={false}
              />
            )
          })}
        </AreaChart>
      ) : undefined}
    </ChartFrame>
  )
}

function renderFlowTip(props: ChartTipProps) {
  if (!props.active || props.payload === undefined || props.payload.length === 0) return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{props.label}</p>
      {props.payload.map((entry) => (
        <p key={String(entry.name)}>
          {entry.name}: {String(entry.value ?? 0)}
        </p>
      ))}
    </div>
  )
}
