import { activeStageIndex } from '../domain/cycleTime.ts'
import { calendarDayNumber } from '../domain/dates.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import {
  completedItems,
  inclusiveDays,
  percentileLevels,
  workflowBounds,
  type PercentileLevel,
} from './metrics.ts'

export const AGE_BANDS = ['within50', 'within70', 'within85', 'within95', 'beyond'] as const

export type AgeBand = (typeof AGE_BANDS)[number]

export interface AgingPoint {
  id: string
  title?: string
  stageIndex: number
  stageName: string
  /** Days since the workflow start, or since the current stage when the start has not been reached. */
  ageDays: number
  stageAgeDays: number
  band: AgeBand
}

export interface AgingWipSeries {
  stages: { index: number; name: string }[]
  points: AgingPoint[]
  percentiles: PercentileLevel[]
  coloring: 'percentile' | 'fixed'
}

/** Percentile bands when history exists, otherwise fixed day bands of 7, 14, 30, and 60. */
export function ageBand(ageDays: number, levels: readonly PercentileLevel[]): AgeBand {
  if (levels.length === 0) {
    if (ageDays <= 7) return 'within50'
    if (ageDays <= 14) return 'within70'
    if (ageDays <= 30) return 'within85'
    if (ageDays <= 60) return 'within95'
    return 'beyond'
  }
  const limit = (percent: number) => levels.find((level) => level.percentile === percent)?.days
  const p50 = limit(50)
  const p70 = limit(70)
  const p85 = limit(85)
  const p95 = limit(95)
  if (p50 !== undefined && ageDays <= p50) return 'within50'
  if (p70 !== undefined && ageDays <= p70) return 'within70'
  if (p85 !== undefined && ageDays <= p85) return 'within85'
  if (p95 !== undefined && ageDays <= p95) return 'within95'
  return 'beyond'
}

/**
 * Open items by current stage. Age is days since entering the first workflow stage.
 * Items still in backlog are aged from the stage they are in.
 */
export function projectAgingWip(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): AgingWipSeries {
  const axis = stages.map((stage, index) => ({ index, name: stage.name }))
  const bounds = workflowBounds(stages)
  if (bounds === undefined) return { stages: axis, points: [], percentiles: [], coloring: 'fixed' }

  const percentiles = percentileLevels(completedItems(items, stages, asOf).map((item) => item.cycleTimeDays))
  const coloring = percentiles.length > 0 ? 'percentile' : 'fixed'
  const asOfDay = calendarDayNumber(asOf)
  const points: AgingPoint[] = []

  for (const item of items) {
    const done = item.stageDates[bounds.doneIndex]
    if (done != null && calendarDayNumber(done) <= asOfDay) continue
    const stageIndex = activeStageIndex(item, asOf)
    if (stageIndex === undefined) continue
    const entered = item.stageDates[stageIndex]
    if (entered == null) continue
    const stageAgeDays = inclusiveDays(entered, asOf)
    if (stageAgeDays === undefined) continue
    const start = item.stageDates[bounds.startIndex]
    const ageFromStart =
      start != null && calendarDayNumber(start) <= asOfDay ? inclusiveDays(start, asOf) : undefined
    const ageDays = ageFromStart ?? stageAgeDays
    points.push({
      id: item.id,
      title: item.title,
      stageIndex,
      stageName: stages[stageIndex]?.name ?? '',
      ageDays,
      stageAgeDays,
      band: ageBand(ageDays, percentiles),
    })
  }

  points.sort(
    (left, right) =>
      left.stageIndex - right.stageIndex || right.ageDays - left.ageDays || left.id.localeCompare(right.id),
  )
  return { stages: axis, points, percentiles, coloring }
}
