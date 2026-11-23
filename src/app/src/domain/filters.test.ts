import { describe, expect, it } from 'vitest'
import { applyFilters, projectWorkflowStages } from './filters.ts'
import type { WorkItem, WorkflowStage } from './types.ts'

const stages: WorkflowStage[] = [
  { name: 'Ready', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

function item(attributes: Record<string, string>, stageDates: (Date | null)[]): WorkItem {
  return { id: '1', attributes, stageDates, blockedDays: 0 }
}

describe('filter stubs', () => {
  const feature = item({ Type: 'Feature' }, [new Date(2026, 0, 1), new Date(2026, 0, 3)])
  const mixed = item({ Type: '[Feature|Bug]' }, [new Date(2026, 0, 2), null])

  it('matches attribute values without case and splits bracketed lists', () => {
    expect(applyFilters([feature, mixed], { attribute: 'Type', values: ['feature'] })).toEqual([feature, mixed])
    expect(applyFilters([feature], { attribute: 'Type', values: [] })).toEqual([])
  })

  it('requires every selected label and still matches other attributes with OR', () => {
    const both = item({ Labels: '[Bug|API]', Type: 'Feature' }, [new Date(2026, 0, 1), null])
    const bugOnly = item({ Labels: '[Bug]', Type: '[Feature|Debt]' }, [new Date(2026, 0, 2), null])
    const task = item({ Labels: '[Bug|API]', Type: 'Task' }, [new Date(2026, 0, 3), null])

    expect(applyFilters([both, bugOnly, task], { attribute: 'Labels', values: ['Bug', 'api'] })).toEqual([both, task])
    expect(applyFilters([both, bugOnly], { attribute: 'Labels', values: ['Bug'] })).toEqual([both, bugOnly])
    expect(applyFilters([bugOnly], { attribute: 'Labels', values: [] })).toEqual([])
    expect(applyFilters([both, bugOnly, task], { attribute: 'Type', values: ['Feature', 'Debt'] })).toEqual([
      both,
      bugOnly,
    ])
  })

  it('projects checked stages in board order and keeps items whose remaining dates are null', () => {
    const dates = feature.stageDates
    const projected = projectWorkflowStages(stages, [feature, mixed], ['Done', 'Ready'])
    expect(projected.stages.map((stage) => stage.name)).toEqual(['Ready', 'Done'])
    expect(projected.items).toHaveLength(2)
    expect(projected.items[0]?.stageDates).toEqual([new Date(2026, 0, 1), new Date(2026, 0, 3)])
    expect(projected.items[1]?.stageDates).toEqual([new Date(2026, 0, 2), null])
    expect(feature.stageDates).toBe(dates)

    const doneOnly = projectWorkflowStages(stages, [feature, mixed], ['Done'])
    expect(doneOnly.stages).toEqual([{ name: 'Done', role: 'workflow' }])
    expect(doneOnly.items[0]?.stageDates).toEqual([new Date(2026, 0, 3)])
    expect(doneOnly.items[1]?.stageDates).toEqual([null])

    const none = projectWorkflowStages(stages, [feature, mixed], [])
    expect(none.stages).toEqual([])
    expect(none.items.map((entry) => entry.stageDates)).toEqual([[], []])
    expect(none.items.map((entry) => entry.attributes)).toEqual([feature.attributes, mixed.attributes])
  })
})
