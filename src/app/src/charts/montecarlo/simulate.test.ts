import { describe, expect, it } from 'vitest'
import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import {
  DEFAULT_GRAIN,
  DEFAULT_TRIALS,
  MAX_REMAINING,
  MAX_TRIALS,
  TRIAL_OPTIONS,
  clampTrials,
  coefficientOfVariation,
  createRandom,
  drawSample,
  forecastDate,
  forecastPercentiles,
  forecastRemaining,
  formatWhenTick,
  histogramBins,
  howManyMonthTicks,
  percentileAtLeast,
  percentileAtMost,
  predictabilityOf,
  simulateHowMany,
  simulateHowManyChunked,
  simulateWhen,
  simulateWhenChunked,
  throughputSamples,
} from './simulate.ts'

const stages: WorkflowStage[] = [
  { name: 'Build', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

function item(id: string, stageDates: (Date | null)[]): WorkItem {
  return { id, stageDates, blockedDays: 0, attributes: {} }
}

describe('monte carlo sampling', () => {
  it('repeats a seeded stream and moves forward inside one stream', () => {
    const left = createRandom(7)
    const right = createRandom(7)
    const sequence = [left(), left(), left()]
    expect(sequence).toEqual([right(), right(), right()])
    expect(new Set(sequence).size).toBeGreaterThan(1)
    expect(createRandom(1)()).not.toBe(createRandom(2)())
  })

  it('draws with replacement and leaves a one-value history unread', () => {
    const draws = [0, 0.99, 0, 0.99]
    let index = 0
    const random = () => draws[index++] ?? 0
    expect(drawSample([1, 10], random)).toBe(1)
    expect(drawSample([1, 10], random)).toBe(10)
    expect(index).toBe(2)

    let calls = 0
    expect(drawSample([4], () => {
      calls += 1
      return 0.2
    })).toBe(4)
    expect(calls).toBe(0)
  })

  it('clamps the trial count and keeps the chart default inside the cap', () => {
    expect(DEFAULT_TRIALS).toBe(10_000)
    expect(DEFAULT_GRAIN).toBe('week')
    expect(TRIAL_OPTIONS).toEqual([10_000, 100_000, 500_000, 1_000_000])
    expect(clampTrials(Number.NaN)).toBe(10_000)
    expect(clampTrials(0)).toBe(1)
    expect(clampTrials(5_000.9)).toBe(5_000)
    expect(clampTrials(MAX_TRIALS)).toBe(1_000_000)
    expect(clampTrials(MAX_TRIALS + 1)).toBe(1_000_000)
  })
})

describe('how many', () => {
  it('sums a constant throughput exactly', () => {
    const histogram = simulateHowMany([2], 3, 20, () => 0.5)
    expect(histogram.trials).toBe(20)
    expect(histogram.counts[6]).toBe(20)
    expect(forecastPercentiles(histogram, 'atLeast').map((level) => level.value)).toEqual([6, 6, 6, 6])
  })

  it('uses the supplied draws for each period and ignores a dead history', () => {
    const draws = [0, 0.99, 0, 0.99]
    let index = 0
    const histogram = simulateHowMany([1, 10], 2, 2, () => draws[index++] ?? 0)
    expect(histogram.counts[11]).toBe(2)
    expect(index).toBe(4)
    expect(simulateHowMany([0, 0, 0], 10, 50, () => 0.3)).toEqual({
      counts: [],
      trials: 0,
      cumulativeMean: [],
    })
    expect(simulateHowMany([1], 0, 10, () => 0)).toEqual({ counts: [], trials: 0, cumulativeMean: [] })
  })

  it('starts the cumulative path at today and tracks the mean through the window', () => {
    const result = simulateHowMany([2], 3, 10, () => 0.5)
    expect(result.cumulativeMean).toEqual([0, 2, 4, 6])
  })

  it('labels How Many ticks with today and following month starts', () => {
    const asOf = new Date(2026, 10, 11) // 11 Nov 2026
    expect(howManyMonthTicks(asOf, 60, 'day')).toEqual([0, 20, 51, 60])
    expect(formatWhenTick(asOf, 0, 'day')).toBe('Nov 11, 2026')
    expect(formatWhenTick(asOf, 20, 'day')).toBe('Dec 1, 2026')
    expect(formatWhenTick(asOf, 51, 'day')).toBe('Jan 1, 2027')
    expect(formatWhenTick(asOf, 63, 'week')).toBe('Jan 26, 2028')
  })

  it('reads the high end of the histogram as an at-least count', () => {
    const counts = [10, 20, 30, 40]
    expect(percentileAtLeast(counts, 100, 50)).toBe(2)
    expect(percentileAtLeast(counts, 100, 70)).toBe(2)
    expect(percentileAtLeast(counts, 100, 85)).toBe(1)
    expect(percentileAtLeast(counts, 100, 95)).toBe(0)
    expect(percentileAtLeast([0, 0, 5, 0, 5], 10, 100)).toBe(2)
  })

  it('is the same run when the seed is the same', () => {
    const samples = [0, 1, 2, 4]
    const left = simulateHowMany(samples, 8, 200, createRandom(42))
    const right = simulateHowMany(samples, 8, 200, createRandom(42))
    expect(left).toEqual(right)
    expect(left.trials).toBe(200)
    expect(left.counts.reduce((sum, count) => sum + count, 0)).toBe(200)
    const other = simulateHowMany(samples, 8, 200, createRandom(43))
    expect(other.counts).not.toEqual(left.counts)
  })
})

describe('when', () => {
  it('counts the draws needed to finish the remaining items', () => {
    const one = simulateWhen([1], 5, 12, () => 0.4)
    expect(one.counts[5]).toBe(12)
    expect(forecastPercentiles(one, 'atMost').map((level) => level.value)).toEqual([5, 5, 5, 5])

    const draws = [0.9, 0, 0.9]
    let index = 0
    const mixed = simulateWhen([0, 5], 5, 2, () => draws[index++] ?? 0)
    expect(mixed.counts[2]).toBe(1)
    expect(mixed.counts[1]).toBe(1)
  })

  it('finishes immediately when nothing remains and skips a dead history', () => {
    expect(simulateWhen([3], 0, 4, () => 0.2)).toEqual({ counts: [4], trials: 4 })
    expect(simulateWhen([0, 0], 8, 4, () => 0.2)).toEqual({ counts: [], trials: 0 })
  })

  it('reads the low end of the histogram as a finish-by count', () => {
    const counts = [10, 20, 30, 40]
    expect(percentileAtMost(counts, 100, 50)).toBe(2)
    expect(percentileAtMost(counts, 100, 85)).toBe(3)
    expect(percentileAtMost(counts, 100, 95)).toBe(3)
    expect(percentileAtMost([0, 0, 5, 0, 5], 10, 100)).toBe(4)
    expect(histogramBins([0, 0, 2, 0, 3])).toEqual([
      { value: 2, count: 2 },
      { value: 3, count: 0 },
      { value: 4, count: 3 },
    ])
    expect(histogramBins([0, 0, 2, 0, 3], { startAt: 0 })).toEqual([
      { value: 0, count: 0 },
      { value: 1, count: 0 },
      { value: 2, count: 2 },
      { value: 3, count: 0 },
      { value: 4, count: 3 },
    ])
  })

  it('places the forecast date on the as-of calendar', () => {
    const asOf = new Date(2026, 0, 10)
    expect(forecastDate(asOf, 0, 'day')).toBe('2026-01-10')
    expect(forecastDate(asOf, 0, 'week')).toBe('2026-01-10')
    expect(forecastDate(asOf, 2, 'day')).toBe('2026-01-12')
    expect(forecastDate(asOf, 2, 'week')).toBe('2026-01-24')
    expect(formatWhenTick(asOf, 0, 'day')).toBe('Jan 10, 2026')
    expect(formatWhenTick(asOf, 0, 'week')).toBe('Jan 10, 2026')
    expect(formatWhenTick(asOf, 1, 'week')).toBe('Jan 17, 2026')
  })

  it('adds open workflow items and extra items, and treats zero as nothing to forecast', () => {
    expect(forecastRemaining(true, 4, 2)).toBe(6)
    expect(forecastRemaining(false, 4, 2)).toBe(2)
    expect(forecastRemaining(true, 0, 0)).toBe(0)
    expect(forecastRemaining(false, 9, 0)).toBe(0)
    expect(forecastRemaining(true, 4.9, 0)).toBe(4)
    expect(forecastRemaining(true, 4_000, 2_000)).toBe(MAX_REMAINING)
    expect(forecastRemaining(true, Number.NaN, 3)).toBe(3)
  })
})

describe('chunked runs', () => {
  it('matches a seeded 100K How Many run and yields between slices', async () => {
    const samples = [0, 1, 2, 4]
    const sync = simulateHowMany(samples, 8, 100_000, createRandom(42))
    let pauses = 0
    const chunked = await simulateHowManyChunked(samples, 8, 100_000, createRandom(42), {
      maxSlice: 25_000,
      budgetMs: 60_000,
      yield: async () => {
        pauses += 1
      },
    })
    expect(chunked).toEqual(sync)
    expect(chunked.trials).toBe(100_000)
    expect(pauses).toBe(3)
  })

  it('matches a seeded When run and can stop early', async () => {
    const sync = simulateWhen([1, 3], 6, 20_000, createRandom(9))
    const chunked = await simulateWhenChunked([1, 3], 6, 20_000, createRandom(9), {
      budgetMs: 60_000,
      yield: async () => {},
    })
    expect(chunked).toEqual(sync)

    let pauses = 0
    const stopped = await simulateHowManyChunked([1], 1, 10_000, () => 0, {
      budgetMs: 60_000,
      maxSlice: 1_000,
      yield: async () => {
        pauses += 1
      },
      shouldCancel: () => pauses >= 1,
    })
    expect(stopped.trials).toBe(1_000)
    expect(pauses).toBe(1)
  })

  it('yields during a long When trial instead of holding the thread for every draw', async () => {
    let pauses = 0
    const histogram = await simulateWhenChunked([1], 3_500, 1, () => 0, {
      budgetMs: 0,
      yield: async () => {
        pauses += 1
      },
    })
    expect(histogram.trials).toBe(1)
    expect(histogram.counts[3_500]).toBe(1)
    expect(pauses).toBeGreaterThan(1)
  })
})

describe('throughput samples', () => {
  it('fills silent days and silent weeks between the first and last completion', () => {
    const items = [
      item('a', [new Date(2026, 0, 5), new Date(2026, 0, 5)]),
      item('b', [new Date(2026, 0, 5), new Date(2026, 0, 7)]),
      item('c', [new Date(2026, 0, 5), new Date(2026, 0, 19)]),
    ]
    const asOf = new Date(2026, 0, 31)
    expect(throughputSamples(items, stages, asOf, 'day')).toEqual([
      1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ])
    expect(throughputSamples(items, stages, asOf, 'week')).toEqual([2, 0, 1])
    expect(throughputSamples([], stages, asOf, 'day')).toEqual([])
  })

  it('scores a flat throughput as stable and a zero history as unknown', () => {
    expect(coefficientOfVariation([1, 1, 1])).toBe(0)
    expect(predictabilityOf(0)).toBe('stable')
    expect(predictabilityOf(0.5)).toBe('moderate')
    expect(predictabilityOf(1)).toBe('variable')
    expect(coefficientOfVariation([0, 0])).toBeUndefined()
    expect(predictabilityOf(undefined)).toBe('unknown')
    expect(coefficientOfVariation([])).toBeUndefined()
  })
})
