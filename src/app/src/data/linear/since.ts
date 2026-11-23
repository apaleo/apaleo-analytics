import { formatIsoDate, parseIsoDate } from '../isoDate.ts'

/** `YYYY-MM-DD` of the first local calendar day of the month three months ago. */
export function defaultLinearSince(now = new Date()): string {
  return formatIsoDate(new Date(now.getFullYear(), now.getMonth() - 3, 1))
}

/** UTC ISO instant of local midnight on a `YYYY-MM-DD` day. */
export function completedSinceIso(day: string): string | null {
  const date = parseIsoDate(day)
  if (date === null) return null
  return date.toISOString()
}

/** Calendar day prefix of a Linear timestamp, or null when it is not a date. */
export function completedDay(value: string): string | null {
  const date = parseIsoDate(value)
  if (date === null) return null
  return formatIsoDate(date)
}

/**
 * Latest completed day among the given timestamps.
 * Blank and unparseable values are ignored. With no completed day, `since` is the floor.
 */
export function linearClosedThrough(completedAts: readonly (string | null | undefined)[], since: string): string {
  let max: string | null = null
  for (const value of completedAts) {
    if (value === null || value === undefined || value.trim().length === 0) continue
    const day = completedDay(value)
    if (day === null) continue
    if (max === null || day > max) max = day
  }
  return max ?? since
}

/** Open issues stay. A completed issue stays when its instant is on or after local midnight of the since day. */
export function issueInCompletedWindow(completedAt: string | null, completedSince: string): boolean {
  if (completedAt === null || completedAt.trim().length === 0) return true
  const completed = Date.parse(completedAt)
  const since = Date.parse(completedSince)
  if (!Number.isFinite(completed) || !Number.isFinite(since)) return false
  return completed >= since
}
