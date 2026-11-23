import { describe, expect, it } from 'vitest'
import { loadExampleDataset } from '../data/exampleDataset.ts'
import { applySubIssueFilter } from '../domain/subIssues.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { projectFlowEfficiency } from './flowEfficiency.ts'
import { mondayIndex, projectHeatMap } from './heatMap.ts'
import { formatIsoDate } from './metrics.ts'
import { projectThroughputRun, trailingAverage } from './throughputRun.ts'
import { projectWipRun } from './wipRun.ts'

const board: WorkflowStage[] = [
  { name: 'Backlog', role: 'backlog' },
  { name: 'Ready', role: 'workflow' },
  { name: 'Build', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

const pair: WorkflowStage[] = [
  { name: 'Build', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

const three: WorkflowStage[] = [
  { name: 'Ready', role: 'workflow' },
  { name: 'Build', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

function workItem(id: string, stageDates: (Date | null)[], blockedDays = 0): WorkItem {
  return { id, stageDates, blockedDays, attributes: {} }
}

describe('trailing average', () => {
  it('divides by the days seen so far, then by the window', () => {
    expect(trailingAverage([1, 1, 1, 1], 2)).toEqual([1, 1, 1, 1])
    expect(trailingAverage([1, 0, 1], 7)).toEqual([1, 0.5, 2 / 3])
  })
})

describe('throughput run chart', () => {
  it('fills the idle day between completions and keeps a same-day pair together', () => {
    const items = [
      workItem('a', [new Date(2026, 0, 5), new Date(2026, 0, 5)]),
      workItem('b', [new Date(2026, 0, 5), new Date(2026, 0, 5)]),
      workItem('c', [new Date(2026, 0, 6), new Date(2026, 0, 7)]),
    ]
    const series = projectThroughputRun(items, pair, new Date(2026, 0, 31))
    expect(series.sampleSize).toBe(3)
    expect(series.dayCount).toBe(3)
    expect(series.points.map((point) => point.count)).toEqual([2, 0, 1])
    expect(series.points.map((point) => point.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(series.average).toBeCloseTo(1)
    expect(series.points.map((point) => point.trailing)).toEqual([2, 1, 1])
  })

  it('ignores a completion after the as-of date', () => {
    const series = projectThroughputRun(
      [workItem('later', [new Date(2026, 0, 1), new Date(2026, 0, 10)])],
      pair,
      new Date(2026, 0, 5),
    )
    expect(series.points).toEqual([])
  })
})

describe('WIP run chart', () => {
  const asOf = new Date(2026, 0, 4)

  it('counts an item from the day it enters until the day before it is done', () => {
    const items = [
      workItem('a', [new Date(2026, 0, 1), new Date(2026, 0, 3)]),
      workItem('b', [new Date(2026, 0, 2), null]),
    ]
    const series = projectWipRun(items, pair, asOf)
    expect(series.points.map((point) => [point.date, point.wip])).toEqual([
      ['2026-01-01', 1],
      ['2026-01-02', 2],
      ['2026-01-03', 1],
      ['2026-01-04', 1],
    ])
    expect(series.ending).toBe(1)
    expect(series.endingOn).toBe('2026-01-04')
    expect(series.average).toBeCloseTo(1.25)
  })

  it('ignores backlog-only items and counts from the first workflow stage', () => {
    const backlogOnly = workItem('idea', [new Date(2026, 0, 2), null, null, null])
    expect(projectWipRun([backlogOnly], board, asOf)).toEqual({
      points: [],
      average: 0,
      ending: 0,
      endingOn: '',
    })

    const planned = workItem('active', [new Date(2026, 0, 1), new Date(2026, 0, 2), null, null])
    const series = projectWipRun([planned], board, asOf)
    expect(series.points[0]?.date).toBe('2026-01-02')
    expect(series.ending).toBe(1)
  })

  it('leaves a same-day completion out of WIP and still shows the day', () => {
    const series = projectWipRun([workItem('flash', [new Date(2026, 0, 2), new Date(2026, 0, 2)])], pair, asOf)
    expect(series.points.map((point) => point.wip)).toEqual([0, 0, 0])
  })

  it('counts an item currently in New and drops a sub-issue unless the shared toggle is on', () => {
    const stages: WorkflowStage[] = [
      { name: 'New', role: 'workflow' },
      { name: 'In Progress', role: 'workflow' },
      { name: 'Done', role: 'workflow' },
    ]
    const day = new Date(2026, 0, 10)
    const items = [
      { ...workItem('parent', [new Date(2026, 0, 1), new Date(2026, 0, 2), null]) },
      { ...workItem('child', [new Date(2026, 0, 1), new Date(2026, 0, 2), null]), parentId: 'linear-parent' },
      workItem('fresh', [new Date(2026, 0, 3), null, null]),
      workItem('finished', [new Date(2026, 0, 1), new Date(2026, 0, 2), day]),
    ]
    expect(projectWipRun(applySubIssueFilter(items, false), stages, day).ending).toBe(2)
    expect(projectWipRun(applySubIssueFilter(items, true), stages, day).ending).toBe(3)
  })

  it('keeps an item that finishes after the as-of date', () => {
    const series = projectWipRun(
      [workItem('soon', [new Date(2026, 0, 1), new Date(2026, 0, 10)])],
      pair,
      new Date(2026, 0, 5),
    )
    expect(series.points.every((point) => point.wip === 1)).toBe(true)
    expect(series.endingOn).toBe('2026-01-05')
  })
})

describe('flow efficiency', () => {
  const asOf = new Date(2026, 1, 1)

  it('uses blocked days when they are recorded and caps them at the cycle time', () => {
    const slow = workItem('slow', [new Date(2026, 0, 1), new Date(2026, 0, 7)], 2)
    const blocked = workItem('blocked', [new Date(2026, 0, 1), new Date(2026, 0, 7)], 9)
    const series = projectFlowEfficiency([slow, blocked], pair, asOf, true)
    expect(series.basis).toBe('blocked')
    expect(series.items).toEqual([
      { id: 'blocked', spanDays: 7, activeDays: 0, waitDays: 7, efficiencyPercent: 0 },
      { id: 'slow', spanDays: 7, activeDays: 5, waitDays: 2, efficiencyPercent: 71 },
    ])
    expect(series.averagePercent).toBeCloseTo((100 * 5) / 14)
    expect(series.activeDays + series.waitDays).toBe(series.spanDays)
    expect(series.bins[0]).toEqual({ value: 0, count: 1 })
    expect(series.bins.at(-1)).toEqual({ value: 71, count: 1 })
  })

  it('approximates waiting time from the first workflow stage when blocked days are absent', () => {
    const queued = workItem('queued', [new Date(2026, 0, 1), new Date(2026, 0, 5), new Date(2026, 0, 7)], 10)
    const series = projectFlowEfficiency([queued], three, asOf, false)
    expect(series.basis).toBe('stage-dwell')
    expect(series.items[0]).toEqual({ id: 'queued', spanDays: 7, activeDays: 3, waitDays: 4, efficiencyPercent: 43 })
  })

  it('treats a two-stage board as fully active when there is no blocked-days column', () => {
    const series = projectFlowEfficiency(
      [workItem('doing', [new Date(2026, 0, 1), new Date(2026, 0, 7)], 9)],
      pair,
      asOf,
      false,
    )
    expect(series.items[0]).toMatchObject({ waitDays: 0, activeDays: 7, efficiencyPercent: 100 })
  })

  it('counts a same-day completion as one active day unless it was blocked', () => {
    const clear = workItem('clear', [new Date(2026, 0, 4), new Date(2026, 0, 4)], 0)
    const held = workItem('held', [new Date(2026, 0, 4), new Date(2026, 0, 4)], 3)
    const series = projectFlowEfficiency([clear, held], pair, asOf, true)
    expect(series.items.find((item) => item.id === 'clear')?.efficiencyPercent).toBe(100)
    expect(series.items.find((item) => item.id === 'held')).toMatchObject({ spanDays: 1, waitDays: 1, efficiencyPercent: 0 })
  })
})

describe('heat map', () => {
  it('numbers Monday as the first row and keeps a Sunday in that week', () => {
    const sunday = new Date(2026, 0, 18)
    expect(sunday.getDay()).toBe(0)
    expect(mondayIndex(sunday)).toBe(6)
    expect(formatIsoDate(sunday)).toBe('2026-01-18')

    const items = [
      workItem('mon', [new Date(2026, 0, 12), new Date(2026, 0, 12)]),
      workItem('sun', [new Date(2026, 0, 12), sunday]),
      workItem('sun2', [new Date(2026, 0, 12), sunday]),
    ]
    const series = projectHeatMap(items, pair, new Date(2026, 0, 31))
    expect(series.weeks).toEqual(['2026-01-12'])
    expect(series.total).toBe(3)
    expect(series.max).toBe(2)
    expect(series.counts[0]).toEqual([1])
    expect(series.dates[0]).toEqual(['2026-01-12'])
    expect(series.counts[6]).toEqual([2])
    expect(series.dates[6]).toEqual(['2026-01-18'])
    expect(series.counts[3]).toEqual([0])
  })
})

describe('example dataset run charts', () => {
  const asOf = new Date(2026, 10, 11)
  const dataset = loadExampleDataset(asOf)
  const stages = dataset.metadata.stages

  it('follows the filtered item list for throughput, WIP, efficiency, and the heat map', () => {
    const bugs = dataset.items.filter((item) => item.attributes.Type === 'Bug')
    expect(projectThroughputRun(bugs, stages, asOf).sampleSize).toBe(4)
    expect(projectWipRun(bugs, stages, asOf).ending).toBe(0)
    expect(projectFlowEfficiency(bugs, stages, asOf, true).sampleSize).toBe(4)
    expect(projectHeatMap(bugs, stages, asOf).total).toBe(4)

    const throughput = projectThroughputRun(dataset.items, stages, asOf)
    expect(throughput.sampleSize).toBe(12)
    expect(throughput.points[0]?.date).toBe('2026-01-15')
    expect(throughput.points.at(-1)?.date).toBe('2026-06-19')
    expect(throughput.points.reduce((sum, point) => sum + point.count, 0)).toBe(12)
    expect(throughput.points.some((point) => point.count === 0)).toBe(true)

    const wip = projectWipRun(dataset.items, stages, asOf)
    // WIP starts when an item enters Ready (first workflow stage), not Backlog.
    expect(wip.points[0]).toEqual({ date: '2026-01-06', wip: 1 })
    expect(wip.ending).toBe(3)
    expect(wip.endingOn).toBe('2026-11-11')

    const efficiency = projectFlowEfficiency(dataset.items, stages, asOf, true)
    expect(efficiency.basis).toBe('blocked')
    expect(efficiency.sampleSize).toBe(12)
    expect(efficiency.items.find((item) => item.id === 'AA-101')).toMatchObject({
      spanDays: 10,
      activeDays: 9,
      waitDays: 1,
      efficiencyPercent: 90,
    })
    expect(efficiency.items.find((item) => item.id === 'AA-105')).toMatchObject({
      spanDays: 8,
      waitDays: 3,
      efficiencyPercent: 63,
    })
    expect(efficiency.activeDays + efficiency.waitDays).toBe(efficiency.spanDays)
    expect(efficiency.averagePercent).toBeCloseTo((100 * efficiency.activeDays) / efficiency.spanDays)

    const heat = projectHeatMap(dataset.items, stages, asOf)
    expect(heat.total).toBe(12)
    expect(heat.max).toBe(1)
    const week = heat.weeks.indexOf('2026-01-12')
    expect(heat.counts[3]?.[week]).toBe(1)
    expect(heat.dates[3]?.[week]).toBe('2026-01-15')
  })
})
