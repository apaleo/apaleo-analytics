import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import {
  addDays,
  completedItems,
  dateFromIso,
  formatIsoDate,
  frequencyBins,
  mondayOf,
  type FrequencyBin,
} from './metrics.ts'

export interface ThroughputHistogramSeries {
  bins: FrequencyBin[]
  sampleSize: number
  weekCount: number
}

/**
 * Distribution of weekly throughput.
 * A week starts on Monday. Weeks with no completions between the first and last completion count as zero.
 */
export function projectThroughputHistogram(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): ThroughputHistogramSeries {
  const completed = completedItems(items, stages, asOf)
  if (completed.length === 0) return { bins: [], sampleSize: 0, weekCount: 0 }

  const counts = new Map<string, number>()
  for (const item of completed) {
    const week = formatIsoDate(mondayOf(dateFromIso(item.completedOn)))
    counts.set(week, (counts.get(week) ?? 0) + 1)
  }

  const weeks = [...counts.keys()].sort()
  const first = weeks[0]
  const last = weeks[weeks.length - 1]
  if (first === undefined || last === undefined) return { bins: [], sampleSize: completed.length, weekCount: 0 }

  const weekly: number[] = []
  for (let cursor = dateFromIso(first); formatIsoDate(cursor) <= last; cursor = addDays(cursor, 7)) {
    weekly.push(counts.get(formatIsoDate(cursor)) ?? 0)
  }

  return {
    bins: frequencyBins(weekly),
    sampleSize: completed.length,
    weekCount: weekly.length,
  }
}
