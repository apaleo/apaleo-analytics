import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import { completedItems, percentile } from '../metrics.ts'
import { projectWipRun } from '../wipRun.ts'
import {
  DASHBOARD_PERCENTILE,
  DASHBOARD_SEED,
  DEFAULT_LOOKAHEAD,
  DEFAULT_TRIALS,
  coefficientOfVariation,
  createRandom,
  forecastDate,
  percentileAtLeast,
  percentileAtMost,
  predictabilityOf,
  simulateHowMany,
  simulateWhen,
  throughputSamples,
  type Predictability,
} from './simulate.ts'

export interface DashboardFlow {
  completed: number
  medianCycleDays?: number
  selectedCycleDays?: number
  selectedPercentile: number
  wip: number
  sampleCount: number
  cv?: number
  predictability: Predictability
}

export interface DashboardForecast {
  lookaheadDays: number
  /** 85% of trials finished at least this many items in the lookahead. */
  howManyItems?: number
  /** 85% of trials finish the current WIP within this many days. */
  whenDays?: number
  whenDate?: string
  wip: number
}

/** Cycle time, WIP, and the throughput spread. The percentile applies to cycle time. */
export function projectDashboardFlow(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
  selectedPercentile: number = DASHBOARD_PERCENTILE,
): DashboardFlow {
  const cycleDays = completedItems(items, stages, asOf)
    .map((item) => item.cycleTimeDays)
    .sort((left, right) => left - right)
  const samples = throughputSamples(items, stages, asOf, 'day')
  const cv = coefficientOfVariation(samples)
  const completed = cycleDays.length
  return {
    completed,
    medianCycleDays: completed === 0 ? undefined : percentile(cycleDays, 50),
    selectedCycleDays: completed === 0 ? undefined : percentile(cycleDays, selectedPercentile),
    selectedPercentile,
    wip: projectWipRun(items, stages, asOf).ending,
    sampleCount: samples.length,
    cv,
    predictability: predictabilityOf(cv),
  }
}

/**
 * Dashboard Monte Carlo, always on daily throughput.
 * How Many uses a fixed lookahead. When uses the current open count.
 * The two runs use neighboring seeds so each result stands on its own.
 */
export function projectDashboardForecast(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
  options?: { trials?: number; lookaheadDays?: number; seed?: number },
): DashboardForecast {
  const trials = options?.trials ?? DEFAULT_TRIALS
  const lookaheadDays = options?.lookaheadDays ?? DEFAULT_LOOKAHEAD
  const seed = options?.seed ?? DASHBOARD_SEED
  const samples = throughputSamples(items, stages, asOf, 'day')
  const wip = projectWipRun(items, stages, asOf).ending
  const howMany = samples.length === 0 ? undefined : simulateHowMany(samples, lookaheadDays, trials, createRandom(seed))
  const when =
    wip > 0 && samples.length > 0 ? simulateWhen(samples, wip, trials, createRandom(seed + 1)) : undefined
  const whenDays =
    when !== undefined && when.trials > 0 ? percentileAtMost(when.counts, when.trials, DASHBOARD_PERCENTILE) : undefined
  return {
    lookaheadDays,
    howManyItems:
      howMany !== undefined && howMany.trials > 0
        ? percentileAtLeast(howMany.counts, howMany.trials, DASHBOARD_PERCENTILE)
        : undefined,
    whenDays,
    whenDate: whenDays === undefined ? undefined : forecastDate(asOf, whenDays, 'day'),
    wip,
  }
}
