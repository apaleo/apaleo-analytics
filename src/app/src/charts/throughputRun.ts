import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { completedItems, dateFromCalendarDay, formatIsoDate } from './metrics.ts'

/** Trailing window used by the throughput run chart, in days. */
export const TRAILING_WINDOW = 7

export interface ThroughputRunPoint {
  date: string
  count: number
  trailing: number
}

export interface ThroughputRunSeries {
  points: ThroughputRunPoint[]
  sampleSize: number
  dayCount: number
  /** Mean daily throughput, including days that finished nothing. */
  average: number
}

/**
 * Trailing mean. The first points divide by the days seen so far, then by `window`.
 * Matches the original moving-average line.
 */
export function trailingAverage(values: readonly number[], window: number): number[] {
  const result: number[] = []
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] ?? 0
    if (index >= window) sum -= values[index - window] ?? 0
    const seen = Math.min(index + 1, window)
    result.push(seen === 0 ? 0 : sum / seen)
  }
  return result
}

/**
 * Daily throughput from the first completion through the last one on or before `asOf`.
 * Days between them with no completions are zero.
 */
export function projectThroughputRun(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): ThroughputRunSeries {
  const completed = completedItems(items, stages, asOf)
  if (completed.length === 0) return { points: [], sampleSize: 0, dayCount: 0, average: 0 }

  const counts = new Map<number, number>()
  for (const item of completed) counts.set(item.completedDay, (counts.get(item.completedDay) ?? 0) + 1)

  const first = completed[0]?.completedDay
  const last = completed[completed.length - 1]?.completedDay
  if (first === undefined || last === undefined) return { points: [], sampleSize: completed.length, dayCount: 0, average: 0 }

  const daily: number[] = []
  for (let day = first; day <= last; day += 1) daily.push(counts.get(day) ?? 0)
  const trailing = trailingAverage(daily, TRAILING_WINDOW)
  const points = daily.map((count, index) => ({
    date: formatIsoDate(dateFromCalendarDay(first + index)),
    count,
    trailing: trailing[index] ?? 0,
  }))
  const total = daily.reduce((sum, count) => sum + count, 0)
  return {
    points,
    sampleSize: completed.length,
    dayCount: points.length,
    average: points.length === 0 ? 0 : total / points.length,
  }
}
