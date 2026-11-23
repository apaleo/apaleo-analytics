import { describe, expect, it } from 'vitest'
import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import { applySubIssueFilter } from '../../domain/subIssues.ts'
import { projectWipRun } from '../wipRun.ts'
import { projectDashboardFlow, projectDashboardForecast } from './dashboard.ts'
import { openForecastIssues } from './openIssues.ts'

const stages: WorkflowStage[] = [
  { name: 'New', role: 'workflow' },
  { name: 'In Progress', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

const asOf = new Date(2026, 0, 10)

function item(id: string, stageDates: (Date | null)[], parentId?: string): WorkItem {
  const row: WorkItem = { id, stageDates, blockedDays: 0, attributes: {} }
  if (parentId !== undefined) row.parentId = parentId
  return row
}

describe('When open issues', () => {
  const parent = item('PARENT', [new Date(2026, 0, 1), new Date(2026, 0, 2), null])
  const child = item('CHILD', [new Date(2026, 0, 1), new Date(2026, 0, 2), null], 'linear-parent')
  const fresh = item('NEW-ITEM', [new Date(2026, 0, 3), null, null])
  const finished = item('DONE-ITEM', [new Date(2026, 0, 1), new Date(2026, 0, 2), asOf])

  it('lists only the parent issue that is in progress', () => {
    const rows = [parent, child, fresh, finished]
    const hidden = applySubIssueFilter(rows, false)
    const open = openForecastIssues(hidden, stages, asOf)
    expect(open.map((row) => row.id)).toEqual(['PARENT'])
    expect(projectWipRun(hidden, stages, asOf).ending).toBe(2)
    expect(projectDashboardFlow(hidden, stages, asOf).wip).toBe(2)
    expect(projectDashboardForecast(hidden, stages, asOf, { trials: 20, lookaheadDays: 5, seed: 1 }).wip).toBe(2)

    const shown = applySubIssueFilter(rows, true)
    expect(openForecastIssues(shown, stages, asOf).map((row) => row.id)).toEqual(['PARENT', 'CHILD'])
    expect(projectWipRun(shown, stages, asOf).ending).toBe(3)
    expect(projectDashboardFlow(shown, stages, asOf).wip).toBe(3)
    expect(projectDashboardForecast(shown, stages, asOf, { trials: 20, lookaheadDays: 5, seed: 1 }).wip).toBe(3)
  })

  it('excludes a workflow stage named New and an item that reached the last stage today', () => {
    expect(openForecastIssues([fresh], stages, asOf)).toEqual([])
    expect(openForecastIssues([finished], stages, asOf)).toEqual([])
    expect(openForecastIssues([item('later', [new Date(2026, 0, 1), new Date(2026, 0, 2), new Date(2026, 0, 11)])], stages, asOf).map((row) => row.id)).toEqual(['later'])
    const childNew = item('CHILD-NEW', [new Date(2026, 0, 3), null, null], 'linear-parent')
    const childDone = item('CHILD-DONE', [new Date(2026, 0, 1), new Date(2026, 0, 2), asOf], 'linear-parent')
    const shown = applySubIssueFilter([parent, child, childNew, childDone, fresh, finished], true)
    expect(openForecastIssues(shown, stages, asOf).map((row) => row.id)).toEqual(['PARENT', 'CHILD'])
  })

  it('keeps file rows with no parent field and drops only a non-empty parent id', () => {
    const fileRow = item('FILE-1', [new Date(2026, 0, 2), new Date(2026, 0, 4), null])
    const blankParent = item('BLANK', [new Date(2026, 0, 2), new Date(2026, 0, 4), null], '   ')
    const namedDone = item('named-done', [new Date(2026, 0, 2), new Date(2026, 0, 4), null])
    const doneNameStages: WorkflowStage[] = [
      { name: 'Build', role: 'workflow' },
      { name: ' DONE ', role: 'workflow' },
      { name: 'Released', role: 'workflow' },
    ]
    const rows = [fileRow, blankParent, child]
    expect(openForecastIssues(applySubIssueFilter(rows, false), stages, asOf).map((row) => row.id)).toEqual(['FILE-1', 'BLANK'])
    expect(openForecastIssues(applySubIssueFilter(rows, true), stages, asOf).map((row) => row.id)).toEqual(['FILE-1', 'BLANK', 'CHILD'])
    expect(openForecastIssues([namedDone], doneNameStages, asOf)).toEqual([])
  })
})
