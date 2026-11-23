import { describe, expect, it } from 'vitest'
import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import { applySubIssueFilter } from '../../domain/subIssues.ts'
import { projectDashboardFlow, projectDashboardForecast } from './dashboard.ts'

const stages: WorkflowStage[] = [
  { name: 'Build', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

function done(id: string, day: number): WorkItem {
  return {
    id,
    stageDates: [new Date(2026, 0, day), new Date(2026, 0, day)],
    blockedDays: 0,
    attributes: {},
  }
}

function open(id: string): WorkItem {
  return {
    id,
    stageDates: [new Date(2026, 0, 5), null],
    blockedDays: 0,
    attributes: {},
  }
}

const items = [done('a', 1), done('b', 2), done('c', 3), done('d', 4), done('e', 5), open('f'), open('g')]
const asOf = new Date(2026, 0, 10)

describe('dashboard snapshot', () => {
  it('reports median cycle time, open WIP, and a throughput CV', () => {
    const flow = projectDashboardFlow(items, stages, asOf, 85)
    expect(flow.completed).toBe(5)
    expect(flow.medianCycleDays).toBe(1)
    expect(flow.selectedCycleDays).toBe(1)
    expect(flow.wip).toBe(2)
    const child = { ...open('child'), parentId: 'parent-issue' }
    expect(projectDashboardFlow(applySubIssueFilter([...items, child], false), stages, asOf, 85).wip).toBe(2)
    expect(projectDashboardFlow(applySubIssueFilter([...items, child], true), stages, asOf, 85).wip).toBe(3)
    expect(projectDashboardForecast(applySubIssueFilter([...items, child], false), stages, asOf, { trials: 40, lookaheadDays: 30, seed: 3 }).wip).toBe(2)
    expect(projectDashboardForecast(applySubIssueFilter([...items, child], true), stages, asOf, { trials: 40, lookaheadDays: 30, seed: 3 }).whenDays).toBe(3)
    expect(flow.sampleCount).toBe(5)
    expect(flow.cv).toBe(0)
    expect(flow.predictability).toBe('stable')
    expect(projectDashboardFlow([], stages, asOf).completed).toBe(0)
    expect(projectDashboardFlow([], stages, asOf).medianCycleDays).toBeUndefined()
  })

  it('forecasts a flat one-per-day history exactly', () => {
    const forecast = projectDashboardForecast(items, stages, asOf, { trials: 40, lookaheadDays: 30, seed: 3 })
    expect(forecast.wip).toBe(2)
    expect(forecast.lookaheadDays).toBe(30)
    expect(forecast.howManyItems).toBe(30)
    expect(forecast.whenDays).toBe(2)
    expect(forecast.whenDate).toBe('2026-01-12')
  })

  it('skips the when-forecast when nothing is open', () => {
    const forecast = projectDashboardForecast([done('a', 1), done('b', 2)], stages, asOf, {
      trials: 10,
      lookaheadDays: 2,
      seed: 1,
    })
    expect(forecast.wip).toBe(0)
    expect(forecast.whenDays).toBeUndefined()
    expect(forecast.howManyItems).toBe(2)
  })
})
