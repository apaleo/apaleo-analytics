import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import {
  completedItems,
  frequencyBins,
  percentileLevels,
  type FrequencyBin,
  type PercentileLevel,
} from './metrics.ts'

export interface CycleTimeHistogramSeries {
  bins: FrequencyBin[]
  percentiles: PercentileLevel[]
  sampleSize: number
}

/** How many completed items had each cycle time, in whole days. */
export function projectCycleTimeHistogram(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): CycleTimeHistogramSeries {
  const days = completedItems(items, stages, asOf).map((point) => point.cycleTimeDays)
  return {
    bins: frequencyBins(days),
    percentiles: percentileLevels(days),
    sampleSize: days.length,
  }
}
