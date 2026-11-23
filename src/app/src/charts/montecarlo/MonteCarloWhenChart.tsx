import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { Dataset, WorkItem, WorkflowStage } from '../../domain/types.ts'
import type { MessageKey } from '../../ui/i18n.tsx'
import { useI18n } from '../../ui/i18n.tsx'
import { AXIS_TICK, CHART_MARGIN, TIP_WRAPPER, percentileColor } from '../chartTheme.ts'
import { ChartFrame } from '../ChartFrame.tsx'
import type { FrequencyBin } from '../metrics.ts'
import { pointFrom, type ChartTipProps } from '../tips.tsx'
import { fill } from '../text.ts'
import { useAsOf } from '../useAsOf.ts'
import { SourceItemsTable } from '../SourceDataView.tsx'
import { openForecastIssues } from './openIssues.ts'
import { PercentileTable, WhenSimulationToolbar } from './controls.tsx'
import {
  DEFAULT_GRAIN,
  DEFAULT_TRIALS,
  MAX_REMAINING,
  clampInteger,
  clampTrials,
  forecastPercentiles,
  forecastRemaining,
  formatWhenTick,
  histogramBins,
  parseSeed,
  throughputSamples,
  type ThroughputGrain,
} from './simulate.ts'
import { useMonteCarloRun } from './useMonteCarloRun.ts'

export function MonteCarloWhenChart({
  dataset,
  items,
  stages,
  asOf,
}: {
  dataset: Dataset
  items: readonly WorkItem[]
  stages: readonly WorkflowStage[]
  asOf?: Date
}) {
  const { t } = useI18n()
  const when = useAsOf(asOf)
  const [trials, setTrials] = useState(DEFAULT_TRIALS)
  const [grain, setGrain] = useState<ThroughputGrain>(DEFAULT_GRAIN)
  const [seedText, setSeedText] = useState('')
  const [includeWip, setIncludeWip] = useState(true)
  const [extraItems, setExtraItems] = useState(0)
  const [showOpenItems, setShowOpenItems] = useState(false)
  const openItems = useMemo(() => openForecastIssues(items, stages, when), [items, stages, when])
  const open = openItems.length
  const extra = clampInteger(extraItems, 0, MAX_REMAINING, 0)
  const includedOpen = includeWip ? Math.max(0, Math.floor(open)) : 0
  const remaining = forecastRemaining(includeWip, open, extra)
  const samples = useMemo(() => throughputSamples(items, stages, when, grain), [items, stages, when, grain])
  const seed = parseSeed(seedText)
  const { histogram, running } = useMonteCarloRun('when', samples, remaining, trials, seed, remaining === 0)
  const levels = running ? [] : forecastPercentiles(histogram, 'atMost')
  const bins = histogramBins(histogram.counts, { startAt: 0 })
  const pace = grain === 'week' ? t('mcPaceWeek') : t('mcPaceDay')
  const unit = grain === 'week' ? t('mcUnitWeeks') : t('mcUnitDays')
  const p85 = levels.find((level) => level.percentile === 85)
  const forecasting = fill(t('mcWhenForecasting'), [remaining, includedOpen, extra])
  const summary = [
    forecasting,
    running || remaining === 0 || samples.length === 0
      ? null
      : fill(t('mcWhenSummary'), [histogram.trials, remaining, samples.length, pace, open]),
    p85 === undefined ? null : fill(t('mcWhenP85'), [p85.value, unit, formatWhenTick(when, p85.value, grain)]),
    remaining === 0 ? null : running ? t('mcRunning') : t('mcWhenHint'),
  ]
    .filter((line) => line !== null)
    .join(' ')
  const empty =
    items.length === 0
      ? t('noItems')
      : remaining === 0
        ? t('mcWhenNoRemaining')
        : bins.length > 0 || running
          ? undefined
          : t('mcNoThroughput')

  return (
    <>
    <ChartFrame
      chartId="monte-carlo-when"
      title={t('chart.monteCarloWhen')}
      summary={summary}
      caption={t('mcWhenAxisCaption')}
      empty={empty}
      toolbar={
        <WhenSimulationToolbar
          trials={trials}
          onTrials={(value) => setTrials(clampTrials(value))}
          includeWip={includeWip}
          onIncludeWip={setIncludeWip}
          openItems={open}
          showOpenItems={showOpenItems}
          onToggleOpenItems={() => setShowOpenItems((shown) => !shown)}
          extra={extra}
          onExtra={(value) => setExtraItems(clampInteger(value, 0, MAX_REMAINING, 0))}
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
            text: fill(t('mcAtMost'), [level.value, unit, formatWhenTick(when, level.value, grain)]),
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
            allowDecimals={false}
            tick={AXIS_TICK}
            stroke="var(--aa-border)"
            tickFormatter={(value) => formatWhenTick(when, Number(value), grain)}
          />
          <YAxis allowDecimals={false} width={48} tick={AXIS_TICK} stroke="var(--aa-border)" />
          <Tooltip content={(props) => renderWhenTip(props, t, unit, when, grain)} wrapperStyle={TIP_WRAPPER} />
          <Bar dataKey="count" fill="var(--aa-accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {levels.map((level) => (
            <ReferenceLine
              key={level.percentile}
              x={level.value}
              stroke={percentileColor(level.percentile)}
              strokeDasharray="4 3"
            />
          ))}
        </BarChart>
      ) : undefined}
    </ChartFrame>
    {showOpenItems ? (
      <SourceItemsTable
        id="monte-carlo-open-items"
        metadata={{ ...dataset.metadata, stages: [...stages] }}
        items={openItems}
      />
    ) : null}
    </>
  )
}

function renderWhenTip(
  props: ChartTipProps,
  t: (key: MessageKey) => string,
  unit: string,
  asOf: Date,
  grain: ThroughputGrain,
) {
  if (!props.active) return null
  const bin = pointFrom<FrequencyBin>(props.payload)
  if (bin === undefined || typeof bin.value !== 'number') return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">
        {fill(t('mcWhenBin'), [bin.count, bin.value, unit, formatWhenTick(asOf, bin.value, grain)])}
      </p>
    </div>
  )
}
