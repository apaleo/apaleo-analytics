import { calendarDayNumber } from '../domain/dates.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { completedItems, frequencyBins, workflowBounds, type FrequencyBin } from './metrics.ts'

export type FlowEfficiencyBasis = 'blocked' | 'stage-dwell'

export interface FlowEfficiencyItem {
  id: string
  spanDays: number
  activeDays: number
  waitDays: number
  /** Rounded percent from 0 to 100. */
  efficiencyPercent: number
}

export interface FlowEfficiencySeries {
  basis: FlowEfficiencyBasis
  items: FlowEfficiencyItem[]
  bins: FrequencyBin[]
  sampleSize: number
  activeDays: number
  waitDays: number
  spanDays: number
  /** Active days divided by span days, as a percent. Not the mean of the rounded item percents. */
  averagePercent: number
}

/**
 * Flow efficiency of completed items.
 * When blocked days are recorded, waiting time is those days capped at the cycle time.
 * Otherwise waiting time is the dwell in the first workflow stage, and only when a later
 * stage exists to count as active work. A two-stage board has no separate queue, so the
 * whole cycle time stays active.
 */
export function projectFlowEfficiency(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
  useBlockedDays: boolean,
): FlowEfficiencySeries {
  const basis: FlowEfficiencyBasis = useBlockedDays ? 'blocked' : 'stage-dwell'
  const bounds = workflowBounds(stages)
  const completed = completedItems(items, stages, asOf)
  if (bounds === undefined || completed.length === 0) {
    return { basis, items: [], bins: [], sampleSize: 0, activeDays: 0, waitDays: 0, spanDays: 0, averagePercent: 0 }
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const measured: FlowEfficiencyItem[] = []
  for (const done of completed) {
    const item = byId.get(done.id)
    if (item === undefined) continue
    const spanDays = done.cycleTimeDays
    if (spanDays < 1) continue
    const waitDays = Math.min(spanDays, waitFor(item, bounds.startIndex, bounds.doneIndex, useBlockedDays))
    const activeDays = spanDays - waitDays
    measured.push({
      id: item.id,
      spanDays,
      activeDays,
      waitDays,
      efficiencyPercent: Math.round((100 * activeDays) / spanDays),
    })
  }
  measured.sort((left, right) => left.efficiencyPercent - right.efficiencyPercent || left.id.localeCompare(right.id))

  let activeDays = 0
  let waitDays = 0
  let spanDays = 0
  for (const item of measured) {
    activeDays += item.activeDays
    waitDays += item.waitDays
    spanDays += item.spanDays
  }

  return {
    basis,
    items: measured,
    bins: frequencyBins(measured.map((item) => item.efficiencyPercent)),
    sampleSize: measured.length,
    activeDays,
    waitDays,
    spanDays,
    averagePercent: spanDays === 0 ? 0 : (100 * activeDays) / spanDays,
  }
}

function waitFor(item: WorkItem, startIndex: number, doneIndex: number, useBlockedDays: boolean): number {
  if (useBlockedDays) return Math.max(0, item.blockedDays)
  if (doneIndex <= startIndex + 1) return 0
  const entered = item.stageDates[startIndex]
  const left = item.stageDates[startIndex + 1]
  if (entered == null || left == null) return 0
  const dwell = calendarDayNumber(left) - calendarDayNumber(entered)
  return dwell > 0 ? dwell : 0
}
