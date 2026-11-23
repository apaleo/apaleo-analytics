import { describe, expect, it } from 'vitest'
import { completedSinceIso, defaultLinearSince, issueInCompletedWindow, linearClosedThrough } from './since.ts'

describe('defaultLinearSince', () => {
  it('is the first day of the month three months ago', () => {
    expect(defaultLinearSince(new Date(2026, 10, 11))).toBe('2026-08-01')
    expect(defaultLinearSince(new Date(2026, 10, 1))).toBe('2026-08-01')
    expect(defaultLinearSince(new Date(2026, 7, 31))).toBe('2026-05-01')
  })

  it('crosses the year boundary', () => {
    expect(defaultLinearSince(new Date(2026, 1, 15))).toBe('2025-11-01')
    expect(defaultLinearSince(new Date(2026, 0, 1))).toBe('2025-10-01')
    expect(defaultLinearSince(new Date(2026, 2, 31))).toBe('2025-12-01')
  })
})

describe('linear closed-through watermark', () => {
  it('uses the latest completed day and falls back to since', () => {
    expect(
      linearClosedThrough(
        ['2026-09-02T15:00:00.000Z', null, '2026-10-20T23:30:00.000Z', '   '],
        '2026-08-01',
      ),
    ).toBe('2026-10-20')
    expect(linearClosedThrough([null, ''], '2026-08-01')).toBe('2026-08-01')
  })

  it('compares completions against local midnight, including that instant', () => {
    const since = completedSinceIso('2026-08-01')
    expect(since).toBe(new Date(2026, 7, 1).toISOString())
    expect(since).not.toBeNull()
    if (since === null) return
    expect(issueInCompletedWindow(null, since)).toBe(true)
    expect(issueInCompletedWindow(since, since)).toBe(true)
    expect(issueInCompletedWindow(new Date(Date.parse(since) - 1).toISOString(), since)).toBe(false)
    expect(issueInCompletedWindow('2026-09-01T12:00:00.000Z', since)).toBe(true)
  })
})
