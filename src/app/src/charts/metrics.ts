import { cycleTimeBetweenStages } from '../domain/cycleTime.ts'
import { calendarDayNumber } from '../domain/dates.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'

/** Percentile lines and aging colors use these levels. */
export const DEFAULT_PERCENTILES = [50, 70, 85, 95] as const

/** Fewer completed items than this and percentile lines are withheld. */
export const MIN_PERCENTILE_SAMPLES = 10

export interface PercentileLevel {
  percentile: number
  days: number
}

export interface WorkflowBounds {
  /** First non-backlog stage. The first stage when the board has no backlog column. */
  startIndex: number
  /** Last stage. Entering it completes the item. */
  doneIndex: number
}

export interface CompletedItem {
  id: string
  title?: string
  completedOn: string
  completedDay: number
  cycleTimeDays: number
}

export interface FrequencyBin {
  value: number
  count: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Cycle time runs from the first workflow stage through the last stage.
 * Backlog time is not part of cycle time.
 */
export function workflowBounds(stages: readonly WorkflowStage[]): WorkflowBounds | undefined {
  if (stages.length === 0) return undefined
  const workflowIndex = stages.findIndex((stage) => stage.role === 'workflow')
  return {
    startIndex: workflowIndex >= 0 ? workflowIndex : 0,
    doneIndex: stages.length - 1,
  }
}

/** Inclusive calendar days. The same day counts as 1. Undefined when `to` is before `from`. */
export function inclusiveDays(from: Date, to: Date): number | undefined {
  const days = calendarDayNumber(to) - calendarDayNumber(from) + 1
  return days < 1 ? undefined : days
}

/** Excel PERCENTILE.INC: linear rank interpolation on an ascending list. */
export function percentile(sorted: readonly number[], percent: number): number {
  if (sorted.length === 0) return 0
  const last = sorted.length - 1
  const only = sorted[0]
  if (last === 0 || only === undefined) return only ?? 0
  const rank = (percent / 100) * last
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  const lowValue = sorted[low] ?? only
  const highValue = sorted[high] ?? lowValue
  if (low === high) return lowValue
  return lowValue + (highValue - lowValue) * (rank - low)
}

export function percentileLevels(
  values: readonly number[],
  percents: readonly number[] = DEFAULT_PERCENTILES,
): PercentileLevel[] {
  if (values.length < MIN_PERCENTILE_SAMPLES) return []
  const sorted = values.slice().sort((left, right) => left - right)
  return percents.map((percent) => ({
    percentile: percent,
    days: percentile(sorted, percent),
  }))
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map((part) => Number.parseInt(part, 10))
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function dateFromCalendarDay(day: number): Date {
  const utc = new Date(day * 86_400_000)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

export function formatShortDate(date: Date): string {
  return `${MONTHS[date.getMonth()] ?? ''} ${date.getDate()}`
}

export function formatDayTick(day: number): string {
  return formatShortDate(dateFromCalendarDay(day))
}

export function formatShortIso(iso: string): string {
  return formatShortDate(dateFromIso(iso))
}

/** Monday that starts the local week containing `date`. */
export function mondayOf(date: Date): Date {
  const weekday = date.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * Items that reached the last stage on or before `asOf`.
 * Cycle time includes blocked days and both the start and end dates.
 */
export function completedItems(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): CompletedItem[] {
  const bounds = workflowBounds(stages)
  if (bounds === undefined) return []
  const asOfDay = calendarDayNumber(asOf)
  const completed: CompletedItem[] = []
  for (const item of items) {
    const done = item.stageDates[bounds.doneIndex]
    if (done == null || calendarDayNumber(done) > asOfDay) continue
    const cycleTimeDays = cycleTimeBetweenStages(item, bounds.startIndex, bounds.doneIndex)
    if (cycleTimeDays === undefined) continue
    completed.push({
      id: item.id,
      title: item.title,
      completedOn: formatIsoDate(done),
      completedDay: calendarDayNumber(done),
      cycleTimeDays,
    })
  }
  completed.sort((left, right) => left.completedDay - right.completedDay || left.id.localeCompare(right.id))
  return completed
}

/** Counts of integer values. Integers between the minimum and maximum with no samples are zero. */
export function frequencyBins(values: readonly number[]): FrequencyBin[] {
  if (values.length === 0) return []
  let min = values[0] ?? 0
  let max = min
  const counts = new Map<number, number>()
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const bins: FrequencyBin[] = []
  for (let value = min; value <= max; value += 1) {
    bins.push({ value, count: counts.get(value) ?? 0 })
  }
  return bins
}
