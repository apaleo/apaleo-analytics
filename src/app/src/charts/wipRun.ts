import { calendarDayNumber } from '../domain/dates.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { dateFromCalendarDay, formatIsoDate, workflowBounds } from './metrics.ts'

export interface WipRunPoint {
  date: string
  wip: number
}

export interface WipRunSeries {
  points: WipRunPoint[]
  /** Mean of the daily counts, including zeros. */
  average: number
  ending: number
  endingOn: string
}

const EMPTY: WipRunSeries = { points: [], average: 0, ending: 0, endingOn: '' }

/**
 * Daily count of items in the active workflow: entered the first workflow stage
 * (e.g. Planned) and not yet the last stage (Done). Backlog-only items are excluded.
 * An item leaves WIP on the day it enters Done. The series runs through `asOf`.
 */
export function projectWipRun(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): WipRunSeries {
  const bounds = workflowBounds(stages)
  if (bounds === undefined || items.length === 0) return EMPTY

  const asOfDay = calendarDayNumber(asOf)
  const spans: { start: number; done?: number }[] = []
  let earliest: number | undefined

  for (const item of items) {
    let start: number | undefined
    for (let index = bounds.startIndex; index < stages.length; index += 1) {
      const date = item.stageDates[index]
      if (date == null) continue
      const day = calendarDayNumber(date)
      if (day > asOfDay) continue
      start = day
      break
    }
    if (start === undefined) continue

    const doneDate = item.stageDates[bounds.doneIndex]
    let done: number | undefined
    if (doneDate != null) {
      const doneDay = calendarDayNumber(doneDate)
      if (doneDay <= asOfDay) done = doneDay
    }
    spans.push({ start, done })
    if (earliest === undefined || start < earliest) earliest = start
  }
  if (earliest === undefined) return EMPTY

  const points: WipRunPoint[] = []
  let total = 0
  for (let day = earliest; day <= asOfDay; day += 1) {
    let wip = 0
    for (const span of spans) {
      if (span.start <= day && (span.done === undefined || day < span.done)) wip += 1
    }
    points.push({ date: formatIsoDate(dateFromCalendarDay(day)), wip })
    total += wip
  }

  const last = points[points.length - 1]
  return {
    points,
    average: points.length === 0 ? 0 : total / points.length,
    ending: last?.wip ?? 0,
    endingOn: last?.date ?? '',
  }
}
