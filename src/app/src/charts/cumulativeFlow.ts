import { activeStageIndex } from '../domain/cycleTime.ts'
import { calendarDayNumber } from '../domain/dates.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import type { CfdTimeRange } from '../persistence/preferences.ts'
import { dateFromCalendarDay, formatIsoDate } from './metrics.ts'

export interface CumulativeFlowSeries {
  stages: { key: string; name: string }[]
  points: { date: string; values: number[] }[]
}

const RANGE_MONTHS: Record<Exclude<CfdTimeRange, 'all'>, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
}

/**
 * Inclusive left edge of a preset window. All time has no edge besides the first stage entry.
 * A short target month clamps the day, so 31 March minus one month is 28 February.
 */
export function cfdWindowStart(asOf: Date, range: CfdTimeRange): Date | undefined {
  if (range === 'all') return undefined
  const months = RANGE_MONTHS[range]
  if (months === undefined) return undefined
  return subtractCalendarMonths(asOf, months)
}

/**
 * Daily stacked counts. An item sits in the latest stage it had entered on that day.
 * The series runs from the earliest stage entry through `asOf`.
 * Pass a range key or a calendar-day number to clip the left edge. Counts on the first
 * visible day match the full series. Days before the data starts are not added.
 */
export function projectCumulativeFlow(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
  rangeOrStart?: CfdTimeRange | number,
): CumulativeFlowSeries {
  const stageMeta = stages.map((stage, index) => ({ key: `s${index}`, name: stage.name }))
  if (items.length === 0 || stages.length === 0) return { stages: stageMeta, points: [] }

  let earliest: number | undefined
  for (const item of items) {
    for (const date of item.stageDates) {
      if (date == null) continue
      const day = calendarDayNumber(date)
      if (earliest === undefined || day < earliest) earliest = day
    }
  }
  if (earliest === undefined) return { stages: stageMeta, points: [] }

  const end = calendarDayNumber(asOf)
  if (end < earliest) return { stages: stageMeta, points: [] }

  const requested = windowStartDay(asOf, rangeOrStart)
  const start = requested === undefined ? earliest : Math.max(earliest, requested)
  if (start > end) return { stages: stageMeta, points: [] }

  const points: { date: string; values: number[] }[] = []
  for (let day = start; day <= end; day += 1) {
    const date = dateFromCalendarDay(day)
    const values = stages.map(() => 0)
    for (const item of items) {
      const active = activeStageIndex(item, date)
      if (active === undefined || active >= values.length) continue
      values[active] = (values[active] ?? 0) + 1
    }
    points.push({ date: formatIsoDate(date), values })
  }
  return { stages: stageMeta, points }
}

function windowStartDay(asOf: Date, rangeOrStart: CfdTimeRange | number | undefined): number | undefined {
  if (typeof rangeOrStart === 'number') {
    if (!Number.isFinite(rangeOrStart)) return undefined
    return Math.floor(rangeOrStart)
  }
  if (rangeOrStart === undefined) return undefined
  const start = cfdWindowStart(asOf, rangeOrStart)
  return start === undefined ? undefined : calendarDayNumber(start)
}

function subtractCalendarMonths(asOf: Date, months: number): Date {
  const year = asOf.getFullYear()
  const month = asOf.getMonth()
  const day = asOf.getDate()
  const firstOfTarget = new Date(year, month - months, 1)
  const lastDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate()
  return new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(day, lastDay))
}
