import { stageTimeDays } from '../domain/cycleTime.ts'
import { calendarDayNumber } from '../domain/dates.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { inclusiveDays, workflowBounds } from './metrics.ts'

export interface StageDayCount {
  stageIndex: number
  name: string
  days: number
}

/**
 * Days in each workflow stage for one completed item.
 * Backlog is excluded, matching cycle time. Done is excluded too: entering it
 * ends the cycle, so it is not a stay. The last stage before Done is aged
 * through the completion day (the scatter dot's end date, not the as-of day)
 * with the same inclusive count as cycle time. Earlier stages use the exclusive
 * day count from `stageTimeDays`. States with no entered date are omitted.
 * The listed days add up to cycle time.
 */
export function workflowStageDays(item: WorkItem, stages: readonly WorkflowStage[]): StageDayCount[] {
  const bounds = workflowBounds(stages)
  if (bounds === undefined) return []
  const doneDate = item.stageDates[bounds.doneIndex]
  if (doneDate == null) return []

  if (bounds.startIndex === bounds.doneIndex) {
    const days = inclusiveDays(doneDate, doneDate)
    if (days === undefined) return []
    return [{ stageIndex: bounds.doneIndex, name: stages[bounds.doneIndex]?.name ?? '', days }]
  }

  let last = -1
  for (let index = bounds.startIndex; index < bounds.doneIndex; index += 1) {
    if (item.stageDates[index] != null) last = index
  }
  if (last < 0) return []

  const lines: StageDayCount[] = []
  let index = bounds.startIndex
  while (index <= last) {
    const entered = item.stageDates[index]
    if (entered == null) {
      index += 1
      continue
    }
    let next = index + 1
    while (next <= bounds.doneIndex && item.stageDates[next] == null) next += 1
    const days = index === last ? inclusiveDays(entered, doneDate) : exclusiveDays(item, index, next)
    if (days !== undefined) {
      lines.push({ stageIndex: index, name: stages[index]?.name ?? '', days })
    }
    index = next
  }
  return lines
}

function exclusiveDays(item: WorkItem, index: number, nextIndex: number): number | undefined {
  if (nextIndex === index + 1) return stageTimeDays(item, index)
  const entered = item.stageDates[index]
  const left = item.stageDates[nextIndex]
  if (entered == null || left == null) return undefined
  const elapsed = calendarDayNumber(left) - calendarDayNumber(entered)
  return elapsed < 0 ? undefined : elapsed
}
