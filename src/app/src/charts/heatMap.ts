import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { addDays, completedItems, dateFromCalendarDay, formatIsoDate, mondayOf } from './metrics.ts'

export interface HeatMapSeries {
  /** Monday that starts each column, oldest first. */
  weeks: string[]
  /** counts[weekday][weekIndex]. Weekday 0 is Monday and 6 is Sunday. */
  counts: number[][]
  dates: string[][]
  max: number
  total: number
}

const EMPTY_ROWS = (): number[][] => Array.from({ length: 7 }, () => [])

/**
 * Completions on a weekday-by-week grid.
 * Dates have no time of day, so each cell is one calendar day. Weeks start on Monday.
 */
export function projectHeatMap(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): HeatMapSeries {
  const completed = completedItems(items, stages, asOf)
  const first = completed[0]
  const last = completed[completed.length - 1]
  if (first === undefined || last === undefined) {
    return { weeks: [], counts: EMPTY_ROWS(), dates: EMPTY_ROWS().map(() => []), max: 0, total: 0 }
  }

  const start = mondayOf(dateFromCalendarDay(first.completedDay))
  const end = addDays(mondayOf(dateFromCalendarDay(last.completedDay)), 6)
  const byDate = new Map<string, number>()
  for (const item of completed) byDate.set(item.completedOn, (byDate.get(item.completedOn) ?? 0) + 1)

  const weeks: string[] = []
  const counts = EMPTY_ROWS()
  const dates: string[][] = EMPTY_ROWS().map(() => [])
  let max = 0
  let total = 0

  for (let cursor = start; formatIsoDate(cursor) <= formatIsoDate(end); cursor = addDays(cursor, 1)) {
    const iso = formatIsoDate(cursor)
    const weekday = mondayIndex(cursor)
    if (weekday === 0) weeks.push(iso)
    const count = byDate.get(iso) ?? 0
    counts[weekday]?.push(count)
    dates[weekday]?.push(iso)
    if (count > max) max = count
    total += count
  }

  return { weeks, counts, dates, max, total }
}

/** Monday is 0 and Sunday is 6. */
export function mondayIndex(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}
