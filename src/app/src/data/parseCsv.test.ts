import { describe, expect, it } from 'vitest'
import { parseCsv } from './parseCsv.ts'

const today = new Date(2026, 10, 11)

describe('parseCsv', () => {
  it('parses quoted commas and a timestamp into stage dates', () => {
    const result = parseCsv('ID,Title,Start,Done\n1,"Hello, world",2026-01-15T08:30:00,2026-01-16 18:00:00', {
      today,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.items[0]?.title).toBe('Hello, world')
    expect(result.dataset.metadata.dateOrder).toBe('ymd')
    const start = result.dataset.items[0]?.stageDates[0]
    expect(start?.getFullYear()).toBe(2026)
    expect(start?.getMonth()).toBe(0)
    expect(start?.getDate()).toBe(15)
  })

  it('reads a European date when the day cannot be a month', () => {
    const result = parseCsv('ID,Start,Done\n1,15/01/2026,20/01/2026', { today })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.dateOrder).toBe('dmy')
    expect(result.dataset.items[0]?.stageDates[0]?.getMonth()).toBe(0)
    expect(result.dataset.items[0]?.stageDates[0]?.getDate()).toBe(15)
  })

  it('defaults ambiguous numeric dates to month/day/year', () => {
    const result = parseCsv('ID,Start,Done\n1,01/02/2026,01/03/2026', { today })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.dateOrder).toBe('mdy')
    expect(result.dataset.warnings.some((warning) => warning.includes('mm/dd/yyyy'))).toBe(true)
    expect(result.dataset.items[0]?.stageDates[0]?.getMonth()).toBe(0)
    expect(result.dataset.items[0]?.stageDates[0]?.getDate()).toBe(2)
  })

  it('rejects the file when a workflow cell is not a date before the format is known', () => {
    const result = parseCsv('ID,Start,Done\n1,01/02/2026,01/03/2026\n2,nope,01/04/2026', { today })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Unrecognized date format')
  })

  it('skips a row with an invalid date after the format is locked', () => {
    const result = parseCsv('ID,Start,Done\n1,2026-01-01,2026-01-02\n2,not-a-date,2026-01-04', { today })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.items.map((item) => item.id)).toEqual(['1'])
    expect(result.dataset.warnings.some((warning) => warning.includes('invalid date'))).toBe(true)
  })

  it('skips future dates and decreasing stage dates', () => {
    const future = parseCsv('ID,Start,Done\n1,2026-12-01,2026-12-05', { today })
    expect(future.ok).toBe(true)
    if (future.ok) {
      expect(future.dataset.items).toHaveLength(0)
      expect(future.dataset.warnings.some((warning) => warning.includes('future date'))).toBe(true)
    }

    const decreasing = parseCsv('ID,Start,Middle,Done\n1,2026-01-10,,2026-01-04', { today })
    expect(decreasing.ok).toBe(true)
    if (decreasing.ok) {
      expect(decreasing.dataset.items).toHaveLength(0)
      expect(decreasing.dataset.warnings.some((warning) => warning.includes('decreasing date'))).toBe(true)
    }
  })

  it('fills a skipped stage with the next stage date', () => {
    const result = parseCsv('ID,Start,Middle,Done\n1,2026-01-02,,2026-01-08', { today })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const dates = result.dataset.items[0]?.stageDates ?? []
    expect(dates[1]?.getTime()).toBe(dates[2]?.getTime())
    expect(dates[2]?.getDate()).toBe(8)
  })
})
