import { describe, expect, it } from 'vitest'
import type { Dataset } from '../../domain/types.ts'
import { loadExampleDataset } from '../../data/exampleDataset.ts'
import {
  applyFilterState,
  attributeChoices,
  defaultFilterState,
  filterableAttributes,
  retainFilterState,
} from './filterState.ts'

describe('filter state', () => {
  const today = new Date(2026, 10, 11)

  it('starts with every stage enabled and no attribute selection', () => {
    const dataset = loadExampleDataset(today)
    const state = defaultFilterState(dataset)
    expect(state.selectedAttributes).toEqual({})
    expect(state.enabledStages).toEqual(['Backlog', 'Ready', 'In Progress', 'Review', 'Done'])
    const filtered = applyFilterState(dataset, state)
    expect(filtered.items).toHaveLength(dataset.items.length)
    expect(filtered.stages).toEqual(dataset.metadata.stages)
    expect(filterableAttributes(dataset)).toEqual(['Type', 'Team', 'Class of Service'])
    expect(attributeChoices(dataset, 'Type')).toEqual(['Bug', 'Debt', 'Feature'])
  })

  it('filters items by attributes and projects the checked workflow stages', () => {
    const dataset = loadExampleDataset(today)
    const bugs = applyFilterState(dataset, {
      ...defaultFilterState(dataset),
      selectedAttributes: { Type: ['Bug'], Team: ['Payments'] },
    })
    expect(bugs.items.map((item) => item.id)).toEqual(['AA-102'])
    expect(bugs.stages).toEqual(dataset.metadata.stages)

    const doneIndex = dataset.metadata.stages.findIndex((stage) => stage.name === 'Done')
    const doneOnly = applyFilterState(dataset, { ...defaultFilterState(dataset), enabledStages: ['Done'] })
    expect(doneOnly.stages).toEqual([{ name: 'Done', role: 'workflow' }])
    expect(doneOnly.items).toHaveLength(dataset.items.length)
    expect(doneOnly.items.every((item) => item.stageDates.length === 1)).toBe(true)
    const finished = dataset.items.find((item) => item.id === 'AA-101')
    const open = dataset.items.find((item) => item.id === 'AA-115')
    expect(doneOnly.items.find((item) => item.id === 'AA-101')?.stageDates).toEqual([finished?.stageDates[doneIndex]])
    expect(doneOnly.items.find((item) => item.id === 'AA-115')?.stageDates).toEqual([open?.stageDates[doneIndex] ?? null])

    const none = applyFilterState(dataset, { ...defaultFilterState(dataset), enabledStages: [] })
    expect(none.stages).toEqual([])
    expect(none.items).toHaveLength(dataset.items.length)
    expect(none.items.every((item) => item.stageDates.length === 0)).toBe(true)
  })

  it('splits bracketed attribute values and keeps items whose stage dates are empty', () => {
    const dataset: Dataset = {
      metadata: {
        sourceName: 'Synthetic',
        idColumn: 'ID',
        stages: [
          { name: 'Ready', role: 'workflow' },
          { name: 'Done', role: 'workflow' },
        ],
        attributeColumns: ['Type'],
        dateOrder: 'ymd',
      },
      warnings: [],
      items: [
        {
          id: 'mixed',
          attributes: { Type: '[Feature|Bug]' },
          stageDates: [new Date(2026, 0, 2), new Date(2026, 0, 4)],
          blockedDays: 0,
        },
        {
          id: 'untouched',
          attributes: { Type: 'Feature' },
          stageDates: [null, null],
          blockedDays: 0,
        },
      ],
    }

    const feature = applyFilterState(dataset, {
      ...defaultFilterState(dataset),
      selectedAttributes: { Type: ['feature'] },
    })
    expect(feature.stages.map((stage) => stage.name)).toEqual(['Ready', 'Done'])
    expect(feature.items.map((item) => item.id)).toEqual(['mixed', 'untouched'])
    expect(feature.items.find((item) => item.id === 'untouched')?.stageDates).toEqual([null, null])
  })

  it('keeps filter selections that still exist after a refresh', () => {
    const dataset = loadExampleDataset(today)
    const current = {
      ...defaultFilterState(dataset),
      selectedAttributes: { Type: ['Bug'], Team: ['Payments'] },
      enabledStages: ['Done'],
    }
    const next: Dataset = {
      ...dataset,
      metadata: {
        ...dataset.metadata,
        stages: [
          { name: 'Ready', role: 'workflow' },
          { name: 'Done', role: 'workflow' },
        ],
        attributeColumns: ['Team'],
      },
      items: dataset.items.map((item) => ({ ...item, attributes: { Team: item.attributes.Team ?? '' } })),
    }

    expect(retainFilterState(current, next)).toEqual({
      selectedAttributes: { Team: ['Payments'] },
      enabledStages: ['Done'],
    })
    expect(retainFilterState({ ...current, enabledStages: ['Review'] }, next).enabledStages).toEqual(['Ready', 'Done'])
    expect(retainFilterState({ ...current, enabledStages: [] }, next).enabledStages).toEqual([])
  })

  it('orders State by workflow stages, hides Assignee and Priority, and ANDs labels', () => {
    const dataset: Dataset = {
      metadata: {
        sourceName: 'Linear',
        idColumn: 'ID',
        stages: [
          { name: 'Backlog', role: 'backlog' },
          { name: 'In Progress', role: 'workflow' },
          { name: 'Done', role: 'workflow' },
        ],
        attributeColumns: ['State', 'Assignee', 'Priority', 'Labels', 'Blocked'],
        blockedDaysColumn: 'Blocked',
        dateOrder: 'ymd',
      },
      warnings: [],
      items: [
        {
          id: 'both',
          attributes: {
            State: 'Done',
            Assignee: 'Ada',
            Priority: 'High',
            Labels: '[Bug|API]',
            Blocked: '0',
          },
          stageDates: [new Date(2026, 0, 1), new Date(2026, 0, 2), new Date(2026, 0, 3)],
          blockedDays: 0,
        },
        {
          id: 'one',
          attributes: {
            State: 'Review',
            Assignee: 'Bea',
            Priority: 'Low',
            Labels: '[Bug]',
            Blocked: '0',
          },
          stageDates: [new Date(2026, 0, 1), null, null],
          blockedDays: 0,
        },
        {
          id: 'queued',
          attributes: {
            State: 'backlog',
            Assignee: '',
            Priority: '',
            Labels: '[Platform]',
            Blocked: '',
          },
          stageDates: [new Date(2026, 0, 1), null, null],
          blockedDays: 0,
        },
        {
          id: 'active',
          attributes: {
            State: 'In Progress',
            Assignee: 'Ada',
            Priority: 'High',
            Labels: '[API|Platform]',
            Blocked: '1',
          },
          stageDates: [new Date(2026, 0, 1), new Date(2026, 0, 4), null],
          blockedDays: 1,
        },
        {
          id: 'icebox',
          attributes: {
            State: 'Icebox',
            Assignee: '',
            Priority: '',
            Labels: '',
            Blocked: '',
          },
          stageDates: [null, null, null],
          blockedDays: 0,
        },
      ],
    }

    expect(filterableAttributes(dataset)).toEqual(['State', 'Labels'])
    expect(attributeChoices(dataset, 'State')).toEqual(['backlog', 'In Progress', 'Done', 'Icebox', 'Review'])
    expect(attributeChoices(dataset, 'Labels')).toEqual(['API', 'Bug', 'Platform'])

    const labeled = applyFilterState(dataset, {
      ...defaultFilterState(dataset),
      selectedAttributes: { Labels: ['Bug', 'API'] },
    })
    expect(labeled.items.map((item) => item.id)).toEqual(['both'])
    expect(labeled.stages.map((stage) => stage.name)).toEqual(['Backlog', 'In Progress', 'Done'])
  })
})
