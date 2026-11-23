import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import {
  addDays,
  completedItems,
  dateFromIso,
  formatIsoDate,
  formatShortIso,
  mondayOf,
  type FrequencyBin,
} from '../metrics.ts'

/** Trial counts the charts offer. The charts do not take a free-typed trial count. */
export const TRIAL_OPTIONS = [10_000, 100_000, 500_000, 1_000_000] as const

export type TrialOption = (typeof TRIAL_OPTIONS)[number]

/** Trials used when a caller omits the count, and the number the charts show first. */
export const DEFAULT_TRIALS = 10_000

export const MIN_TRIALS = 1

/** Upper bound for a single run. Matches the largest chart option. */
export const MAX_TRIALS = 1_000_000

/** Work between yields so a large run can paint and take input. */
const SLICE_BUDGET_MS = 16

/** Draws between clock checks inside a When trial. */
const DRAW_CHECK = 1_000

export const DEFAULT_LOOKAHEAD = 30

export const MAX_LOOKAHEAD = 366

export const DEFAULT_REMAINING = 10

export const MAX_REMAINING = 5_000

/** Same levels the other charts draw, read from the trial histogram. */
export const FORECAST_PERCENTILES = [50, 70, 85, 95] as const

/** Fixed seed for the dashboard snapshot so the tiles stay put for a dataset. */
export const DASHBOARD_SEED = 1

export const DASHBOARD_PERCENTILE = 85

export type ThroughputGrain = 'day' | 'week'

/** Grain the How Many and When charts select on first open. */
export const DEFAULT_GRAIN: ThroughputGrain = 'week'

export function isTrialOption(value: number): value is TrialOption {
  return (TRIAL_OPTIONS as readonly number[]).includes(value)
}

export interface ChunkedRunOptions {
  /** Replaces the timer yield. Tests pass a resolved promise. */
  yield?: () => Promise<void>
  shouldCancel?: () => boolean
  /** How long one slice may run before yielding. */
  budgetMs?: number
  /** How Many stops a slice after this many trials even when the budget remains. */
  maxSlice?: number
}

export interface TrialHistogram {
  /** Index is the outcome (items, or periods). Value is how many trials landed there. */
  counts: number[]
  trials: number
}

export interface SimulationPercentile {
  percentile: number
  value: number
}

export type Predictability = 'stable' | 'moderate' | 'variable' | 'unknown'

const EMPTY: TrialHistogram = { counts: [], trials: 0 }

/**
 * Mulberry32. A seed makes a run repeatable for tests and the dashboard snapshot.
 * Omitting the seed uses Math.random.
 */
export function createRandom(seed?: number): () => number {
  if (seed === undefined || !Number.isFinite(seed)) return Math.random
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clampTrials(trials: number): number {
  if (!Number.isFinite(trials)) return DEFAULT_TRIALS
  const whole = Math.floor(trials)
  if (whole < MIN_TRIALS) return MIN_TRIALS
  if (whole > MAX_TRIALS) return MAX_TRIALS
  return whole
}

export function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  const whole = Math.floor(value)
  if (whole < min) return min
  if (whole > max) return max
  return whole
}

/** Blank text stays unseeded. Any other integer, including 0, is a seed. */
export function parseSeed(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed === '-') return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value)) return undefined
  return value
}

/**
 * Daily or weekly throughput from the first completion through the last one on or before `asOf`.
 * Periods inside that span with no completions are zero, matching the run chart and the histogram.
 */
export function throughputSamples(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
  grain: ThroughputGrain,
): number[] {
  const completed = completedItems(items, stages, asOf)
  if (completed.length === 0) return []
  if (grain === 'day') return dailySamples(completed)
  return weeklySamples(completed)
}

function dailySamples(completed: readonly { completedDay: number }[]): number[] {
  const counts = new Map<number, number>()
  for (const item of completed) counts.set(item.completedDay, (counts.get(item.completedDay) ?? 0) + 1)
  const first = completed[0]?.completedDay
  const last = completed[completed.length - 1]?.completedDay
  if (first === undefined || last === undefined) return []
  const samples: number[] = []
  for (let day = first; day <= last; day += 1) samples.push(counts.get(day) ?? 0)
  return samples
}

function weeklySamples(completed: readonly { completedOn: string }[]): number[] {
  const counts = new Map<string, number>()
  for (const item of completed) {
    const week = formatIsoDate(mondayOf(dateFromIso(item.completedOn)))
    counts.set(week, (counts.get(week) ?? 0) + 1)
  }
  const weeks = [...counts.keys()].sort()
  const first = weeks[0]
  const last = weeks[weeks.length - 1]
  if (first === undefined || last === undefined) return []
  const samples: number[] = []
  for (let cursor = dateFromIso(first); formatIsoDate(cursor) <= last; cursor = addDays(cursor, 7)) {
    samples.push(counts.get(formatIsoDate(cursor)) ?? 0)
  }
  return samples
}

/** One draw with replacement. A single sample does not consume the random stream. */
export function drawSample(samples: readonly number[], random: () => number): number {
  if (samples.length === 0) return 0
  if (samples.length === 1) return samples[0] ?? 0
  const index = Math.floor(random() * samples.length)
  return samples[index] ?? 0
}

export interface HowManyResult extends TrialHistogram {
  /**
   * Mean cumulative completions after each period.
   * Index 0 is today (0 items). Index `periods` is the end of the lookahead window.
   */
  cumulativeMean: number[]
}

const EMPTY_HOW_MANY: HowManyResult = { counts: [], trials: 0, cumulativeMean: [] }

/**
 * How many items finish in `periods` draws.
 * Each trial sums that many samples, then the histogram counts the floored totals.
 * A history that never finishes anything records no trials.
 * `cumulativeMean` tracks the average path so the chart can plot dates from today.
 */
export function simulateHowMany(
  samples: readonly number[],
  periods: number,
  trials: number = DEFAULT_TRIALS,
  random: () => number = Math.random,
): HowManyResult {
  const span = Math.floor(periods)
  if (span < 1 || !hasThroughput(samples)) return EMPTY_HOW_MANY
  const run = clampTrials(trials)
  const counts: number[] = []
  const periodSums = new Array<number>(span + 1).fill(0)
  for (let trial = 0; trial < run; trial += 1) addHowManyTrial(samples, span, random, counts, periodSums)
  return { counts, trials: run, cumulativeMean: meansFromSums(periodSums, run) }
}

/**
 * Same histogram as `simulateHowMany`, yielding between slices.
 * A million trials stays on the main thread, but it returns to the event loop
 * often enough that the tab can paint and accept input.
 */
export async function simulateHowManyChunked(
  samples: readonly number[],
  periods: number,
  trials: number = DEFAULT_TRIALS,
  random: () => number = Math.random,
  options?: ChunkedRunOptions,
): Promise<HowManyResult> {
  const span = Math.floor(periods)
  if (span < 1 || !hasThroughput(samples)) return EMPTY_HOW_MANY
  const run = clampTrials(trials)
  const counts: number[] = []
  const periodSums = new Array<number>(span + 1).fill(0)
  const completed = await runInSlices(
    run,
    () => addHowManyTrial(samples, span, random, counts, periodSums),
    options,
  )
  return { counts, trials: completed, cumulativeMean: meansFromSums(periodSums, completed) }
}

/**
 * How many periods it takes to finish `remaining` items.
 * Each trial keeps drawing until the sum reaches the target. The histogram index is that period count.
 * No remaining work finishes in zero periods. A history that never finishes anything records no trials.
 */
export function simulateWhen(
  samples: readonly number[],
  remaining: number,
  trials: number = DEFAULT_TRIALS,
  random: () => number = Math.random,
): TrialHistogram {
  const run = clampTrials(trials)
  const target = Math.round(remaining)
  if (target <= 0) return { counts: [run], trials: run }
  if (!hasThroughput(samples)) return EMPTY
  const counts: number[] = []
  for (let trial = 0; trial < run; trial += 1) addWhenTrial(samples, target, random, counts)
  return { counts, trials: run }
}

/** Same histogram as `simulateWhen`, yielding between slices and during a long trial. */
export async function simulateWhenChunked(
  samples: readonly number[],
  remaining: number,
  trials: number = DEFAULT_TRIALS,
  random: () => number = Math.random,
  options?: ChunkedRunOptions,
): Promise<TrialHistogram> {
  const run = clampTrials(trials)
  const target = Math.round(remaining)
  if (target <= 0) return { counts: [run], trials: run }
  if (!hasThroughput(samples)) return EMPTY
  const counts: number[] = []
  const pause = options?.yield ?? yieldToMain
  const budgetMs = options?.budgetMs ?? SLICE_BUDGET_MS
  let started = performance.now()
  let sinceCheck = 0
  for (let trial = 0; trial < run; trial += 1) {
    if (options?.shouldCancel?.()) return { counts, trials: trial }
    let done = 0
    let periods = 0
    let dropped = false
    while (done < target) {
      done += drawSample(samples, random)
      periods += 1
      sinceCheck += 1
      if (sinceCheck < DRAW_CHECK) continue
      sinceCheck = 0
      if (performance.now() - started < budgetMs) continue
      await pause()
      started = performance.now()
      if (options?.shouldCancel?.()) {
        dropped = true
        break
      }
    }
    if (dropped) return { counts, trials: trial }
    record(counts, periods)
    if (trial + 1 < run && performance.now() - started >= budgetMs) {
      await pause()
      started = performance.now()
      if (options?.shouldCancel?.()) return { counts, trials: trial + 1 }
    }
  }
  return { counts, trials: run }
}

/**
 * Items the When chart forecasts.
 * Checked includes the open workflow count. Extra items always add.
 * Zero means there is nothing to forecast. Above the cap, the run uses the cap.
 */
export function forecastRemaining(includeWip: boolean, openWip: number, extraItems: number): number {
  const open = includeWip && Number.isFinite(openWip) ? Math.max(0, Math.floor(openWip)) : 0
  const extra = clampInteger(extraItems, 0, MAX_REMAINING, 0)
  const sum = open + extra
  if (sum <= 0) return 0
  if (sum > MAX_REMAINING) return MAX_REMAINING
  return sum
}

/**
 * How Many percentile. Walk from the high end until `percentile`% of trials are included.
 * The index is a count that share of trials reached or beat.
 */
export function percentileAtLeast(counts: readonly number[], trials: number, percent: number): number {
  if (trials <= 0 || counts.length === 0) return 0
  const need = (trials * percent) / 100
  let cumulative = 0
  for (let index = counts.length - 1; index >= 0; index -= 1) {
    cumulative += counts[index] ?? 0
    if (cumulative >= need) return index
  }
  return 0
}

/**
 * When percentile. Walk from the low end until `percentile`% of trials are included.
 * The index is a period count that share of trials finished within.
 */
export function percentileAtMost(counts: readonly number[], trials: number, percent: number): number {
  if (trials <= 0 || counts.length === 0) return 0
  const need = (trials * percent) / 100
  let cumulative = 0
  for (let index = 0; index < counts.length; index += 1) {
    cumulative += counts[index] ?? 0
    if (cumulative >= need) return index
  }
  return counts.length - 1
}

export function forecastPercentiles(
  histogram: TrialHistogram,
  mode: 'atLeast' | 'atMost',
  percents: readonly number[] = FORECAST_PERCENTILES,
): SimulationPercentile[] {
  if (histogram.trials <= 0) return []
  const read = mode === 'atLeast' ? percentileAtLeast : percentileAtMost
  return percents.map((percentile) => ({
    percentile,
    value: read(histogram.counts, histogram.trials, percentile),
  }))
}

/**
 * Bins from the first outcome that occurred through the last, keeping the gaps between them.
 * Pass `startAt: 0` for Monte Carlo When so the axis always begins at today (period 0).
 */
export function histogramBins(counts: readonly number[], options?: { startAt?: number }): FrequencyBin[] {
  let first = -1
  let last = -1
  for (let index = 0; index < counts.length; index += 1) {
    if ((counts[index] ?? 0) <= 0) continue
    if (first < 0) first = index
    last = index
  }
  if (first < 0 || last < 0) return []
  const start =
    options?.startAt !== undefined && Number.isFinite(options.startAt)
      ? Math.max(0, Math.floor(options.startAt))
      : first
  const from = Math.min(start, first)
  const bins: FrequencyBin[] = []
  for (let value = from; value <= last; value += 1) bins.push({ value, count: counts[value] ?? 0 })
  return bins
}

/** Population coefficient of variation. A zero mean has no CV. */
export function coefficientOfVariation(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  let sum = 0
  for (const value of values) sum += value
  const mean = sum / values.length
  if (mean === 0) return undefined
  let square = 0
  for (const value of values) {
    const delta = value - mean
    square += delta * delta
  }
  return Math.sqrt(square / values.length) / mean
}

/**
 * A hint from the spread of throughput.
 * Under 0.5 is a tight history. Under 1 still moves together. At 1 or above the forecast is wide.
 */
export function predictabilityOf(cv: number | undefined): Predictability {
  if (cv === undefined || !Number.isFinite(cv)) return 'unknown'
  if (cv < 0.5) return 'stable'
  if (cv < 1) return 'moderate'
  return 'variable'
}

/** Forecast calendar date: `asOf` plus the simulated periods (weeks count as seven days). */
export function forecastDate(asOf: Date, periods: number, grain: ThroughputGrain): string {
  const step = grain === 'week' ? 7 : 1
  return formatIsoDate(addDays(asOf, periods * step))
}

/**
 * When / How Many axis label. Period 0 is the as-of day. Later periods step by one day or one week.
 * Always includes the calendar year so a long weekly forecast is not read as the next few months
 * (e.g. 63 weeks from Nov 2026 is Jan 26, 2028 — not Jan 2027).
 */
export function formatWhenTick(asOf: Date, periods: number, grain: ThroughputGrain): string {
  const whole = Number.isFinite(periods) ? Math.floor(periods) : 0
  const iso = forecastDate(asOf, whole, grain)
  const date = dateFromIso(iso)
  return `${formatShortIso(iso)}, ${date.getFullYear()}`
}

/**
 * Period offsets to label on the How Many date axis: today (0), each following month start
 * that falls inside the window (Dec 1 after Nov 30, and so on), and the lookahead end.
 */
export function howManyMonthTicks(asOf: Date, periods: number, grain: ThroughputGrain): number[] {
  const span = Math.max(0, Math.floor(periods))
  if (span === 0) return [0]
  const step = grain === 'week' ? 7 : 1
  const start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())
  const end = addDays(start, span * step)
  const ticks = new Set<number>([0, span])
  let month = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  while (month.getTime() <= end.getTime()) {
    const dayOffset = Math.round((month.getTime() - start.getTime()) / 86_400_000)
    const period = Math.round(dayOffset / step)
    if (period > 0 && period < span) ticks.add(period)
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  }
  return [...ticks].sort((left, right) => left - right)
}

/** Chart rows for How Many: one point per period from today through the lookahead end. */
export function howManyTimelineBins(cumulativeMean: readonly number[]): FrequencyBin[] {
  return cumulativeMean.map((count, period) => ({ value: period, count }))
}

function hasThroughput(samples: readonly number[]): boolean {
  for (const sample of samples) if (sample > 0) return true
  return false
}

function record(counts: number[], outcome: number): void {
  const index = outcome < 0 ? 0 : outcome
  while (counts.length <= index) counts.push(0)
  counts[index] = (counts[index] ?? 0) + 1
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function addHowManyTrial(
  samples: readonly number[],
  span: number,
  random: () => number,
  counts: number[],
  periodSums?: number[],
): void {
  let total = 0
  if (periodSums !== undefined) periodSums[0] = (periodSums[0] ?? 0) + 0
  for (let step = 0; step < span; step += 1) {
    total += drawSample(samples, random)
    if (periodSums !== undefined) periodSums[step + 1] = (periodSums[step + 1] ?? 0) + Math.floor(total)
  }
  record(counts, Math.floor(total))
}

function meansFromSums(sums: readonly number[], trials: number): number[] {
  if (trials <= 0) return sums.map(() => 0)
  return sums.map((sum) => sum / trials)
}

function addWhenTrial(
  samples: readonly number[],
  target: number,
  random: () => number,
  counts: number[],
): void {
  let done = 0
  let periods = 0
  while (done < target) {
    done += drawSample(samples, random)
    periods += 1
  }
  record(counts, periods)
}

async function runInSlices(total: number, step: () => void, options?: ChunkedRunOptions): Promise<number> {
  const budgetMs = options?.budgetMs ?? SLICE_BUDGET_MS
  const maxSlice = options?.maxSlice ?? 5_000
  const pause = options?.yield ?? yieldToMain
  let done = 0
  while (done < total) {
    if (options?.shouldCancel?.()) return done
    const started = performance.now()
    let slice = 0
    do {
      step()
      done += 1
      slice += 1
    } while (done < total && slice < maxSlice && performance.now() - started < budgetMs)
    if (done < total) await pause()
  }
  return done
}
