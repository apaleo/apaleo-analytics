import { describe, expect, it } from 'vitest'
import { cycleTimeBetweenStages } from '../domain/cycleTime.ts'
import type { WorkItem, WorkflowStage } from '../domain/types.ts'
import { workflowBounds } from './metrics.ts'
import { workflowStageDays } from './stageAging.ts'

const stages: WorkflowStage[] = [
  { name: 'Backlog', role: 'backlog' },
  { name: 'Ready', role: 'workflow' },
  { name: 'Build', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

describe('workflowStageDays', () => {
  it('lists workflow stages and days that add up to cycle time', () => {
    const item: WorkItem = {
      id: 'ENG-9',
      title: 'Ship the chart',
      stageDates: [new Date(2026, 0, 1), new Date(2026, 0, 5), new Date(2026, 0, 8), new Date(2026, 0, 12)],
      blockedDays: 0,
      attributes: {},
    }
    const bounds = workflowBounds(stages)
    const lines = workflowStageDays(item, stages)

    expect(lines.map((line) => [line.name, line.days])).toEqual([
      ['Ready', 3],
      ['Build', 5],
    ])
    expect(lines.some((line) => line.name === 'Backlog' || line.name === 'Done')).toBe(false)
    expect(lines.reduce((sum, line) => sum + line.days, 0)).toBe(
      cycleTimeBetweenStages(item, bounds?.startIndex ?? 0, bounds?.doneIndex ?? 0),
    )
  })

  it('skips a stage that was never entered', () => {
    const item: WorkItem = {
      id: 'ENG-10',
      stageDates: [new Date(2026, 0, 2), new Date(2026, 0, 4), null, new Date(2026, 0, 9)],
      blockedDays: 0,
      attributes: {},
    }

    expect(workflowStageDays(item, stages).map((line) => [line.name, line.days])).toEqual([['Ready', 6]])
  })
})
