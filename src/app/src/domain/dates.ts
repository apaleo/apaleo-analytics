import type { DateOrder } from './types.ts'

const MIN_YEAR = 2010
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ORDERS: readonly DateOrder[] = ['ymd', 'dmy', 'mdy']

/** UTC day index for the calendar date, so daylight-saving shifts do not change the count. */
export function calendarDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

/** Original analytics rejects a workflow date more than one day after today. */
export function isBeyondTomorrow(date: Date, today: Date): boolean {
  return calendarDayNumber(date) > calendarDayNumber(today) + 1
}

/**
 * True when the cell matches at least one supported CSV date format.
 * Ambiguous values such as 01/02/2026 still count, matching column detection.
 */
export function isCsvDate(value: string, now = new Date()): boolean {
  return matchingDateOrders(value, now).length > 0
}

export function matchingDateOrders(value: string, now = new Date()): DateOrder[] {
  return ORDERS.filter((order) => parseDateWithOrder(value, order, now) !== null)
}

/** Parse `value` using one locked day-month-year order. */
export function parseDateWithOrder(value: string, order: DateOrder, now = new Date()): Date | null {
  const text = stripTime(value.trim())
  if (text.length === 0) return null
  if (order === 'ymd') {
    return matchSeparated(text, 'ymd', 4, now) ?? matchCompact(text, now) ?? matchYearMonthDayShort(text, now)
  }
  if (order === 'dmy') {
    return matchSeparated(text, 'dmy', 4, now) ?? matchSeparated(text, 'dmy', 2, now) ?? matchDayMonthName(text, now)
  }
  return matchSeparated(text, 'mdy', 4, now) ?? matchSeparated(text, 'mdy', 2, now) ?? matchMonthNameDay(text, now)
}

function stripTime(value: string): string {
  if (!value.includes(':')) return value
  const cut = Math.max(value.lastIndexOf(' '), value.lastIndexOf('T'))
  return cut >= 0 ? value.slice(0, cut) : value
}

function maxExclusiveYear(now: Date): number {
  return now.getFullYear() + 5
}

function expandYear(token: string, width: 2 | 4, now: Date): number | null {
  if (token.length !== width || !isDigits(token)) return null
  const parsed = Number.parseInt(token, 10)
  const year = width === 2 ? parsed + 2000 : parsed
  if (year < MIN_YEAR || year >= maxExclusiveYear(now)) return null
  return year
}

function isDigits(value: string): boolean {
  return value.length > 0 && [...value].every((char) => char >= '0' && char <= '9')
}

function parseDigits(value: string): number | null {
  if (!isDigits(value)) return null
  return Number.parseInt(value, 10)
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function dateFromParts(year: number, month: number, day: number): Date | null {
  if (!isRealCalendarDate(year, month, day)) return null
  return new Date(year, month - 1, day)
}

function matchSeparated(value: string, order: DateOrder, yearWidth: 2 | 4, now: Date): Date | null {
  const separators = ['/', '-', '.']
  for (const separator of separators) {
    if (yearWidth === 2 && separator !== '/') continue
    if (!value.includes(separator)) continue
    const tokens = value.split(separator)
    if (tokens.length !== 3) continue
    const yearToken = order === 'ymd' ? tokens[0] : tokens[2]
    const monthToken = order === 'mdy' ? tokens[0] : tokens[1]
    const dayToken = order === 'dmy' ? tokens[0] : order === 'mdy' ? tokens[1] : tokens[2]
    if (yearToken === undefined || monthToken === undefined || dayToken === undefined) continue
    const year = expandYear(yearToken, yearWidth, now)
    const month = parseDigits(monthToken)
    const day = parseDigits(dayToken)
    if (year === null || month === null || day === null) continue
    const date = dateFromParts(year, month, day)
    if (date) return date
  }
  return null
}

function matchCompact(value: string, now: Date): Date | null {
  if (!/^\d{8}$/.test(value)) return null
  const year = expandYear(value.slice(0, 4), 4, now)
  const month = parseDigits(value.slice(4, 6))
  const day = parseDigits(value.slice(6, 8))
  if (year === null || month === null || day === null) return null
  return dateFromParts(year, month, day)
}

/** `yy/mm/dd`, zero-padded, as in the original format list. */
function matchYearMonthDayShort(value: string, now: Date): Date | null {
  if (value.length !== 8 || value[2] !== '/' || value[5] !== '/') return null
  const year = expandYear(value.slice(0, 2), 2, now)
  const month = parseDigits(value.slice(3, 5))
  const day = parseDigits(value.slice(6, 8))
  if (year === null || month === null || day === null) return null
  return dateFromParts(year, month, day)
}

function monthNumber(token: string): number | null {
  const index = MONTHS.findIndex((month) => month.toUpperCase() === token.toUpperCase())
  return index >= 0 ? index + 1 : null
}

function matchDayMonthName(value: string, now: Date): Date | null {
  if (value.length !== 10 && value.length !== 11) return null
  if (value[value.length - 5] !== ' ') return null
  const tokens = value.split(' ')
  if (tokens.length !== 3) return null
  const day = parseDigits(tokens[0] ?? '')
  const month = monthNumber(tokens[1] ?? '')
  const year = expandYear(tokens[2] ?? '', 4, now)
  if (day === null || month === null || year === null) return null
  return dateFromParts(year, month, day)
}

function matchMonthNameDay(value: string, now: Date): Date | null {
  if (value.length !== 11 && value.length !== 12) return null
  if (value[value.length - 6] !== ',') return null
  const tokens = value.split(' ')
  if (tokens.length !== 3) return null
  const month = monthNumber(tokens[0] ?? '')
  const day = parseDigits((tokens[1] ?? '').replace(/,$/, ''))
  const year = expandYear(tokens[2] ?? '', 4, now)
  if (day === null || month === null || year === null) return null
  return dateFromParts(year, month, day)
}
