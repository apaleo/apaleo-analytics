import { describe, expect, it } from 'vitest'
import { activeStageIndex, cycleTimeBetweenStages } from '../domain/cycleTime.ts'
import { loadExampleDataset } from './exampleDataset.ts'

describe('loadExampleDataset', () => {
  const dataset = loadExampleDataset(new Date(2026, 10, 11))

  it('loads a board large enough for later charts', () => {
    expect(dataset.metadata.sourceName).toBe('Example Data')
    expect(dataset.metadata.dateOrder).toBe('ymd')
    expect(dataset.warnings).toEqual([])
    expect(dataset.items).toHaveLength(15)
    const workflowStages = dataset.metadata.stages.filter((stage) => stage.role === 'workflow')
    expect(workflowStages.map((stage) => stage.name)).toEqual(['Ready', 'In Progress', 'Review', 'Done'])
    expect(dataset.metadata.stages[0]).toEqual({ name: 'Backlog', role: 'backlog' })
    const completed = dataset.items.filter((item) => item.stageDates.at(-1) != null)
    expect(completed.length).toBeGreaterThanOrEqual(12)
  })

  it('parses cycle time, blocked days, and attributes for a completed item', () => {
    const item = dataset.items.find((candidate) => candidate.id === 'AA-101')
    expect(item?.title).toBe('Checkout retry policy')
    expect(item?.link).toBe('https://example.com/browse/AA-101')
    expect(item?.blockedDays).toBe(1)
    expect(item?.attributes.Type).toBe('Feature')
    expect(item?.attributes['Blocked Days']).toBe('1')
    const ready = dataset.metadata.stages.findIndex((stage) => stage.name === 'Ready')
    const done = dataset.metadata.stages.findIndex((stage) => stage.name === 'Done')
    expect(item).toBeDefined()
    if (!item) return
    expect(cycleTimeBetweenStages(item, ready, done)).toBe(10)
  })

  it('keeps in-progress items out of Done and places them in the latest entered stage', () => {
    const refund = dataset.items.find((candidate) => candidate.id === 'AA-113')
    const done = dataset.metadata.stages.findIndex((stage) => stage.name === 'Done')
    expect(refund?.stageDates[done]).toBeNull()

    const priceImport = dataset.items.find((candidate) => candidate.id === 'AA-114')
    expect(priceImport).toBeDefined()
    if (!priceImport) return
    const active = activeStageIndex(priceImport, new Date(2026, 10, 1))
    expect(dataset.metadata.stages[active ?? -1]?.name).toBe('Review')
  })
})
