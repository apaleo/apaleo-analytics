import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import type { MessageKey } from '../../ui/i18n.tsx'
import { useI18n } from '../../ui/i18n.tsx'
import { AXIS_TICK, CHART_MARGIN, TIP_WRAPPER, percentileColor } from '../chartTheme.ts'
import { ChartFrame } from '../ChartFrame.tsx'
import type { FrequencyBin } from '../metrics.ts'
import { pointFrom, type ChartTipProps } from '../tips.tsx'
import { fill } from '../text.ts'
import { useAsOf } from '../useAsOf.ts'
import { PercentileTable, SimulationToolbar } from './controls.tsx'
import {
  DEFAULT_GRAIN,
  DEFAULT_LOOKAHEAD,
  DEFAULT_TRIALS,
  MAX_LOOKAHEAD,
  clampInteger,
  clampTrials,
  forecastPercentiles,
  formatWhenTick,
  howManyMonthTicks,
  howManyTimelineBins,
  parseSeed,
  throughputSamples,
  type ThroughputGrain,
} from './simulate.ts'
import { useMonteCarloRun } from './useMonteCarloRun.ts'

export function MonteCarloHowManyChart({
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
  const [trials, setTrials] = useState(DEFAULT_TRIALS)
  const [periods, setPeriods] = useState(DEFAULT_LOOKAHEAD)
  const [grain, setGrain] = useState<ThroughputGrain>(DEFAULT_GRAIN)
  const [seedText, setSeedText] = useState('')
  const samples = useMemo(() => throughputSamples(items, stages, when, grain), [items, stages, when, grain])
  const seed = parseSeed(seedText)
  const { histogram, cumulativeMean, running } = useMonteCarloRun('howMany', samples, periods, trials, seed)
  const levels = running ? [] : forecastPercentiles(histogram, 'atLeast')
  const bins = howManyTimelineBins(cumulativeMean)
  const monthTicks = howManyMonthTicks(when, Math.max(periods, bins.length > 0 ? bins[bins.length - 1]!.value : 0), grain)
  const pace = grain === 'week' ? t('mcPaceWeek') : t('mcPaceDay')
  const p85 = levels.find((level) => level.percentile === 85)
  const summary = [
    running || samples.length === 0
      ? null
      : fill(t('mcHowManySummary'), [histogram.trials, periods, samples.length, pace]),
    p85 === undefined ? null : fill(t('mcHowManyP85'), [p85.value]),
    running ? t('mcRunning') : t('mcHowManyHint'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty = bins.length > 0 || running ? undefined : items.length === 0 ? t('noItems') : t('mcNoThroughput')

  return (
    <ChartFrame
      chartId="monte-carlo-how-many"
      title={t('chart.monteCarloHowMany')}
      summary={summary}
      caption={fill(t('axisCaption'), [t('mcHowManyDateAxis'), t('axisCompletedItems')])}
      empty={empty}
      toolbar={
        <SimulationToolbar
          trials={trials}
          onTrials={(value) => setTrials(clampTrials(value))}
          count={periods}
          countLabel={grain === 'week' ? t('mcLookaheadWeeks') : t('mcLookaheadDays')}
          countMin={1}
          countMax={MAX_LOOKAHEAD}
          onCount={(value) => setPeriods(clampInteger(value, 1, MAX_LOOKAHEAD, DEFAULT_LOOKAHEAD))}
          grain={grain}
          onGrain={setGrain}
          seedText={seedText}
          onSeed={setSeedText}
          running={running}
        />
      }
      legend={
        <PercentileTable
          rows={levels.map((level) => ({
            percentile: level.percentile,
            text: fill(t('mcAtLeast'), [level.value]),
          }))}
        />
      }
    >
      {empty === undefined ? (
        <BarChart data={bins} margin={CHART_MARGIN}>
          <CartesianGrid stroke="var(--aa-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="value"
            domain={[0, 'dataMax']}
            ticks={monthTicks}
            allowDecimals={false}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
            tickFormatter={(value) => formatWhenTick(when, Number(value), grain)}
          />
          <YAxis allowDecimals={false} width={48} tick={AXIS_TICK} stroke="var(--aa-border)" />
          <Tooltip content={(props) => renderHowManyTip(props, t, when, grain)} wrapperStyle={TIP_WRAPPER} />
          <Bar dataKey="count" fill="var(--aa-blue)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {levels.map((level) => (
            <ReferenceLine
              key={level.percentile}
              y={level.value}
              stroke={percentileColor(level.percentile)}
              strokeDasharray="4 3"
            />
          ))}
        </BarChart>
      ) : undefined}
    </ChartFrame>
  )
}

function renderHowManyTip(
  props: ChartTipProps,
  t: (key: MessageKey) => string,
  asOf: Date,
  grain: ThroughputGrain,
) {
  if (!props.active) return null
  const bin = pointFrom<FrequencyBin>(props.payload)
  if (bin === undefined || typeof bin.value !== 'number') return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">
        {fill(t('mcHowManyDateBin'), [formatWhenTick(asOf, bin.value, grain), Math.round(bin.count)])}
      </p>
    </div>
  )
}
