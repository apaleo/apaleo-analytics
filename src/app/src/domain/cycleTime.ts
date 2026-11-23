import { calendarDayNumber } from './dates.ts'
import type { WorkItem } from './types.ts'

export interface CycleTimeOptions {
  /** When false, blocked days are removed and the result is at least 1. Defaults to true. */
  includeBlockedTime?: boolean
}

/**
 * Inclusive days from the entry date of `fromStageIndex` through the entry date of `toStageIndex`.
 * Same-day movement is 1. Returns undefined when either stage has not been entered.
 */
export function cycleTimeBetweenStages(
  item: WorkItem,
  fromStageIndex: number,
  toStageIndex: number,
  options: CycleTimeOptions = {},
): number | undefined {
  const start = item.stageDates[fromStageIndex]
  const end = item.stageDates[toStageIndex]
  if (start == null || end == null) return undefined
  const elapsed = calendarDayNumber(end) - calendarDayNumber(start) + 1
  if (elapsed < 1) return undefined
  if (options.includeBlockedTime === false) return Math.max(elapsed - item.blockedDays, 1)
  return elapsed
}

/** Exclusive days spent in a stage, from its entry date until the next stage's entry date. */
export function stageTimeDays(item: WorkItem, stageIndex: number): number | undefined {
  const entered = item.stageDates[stageIndex]
  const left = item.stageDates[stageIndex + 1]
  if (entered == null || left == null) return undefined
  const elapsed = calendarDayNumber(left) - calendarDayNumber(entered)
  return elapsed < 0 ? undefined : elapsed
}

/** Rightmost stage whose entry date is on or before `asOf`. */
export function activeStageIndex(item: WorkItem, asOf: Date): number | undefined {
  const asOfDay = calendarDayNumber(asOf)
  for (let index = item.stageDates.length - 1; index >= 0; index -= 1) {
    const entered = item.stageDates[index]
    if (entered != null && calendarDayNumber(entered) <= asOfDay) return index
  }
  return undefined
}

export function hasEnteredStage(item: WorkItem, stageIndex: number, asOf?: Date): boolean {
  const entered = item.stageDates[stageIndex]
  if (entered == null) return false
  if (asOf === undefined) return true
  return calendarDayNumber(entered) <= calendarDayNumber(asOf)
}
