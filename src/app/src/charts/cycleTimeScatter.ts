import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { completedItems, percentileLevels, type CompletedItem, type PercentileLevel } from './metrics.ts'

export interface CycleTimeScatterSeries {
  points: CompletedItem[]
  percentiles: PercentileLevel[]
}

export interface CycleTimeTrendPoint {
  completedDay: number
  days: number
  /** Faded segment. The point at index `interval` is the shared join and is not warmup. */
  warmup: boolean
}

/** Completed items: completion day on X, cycle time days on Y, with 50/70/85/95 lines when the sample is large enough. */
export function projectCycleTimeScatter(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): CycleTimeScatterSeries {
  const points = completedItems(items, stages, asOf)
  return {
    points,
    percentiles: percentileLevels(points.map((point) => point.cycleTimeDays)),
  }
}

/**
 * Rolling percentile of daily cycle time, then a moving average of that series.
 * Rank is `sorted[floor(n * percent / 100) - 1]`. A short window repeats the previous
 * percentile, and the first window with no previous percentile is left out.
 * There is no ten-item minimum. `warmup` is true before the shared point at index `interval`.
 */
export function projectCycleTimeTrend(
  items: readonly CompletedItem[],
  percent: number,
  interval: number,
): CycleTimeTrendPoint[] {
  if (!Number.isInteger(interval) || interval < 1 || items.length === 0) return []
  return smoothPercentiles(rollingPercentile(dailyBuckets(items), percent, interval), interval)
}

function dailyBuckets(items: readonly CompletedItem[]): { completedDay: number; cycleTimes: number[] }[] {
  let first = items[0]?.completedDay ?? 0
  let last = first
  const byDay = new Map<number, number[]>()
  for (const item of items) {
    if (item.completedDay < first) first = item.completedDay
    if (item.completedDay > last) last = item.completedDay
    const bucket = byDay.get(item.completedDay)
    if (bucket === undefined) byDay.set(item.completedDay, [item.cycleTimeDays])
    else bucket.push(item.cycleTimeDays)
  }
  const buckets: { completedDay: number; cycleTimes: number[] }[] = []
  for (let day = first; day <= last; day += 1) {
    buckets.push({ completedDay: day, cycleTimes: byDay.get(day) ?? [] })
  }
  return buckets
}

function rollingPercentile(
  buckets: readonly { completedDay: number; cycleTimes: readonly number[] }[],
  percent: number,
  interval: number,
): { completedDay: number; days: number }[] {
  const points: { completedDay: number; days: number }[] = []
  const window: number[] = []
  const lengths: number[] = []
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index]
    if (bucket === undefined) continue
    lengths.push(bucket.cycleTimes.length)
    for (const value of bucket.cycleTimes) window.push(value)
    if (index >= interval) {
      const drop = lengths[index - interval] ?? 0
      if (drop > 0) window.splice(0, drop)
    }
    const ranked = originalPercentile(window, percent)
    if (ranked !== undefined) {
      points.push({ completedDay: bucket.completedDay, days: ranked })
    } else if (points.length > 0) {
      const previous = points[points.length - 1]
      if (previous !== undefined) points.push({ completedDay: bucket.completedDay, days: previous.days })
    }
  }
  return points
}

/** Original rank, not Excel PERCENTILE.INC. An empty or undersized window is undefined. */
function originalPercentile(values: readonly number[], percent: number): number | undefined {
  const sorted = values.slice().sort((left, right) => left - right)
  return sorted[Math.floor((sorted.length * percent) / 100) - 1]
}

function smoothPercentiles(
  points: readonly { completedDay: number; days: number }[],
  interval: number,
): CycleTimeTrendPoint[] {
  const smoothed: CycleTimeTrendPoint[] = []
  let sum = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point === undefined) continue
    sum += point.days
    if (index >= interval) {
      const dropped = points[index - interval]
      if (dropped !== undefined) sum -= dropped.days
    }
    smoothed.push({
      completedDay: point.completedDay,
      days: sum / Math.min(index + 1, interval),
      warmup: index < interval,
    })
  }
  return smoothed
}
