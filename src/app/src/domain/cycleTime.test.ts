import { describe, expect, it } from 'vitest'
import type { WorkItem } from './types.ts'
import { activeStageIndex, cycleTimeBetweenStages, hasEnteredStage, stageTimeDays } from './cycleTime.ts'

function item(stageDates: (Date | null)[], blockedDays = 0): WorkItem {
  return { id: '1', stageDates, blockedDays, attributes: {} }
}

describe('cycleTimeBetweenStages', () => {
  it('counts a same-day move as one day', () => {
    const workItem = item([new Date(2026, 0, 4), new Date(2026, 0, 4)])
    expect(cycleTimeBetweenStages(workItem, 0, 1)).toBe(1)
  })

  it('counts inclusive days between stage entry dates', () => {
    const workItem = item([
      new Date(2026, 0, 6),
      new Date(2026, 0, 8),
      new Date(2026, 0, 15),
    ])
    expect(cycleTimeBetweenStages(workItem, 0, 2)).toBe(10)
    expect(stageTimeDays(workItem, 0)).toBe(2)
  })

  it('returns undefined when the end stage has not been entered', () => {
    const workItem = item([new Date(2026, 0, 6), null])
    expect(cycleTimeBetweenStages(workItem, 0, 1)).toBeUndefined()
  })

  it('keeps blocked days in the cycle time unless they are excluded', () => {
    const workItem = item([new Date(2026, 0, 6), new Date(2026, 0, 15)], 4)
    expect(cycleTimeBetweenStages(workItem, 0, 1)).toBe(10)
    expect(cycleTimeBetweenStages(workItem, 0, 1, { includeBlockedTime: false })).toBe(6)
  })

  it('does not let excluded blocked time fall below one day', () => {
    const workItem = item([new Date(2026, 0, 6), new Date(2026, 0, 7)], 9)
    expect(cycleTimeBetweenStages(workItem, 0, 1, { includeBlockedTime: false })).toBe(1)
  })
})

describe('stage presence', () => {
  const workItem = item([new Date(2026, 0, 1), new Date(2026, 0, 5), null])

  it('selects the rightmost stage entered on or before the as-of date', () => {
    expect(activeStageIndex(workItem, new Date(2025, 11, 31))).toBeUndefined()
    expect(activeStageIndex(workItem, new Date(2026, 0, 4))).toBe(0)
    expect(activeStageIndex(workItem, new Date(2026, 0, 5))).toBe(1)
  })

  it('reports whether the item has entered a stage', () => {
    expect(hasEnteredStage(workItem, 1, new Date(2026, 0, 4))).toBe(false)
    expect(hasEnteredStage(workItem, 1, new Date(2026, 0, 5))).toBe(true)
    expect(hasEnteredStage(workItem, 2)).toBe(false)
  })
})
