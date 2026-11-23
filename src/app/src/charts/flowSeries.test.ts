import { describe, expect, it } from 'vitest'
import { loadExampleDataset } from '../data/exampleDataset.ts'
import { calendarDayNumber } from '../domain/dates.ts'
import type { Dataset, WorkItem, WorkflowStage } from '../domain/types.ts'
import { applyFilterState } from '../ui/filters/filterState.ts'
import { projectAgingWip } from './agingWip.ts'
import { cfdStackTopToBottom, cfdWindowStart, projectCumulativeFlow } from './cumulativeFlow.ts'
import { projectCycleTimeHistogram } from './cycleTimeHistogram.ts'
import { projectCycleTimeScatter, projectCycleTimeTrend } from './cycleTimeScatter.ts'
import type { CompletedItem } from './metrics.ts'
import {
  completedItems,
  dateFromCalendarDay,
  formatIsoDate,
  frequencyBins,
  inclusiveDays,
  mondayOf,
  percentileLevels,
  workflowBounds,
} from './metrics.ts'
import { projectThroughputHistogram } from './throughputHistogram.ts'

const board: WorkflowStage[] = [
  { name: 'Backlog', role: 'backlog' },
  { name: 'Build', role: 'workflow' },
  { name: 'Review', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

const pair: WorkflowStage[] = [
  { name: 'Build', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

function workItem(id: string, stageDates: (Date | null)[], blockedDays = 0): WorkItem {
  return { id, stageDates, blockedDays, attributes: {} }
}

/** Cycle time equals `cycleDays` because the count includes both the Jan 1 start and the end date. */
function finished(id: string, cycleDays: number, blockedDays = 0): WorkItem {
  return workItem(
    id,
    [new Date(2025, 11, 31), new Date(2026, 0, 1), new Date(2026, 0, 1), new Date(2026, 0, cycleDays)],
    blockedDays,
  )
}

function sample(count: number): WorkItem[] {
  return Array.from({ length: count }, (_, index) => finished(`c${index + 1}`, index + 1))
}

describe('flow metrics', () => {
  it('starts cycle time at the first workflow stage', () => {
    expect(workflowBounds(board)).toEqual({ startIndex: 1, doneIndex: 3 })
    expect(workflowBounds(pair)).toEqual({ startIndex: 0, doneIndex: 1 })
    expect(workflowBounds([])).toBeUndefined()
  })

  it('counts the start day and rounds a calendar day back to the same date', () => {
    expect(inclusiveDays(new Date(2026, 0, 4), new Date(2026, 0, 4))).toBe(1)
    const spring = new Date(2026, 2, 29)
    expect(formatIsoDate(dateFromCalendarDay(calendarDayNumber(spring)))).toBe('2026-03-29')
  })

  it('puts the 50, 70, 85, and 95th percentiles on a ten-item sample', () => {
    const levels = percentileLevels([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(levels.map((level) => level.percentile)).toEqual([50, 70, 85, 95])
    expect(levels[0]?.days).toBeCloseTo(5.5)
    expect(levels[1]?.days).toBeCloseTo(7.3)
    expect(levels[2]?.days).toBeCloseTo(8.65)
    expect(levels[3]?.days).toBeCloseTo(9.55)
  })

  it('withholds percentiles until ten items have completed', () => {
    expect(percentileLevels([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([])
  })

  it('fills missing integers in a histogram', () => {
    expect(frequencyBins([4, 2, 2])).toEqual([
      { value: 2, count: 2 },
      { value: 3, count: 0 },
      { value: 4, count: 1 },
    ])
  })

  it('starts weeks on Monday', () => {
    const wednesday = new Date(2026, 10, 11)
    expect(wednesday.getDay()).toBe(3)
    expect(formatIsoDate(mondayOf(wednesday))).toBe('2026-11-09')
    expect(formatIsoDate(mondayOf(new Date(2026, 10, 15)))).toBe('2026-11-09')
  })
})

describe('aging work in progress', () => {
  const asOf = new Date(2026, 0, 10)

  it('plots open items by current stage and age since the workflow start', () => {
    const moved = workItem('moved', [new Date(2025, 11, 1), new Date(2026, 0, 1), new Date(2026, 0, 8), null])
    const idea = workItem('idea', [new Date(2026, 0, 8), null, null, null])
    const done = finished('done', 4)
    const series = projectAgingWip([moved, idea, done, workItem('blank', [null, null, null, null])], board, asOf)

    expect(series.coloring).toBe('fixed')
    expect(series.points.map((point) => point.id)).toEqual(['idea', 'moved'])
    expect(series.points[0]).toMatchObject({ stageName: 'Backlog', ageDays: 3, stageAgeDays: 3, band: 'within50' })
    expect(series.points[1]).toMatchObject({ stageName: 'Review', ageDays: 10, stageAgeDays: 3, band: 'within70' })
  })

  it('colors age against completed cycle-time percentiles once ten items have finished', () => {
    const open = workItem('open', [new Date(2025, 11, 20), new Date(2026, 0, 5), null, null])
    const older = workItem('older', [new Date(2025, 11, 20), new Date(2026, 0, 1), null, null])
    const series = projectAgingWip([...sample(10), open, older], board, asOf)

    expect(series.coloring).toBe('percentile')
    expect(series.percentiles[0]?.days).toBeCloseTo(5.5)
    expect(series.percentiles[1]?.days).toBeCloseTo(7.3)
    expect(series.percentiles[2]?.days).toBeCloseTo(8.65)
    expect(series.percentiles[3]?.days).toBeCloseTo(9.55)
    expect(series.points.find((point) => point.id === 'open')?.band).toBe('within70')
    expect(series.points.find((point) => point.id === 'older')?.band).toBe('beyond')
  })

  it('keeps an item that finishes after the as-of date in its current stage', () => {
    const series = projectAgingWip([finished('soon', 10)], board, new Date(2026, 0, 9))
    expect(series.points.map((point) => point.stageName)).toEqual(['Review'])
  })
})

describe('cycle time charts', () => {
  it('draws percentile lines only when the filtered sample is large enough', () => {
    const asOf = new Date(2026, 1, 1)
    expect(projectCycleTimeScatter(sample(10), board, asOf).percentiles).toHaveLength(4)
    expect(projectCycleTimeScatter(sample(9), board, asOf).percentiles).toEqual([])
  })

  it('keeps blocked days inside the cycle time', () => {
    const series = projectCycleTimeScatter([finished('slow', 10, 9), finished('plain', 10, 0)], board, new Date(2026, 0, 31))
    expect(series.points.map((point) => point.cycleTimeDays)).toEqual([10, 10])
  })

  it('ignores completions after the as-of date', () => {
    expect(projectCycleTimeScatter([finished('later', 10)], board, new Date(2026, 0, 9)).points).toEqual([])
  })

  it('counts how many items share each cycle time and leaves a gap at the missing day', () => {
    const items = [
      workItem('a', [new Date(2026, 0, 1), new Date(2026, 0, 2)]),
      workItem('b', [new Date(2026, 0, 1), new Date(2026, 0, 2)]),
      workItem('c', [new Date(2026, 0, 1), new Date(2026, 0, 4)]),
    ]
    const series = projectCycleTimeHistogram(items, pair, new Date(2026, 0, 31))
    expect(series.sampleSize).toBe(3)
    expect(series.bins).toEqual([
      { value: 2, count: 2 },
      { value: 3, count: 0 },
      { value: 4, count: 1 },
    ])
    expect(series.percentiles).toEqual([])
  })
})

describe('cycle time trend', () => {
  it('rolls an 85th percentile over ten days, drops aged buckets, and carries a short window', () => {
    // Raw 85th percentile, before the moving average of the last 10 percentile points:
    // days 100–108: 16 (cycle times 2, 4, … 20; rank index floor(10 * 85 / 100) - 1 = 7)
    // day 109: 18 (those ten values plus 100 are still inside the window)
    // day 110: 18 (day 100 has aged out, one value remains, so the previous 18 is repeated — not 100)
    // day 111: 3 (the window is 100, 1, 3)
    const base = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
    const items: CompletedItem[] = [
      trendPoint('tail-a', 111, 1),
      trendPoint('tail-b', 111, 3),
      trendPoint('spike', 109, 100),
      ...base.map((cycleTimeDays, index) => trendPoint(`base-${index}`, 100, cycleTimeDays)),
    ]
    const trend = projectCycleTimeTrend(items, 85, 10)

    expect(trend.map((point) => point.completedDay)).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111])
    expect(trend.slice(0, 9).map((point) => point.days)).toEqual([16, 16, 16, 16, 16, 16, 16, 16, 16])
    expect(trend[9]?.days).toBeCloseTo(16.2)
    expect(trend[10]?.days).toBeCloseTo(16.4)
    expect(trend[11]?.days).toBeCloseTo(15.1)
    expect(trend.map((point) => point.warmup)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ])
  })

  it('trends fewer than ten items and leaves the horizontal percentile lines unchanged', () => {
    const asOf = new Date(2026, 1, 1)
    const short = projectCycleTimeScatter(sample(9), board, asOf)
    const shortPercentiles = short.percentiles
    expect(shortPercentiles).toEqual([])
    const trend = projectCycleTimeTrend(short.points, 85, 10)
    expect(trend.length).toBeGreaterThan(0)
    expect(trend.every((point) => point.warmup)).toBe(true)
    expect(short.percentiles).toBe(shortPercentiles)

    const full = projectCycleTimeScatter(sample(10), board, asOf)
    const fullPercentiles = full.percentiles
    projectCycleTimeTrend(full.points, 85, 10)
    expect(full.percentiles).toBe(fullPercentiles)
    expect(fullPercentiles.map((level) => level.percentile)).toEqual([50, 70, 85, 95])

    expect(projectCycleTimeTrend([trendPoint('a', 10, 5), trendPoint('b', 11, 9), trendPoint('c', 12, 1)], 85, 10)).toEqual([
      { completedDay: 11, days: 5, warmup: true },
      { completedDay: 12, days: 5, warmup: true },
    ])
  })
})

function trendPoint(id: string, completedDay: number, cycleTimeDays: number): CompletedItem {
  return { id, completedOn: '2026-01-01', completedDay, cycleTimeDays }
}

describe('throughput histogram', () => {
  it('counts completions per Monday week and keeps the empty week between them', () => {
    const items = [
      workItem('a', [new Date(2026, 10, 9), new Date(2026, 10, 9)]),
      workItem('b', [new Date(2026, 10, 23), new Date(2026, 10, 23)]),
    ]
    const series = projectThroughputHistogram(items, pair, new Date(2026, 11, 1))
    expect(series.sampleSize).toBe(2)
    expect(series.weekCount).toBe(3)
    expect(series.bins).toEqual([
      { value: 0, count: 1 },
      { value: 1, count: 2 },
    ])
  })
})

describe('cumulative flow', () => {
  it('orders the stacked areas top-to-bottom as New, Planned, In Progress, In Review, Merged, Done', () => {
    const stages = ['New', 'Planned', 'In Progress', 'In Review', 'Merged', 'Done'].map((name) => ({ name }))
    expect(cfdStackTopToBottom(stages).map((stage) => stage.name)).toEqual([
      'New',
      'Planned',
      'In Progress',
      'In Review',
      'Merged',
      'Done',
    ])
  })

  it('treats a Merged-prefixed stage as Merged and keeps other stages in workflow position', () => {
    const stages = ['New', 'Blocked', 'Merged / In Acceptance', 'Done'].map((name) => ({ name }))
    expect(cfdStackTopToBottom(stages).map((stage) => stage.name)).toEqual([
      'New',
      'Blocked',
      'Merged / In Acceptance',
      'Done',
    ])
  })

  it('uses the exact Merged stage when a longer Merged name is also present', () => {
    const stages = ['New', 'Merged / In Acceptance', 'Done', 'Merged'].map((name) => ({ name }))
    expect(cfdStackTopToBottom(stages).map((stage) => stage.name)).toEqual([
      'New',
      'Merged / In Acceptance',
      'Merged',
      'Done',
    ])
  })

  it('stacks the stage an item occupied at the end of each day', () => {
    const items = [
      workItem('a', [new Date(2026, 0, 1), new Date(2026, 0, 3)]),
      workItem('b', [new Date(2026, 0, 2), null]),
    ]
    const series = projectCumulativeFlow(items, pair, new Date(2026, 0, 3))
    expect(series.stages.map((stage) => stage.name)).toEqual(['Build', 'Done'])
    expect(series.points).toEqual([
      { date: '2026-01-01', values: [1, 0] },
      { date: '2026-01-02', values: [2, 0] },
      { date: '2026-01-03', values: [1, 1] },
    ])
  })

  it('keeps all time unchanged and carries the full count onto the first visible day', () => {
    const items = [
      workItem('a', [new Date(2026, 0, 1), new Date(2026, 0, 3)]),
      workItem('b', [new Date(2026, 0, 2), null]),
    ]
    const asOf = new Date(2026, 0, 3)
    const full = projectCumulativeFlow(items, pair, asOf)
    expect(projectCumulativeFlow(items, pair, asOf, 'all')).toEqual(full)

    const start = calendarDayNumber(new Date(2026, 0, 2))
    const windowed = projectCumulativeFlow(items, pair, asOf, start)
    expect(windowed.points[0]).toEqual(full.points[1])
    expect(windowed.points.map((point) => point.date)).toEqual(['2026-01-02', '2026-01-03'])
    expect(windowed.points.some((point) => point.date < '2026-01-02' || point.date > '2026-01-03')).toBe(false)
    expect(projectCumulativeFlow(items, pair, asOf, calendarDayNumber(new Date(2026, 0, 4))).points).toEqual([])
    expect(projectCumulativeFlow(items, pair, asOf, calendarDayNumber(new Date(2025, 0, 1))).points[0]?.date).toBe(
      '2026-01-01',
    )
  })

  it('clamps a month-end window and still counts work that entered before it', () => {
    expect(formatIsoDate(cfdWindowStart(new Date(2026, 2, 31), '1m') ?? new Date(0))).toBe('2026-02-28')
    expect(formatIsoDate(cfdWindowStart(new Date(2024, 2, 31), '1m') ?? new Date(0))).toBe('2024-02-29')
    expect(formatIsoDate(cfdWindowStart(new Date(2026, 4, 31), '6m') ?? new Date(0))).toBe('2025-11-30')
    expect(formatIsoDate(cfdWindowStart(new Date(2024, 1, 29), '1y') ?? new Date(0))).toBe('2023-02-28')
    expect(cfdWindowStart(new Date(2026, 10, 11), 'all')).toBeUndefined()

    const asOf = new Date(2026, 2, 31)
    const items = [workItem('held', [new Date(2026, 0, 15), new Date(2026, 1, 1)])]
    const full = projectCumulativeFlow(items, pair, asOf)
    const windowed = projectCumulativeFlow(items, pair, asOf, '1m')
    expect(windowed.points[0]).toEqual({ date: '2026-02-28', values: [0, 1] })
    expect(windowed.points[0]).toEqual(full.points.find((point) => point.date === '2026-02-28'))
    expect(windowed.points.at(-1)?.date).toBe('2026-03-31')
    expect(windowed.points.some((point) => point.date < '2026-02-28' || point.date > '2026-03-31')).toBe(false)
  })

  it('places each preset on the calendar and does not pad days before the data starts', () => {
    const asOf = new Date(2026, 10, 11)
    const item = workItem('long', [new Date(2024, 0, 1), null])
    const full = projectCumulativeFlow([item], pair, asOf)
    const expected = {
      '1m': '2026-10-11',
      '3m': '2026-08-11',
      '6m': '2026-05-11',
      '1y': '2025-11-11',
    } as const
    for (const range of ['1m', '3m', '6m', '1y'] as const) {
      const series = projectCumulativeFlow([item], pair, asOf, range)
      expect(series.points[0]?.date).toBe(expected[range])
      expect(series.points.at(-1)?.date).toBe('2026-11-11')
      expect(series.points[0]).toEqual(full.points.find((point) => point.date === expected[range]))
      expect(series.points.some((point) => point.date < expected[range] || point.date > '2026-11-11')).toBe(false)
    }
    expect(projectCumulativeFlow([item], pair, asOf, 'all')).toEqual(full)
    expect(full.points[0]?.date).toBe('2024-01-01')

    const late = projectCumulativeFlow([workItem('late', [new Date(2026, 10, 1), null])], pair, asOf, '1y')
    expect(late.points[0]?.date).toBe('2026-11-01')
    expect(late.points.at(-1)?.date).toBe('2026-11-11')
  })
})

describe('example dataset projections', () => {
  const asOf = new Date(2026, 10, 11)
  const dataset = loadExampleDataset(asOf)
  const stages = dataset.metadata.stages

  it('ages the three open example items and lines up the completed sample', () => {
    const aging = projectAgingWip(dataset.items, stages, asOf)
    expect(aging.points.map((point) => point.id).sort()).toEqual(['AA-113', 'AA-114', 'AA-115'])
    expect(aging.coloring).toBe('percentile')
    expect(aging.points.find((point) => point.id === 'AA-115')).toMatchObject({
      stageName: 'Ready',
      ageDays: inclusiveDays(new Date(2026, 9, 6), asOf),
    })
    expect(aging.points.find((point) => point.id === 'AA-114')?.stageName).toBe('Review')
    expect(aging.points.find((point) => point.id === 'AA-113')?.stageName).toBe('In Progress')

    const scatter = projectCycleTimeScatter(dataset.items, stages, asOf)
    expect(scatter.points).toHaveLength(12)
    expect(scatter.points.find((point) => point.id === 'AA-101')).toMatchObject({
      cycleTimeDays: 10,
      completedOn: '2026-01-15',
    })
    expect(scatter.percentiles.map((level) => level.percentile)).toEqual([50, 70, 85, 95])
    const days = scatter.percentiles.map((level) => level.days)
    expect(days[0]).toBeLessThanOrEqual(days[1] ?? 0)
    expect(days[1]).toBeLessThanOrEqual(days[2] ?? 0)
    expect(days[2]).toBeLessThanOrEqual(days[3] ?? 0)
  })

  it('follows the filtered item list instead of the whole sheet', () => {
    const bugs = dataset.items.filter((item) => item.attributes.Type === 'Bug')
    const series = projectCycleTimeScatter(bugs, stages, asOf)
    expect(series.points.map((point) => point.id)).toEqual(['AA-102', 'AA-105', 'AA-108', 'AA-112'])
    expect(series.percentiles).toEqual([])
    expect(completedItems(bugs, stages, asOf)).toHaveLength(4)
  })

  it('builds a cycle-time histogram, a weekly throughput histogram, and a daily flow', () => {
    const histogram = projectCycleTimeHistogram(dataset.items, stages, asOf)
    expect(histogram.sampleSize).toBe(12)
    expect(histogram.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(12)
    expect(histogram.percentiles).toHaveLength(4)

    const throughput = projectThroughputHistogram(dataset.items, stages, asOf)
    expect(throughput.sampleSize).toBe(12)
    expect(throughput.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(throughput.weekCount)

    const flow = projectCumulativeFlow(dataset.items, stages, asOf)
    expect(flow.points[0]).toEqual({ date: '2026-01-05', values: [1, 0, 0, 0, 0] })
    expect(flow.points.at(-1)).toEqual({ date: '2026-11-11', values: [0, 1, 1, 1, 12] })
    expect(flow.points.some((point) => point.date === '2026-11-12')).toBe(false)
  })
})

describe('cumulative flow after workflow projection', () => {
  const stages: WorkflowStage[] = [
    { name: 'New', role: 'backlog' },
    { name: 'Build', role: 'workflow' },
    { name: 'Done', role: 'workflow' },
  ]

  function tracked(id: string, stageDates: (Date | null)[], state: string): WorkItem {
    return { id, stageDates, blockedDays: 0, attributes: { State: state } }
  }

  const dataset: Dataset = {
    metadata: {
      sourceName: 'Synthetic',
      idColumn: 'ID',
      stages,
      attributeColumns: ['State'],
      dateOrder: 'ymd',
    },
    warnings: [],
    items: [
      tracked('only-new', [new Date(2026, 0, 1), null, null], 'New'),
      tracked('finished', [new Date(2026, 0, 1), new Date(2026, 0, 2), new Date(2026, 0, 4)], 'Done'),
      tracked('building', [new Date(2026, 0, 1), new Date(2026, 0, 3), null], 'Build'),
    ],
  }

  it('omits unchecked New and Done, ignores a day spent only in New, and keeps a finished item in the last remaining stage', () => {
    const view = applyFilterState(dataset, { selectedAttributes: {}, enabledStages: ['Build'] })
    expect(view.stages.map((stage) => stage.name)).toEqual(['Build'])
    expect(view.items).toHaveLength(3)
    expect(view.items.find((item) => item.id === 'only-new')?.stageDates).toEqual([null])

    const series = projectCumulativeFlow(view.items, view.stages, new Date(2026, 0, 4))
    expect(series.stages.map((stage) => stage.name)).toEqual(['Build'])
    expect(series.points).toEqual([
      { date: '2026-01-02', values: [1] },
      { date: '2026-01-03', values: [2] },
      { date: '2026-01-04', values: [2] },
    ])
  })

  it('keeps an item in the last remaining stage after Done is removed', () => {
    const view = applyFilterState(dataset, { selectedAttributes: {}, enabledStages: ['New', 'Build'] })
    const series = projectCumulativeFlow(view.items, view.stages, new Date(2026, 0, 4))
    expect(series.stages.map((stage) => stage.name)).toEqual(['New', 'Build'])
    expect(series.points.at(-1)).toEqual({ date: '2026-01-04', values: [1, 2] })
  })

  it('keeps the New series when a State filter selects an item that already left New', () => {
    const view = applyFilterState(dataset, {
      selectedAttributes: { State: ['Done'] },
      enabledStages: stages.map((stage) => stage.name),
    })
    expect(view.stages.map((stage) => stage.name)).toEqual(['New', 'Build', 'Done'])
    expect(view.items.map((item) => item.id)).toEqual(['finished'])

    const series = projectCumulativeFlow(view.items, view.stages, new Date(2026, 0, 4))
    expect(series.stages.map((stage) => stage.name)).toEqual(['New', 'Build', 'Done'])
    expect(series.points[0]).toEqual({ date: '2026-01-01', values: [1, 0, 0] })
    expect(series.points.at(-1)).toEqual({ date: '2026-01-04', values: [0, 0, 1] })
  })
})
