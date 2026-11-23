import { describe, expect, it } from 'vitest'
import type { Dataset, WorkItem, WorkflowStage } from '../../domain/types.ts'
import { formatIsoDate } from '../isoDate.ts'
import { mergeDatasets } from './mergeDatasets.ts'

const stages: WorkflowStage[] = [
  { name: 'Todo', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

function item(id: string, days: readonly (string | null)[], title = id): WorkItem {
  return {
    id,
    title,
    stageDates: days.map((day) => (day === null ? null : new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))))),
    blockedDays: 0,
    attributes: { State: 'Todo' },
  }
}

function dataset(overrides: {
  items: WorkItem[]
  stages?: WorkflowStage[]
  fetchedAt?: string
  linearSince?: string
  linearClosedThrough?: string
  warnings?: string[]
}): Dataset {
  return {
    metadata: {
      sourceName: 'Linear · Platform',
      sourceKind: 'linear',
      linearTeamId: 'team-1',
      linearTeamName: 'Platform',
      fetchedAt: overrides.fetchedAt ?? '2026-11-01T00:00:00.000Z',
      linearSince: overrides.linearSince,
      linearClosedThrough: overrides.linearClosedThrough,
      idColumn: 'ID',
      stages: overrides.stages ?? stages,
      attributeColumns: ['State'],
      dateOrder: 'ymd',
    },
    items: overrides.items,
    warnings: overrides.warnings ?? [],
  }
}

function days(dates: readonly (Date | null)[]): (string | null)[] {
  return dates.map((date) => (date === null ? null : formatIsoDate(date)))
}

describe('mergeDatasets', () => {
  it('replaces rows with the same id and appends new ids', () => {
    const previous = dataset({
      items: [item('ENG-1', ['2026-08-01', null], 'Old'), item('ENG-2', ['2026-07-01', '2026-07-20'])],
      linearSince: '2026-08-01',
      linearClosedThrough: '2026-07-20',
    })
    const incoming = dataset({
      items: [item('ENG-1', ['2026-08-04', null], 'New'), item('ENG-3', ['2026-09-01', null])],
      fetchedAt: '2026-11-11T12:00:00.000Z',
      linearClosedThrough: '2026-07-20',
      warnings: ['Skipped 1 issue with no identifier.'],
    })

    const merged = mergeDatasets(previous, incoming)
    expect(merged.items.map((row) => row.id)).toEqual(['ENG-1', 'ENG-2', 'ENG-3'])
    expect(merged.items[0]?.title).toBe('New')
    expect(days(merged.items[0]?.stageDates ?? [])).toEqual(['2026-08-04', null])
    expect(merged.items[1]).toBe(previous.items[1])
    expect(merged.warnings).toEqual(['Skipped 1 issue with no identifier.'])
    expect(merged.metadata.linearSince).toBe('2026-08-01')
  })

  it('replaces an open item and keeps a completion outside the window', () => {
    const previous = dataset({
      items: [item('OPEN', ['2026-08-02', null]), item('DONE', ['2026-07-01', '2026-07-15'])],
      linearSince: '2026-08-01',
      linearClosedThrough: '2026-08-01',
    })
    const incoming = dataset({
      items: [item('OPEN', ['2026-08-02', null], 'Still open')],
      fetchedAt: '2026-11-11T12:00:00.000Z',
      linearClosedThrough: '2026-08-01',
    })

    const merged = mergeDatasets(previous, incoming)
    expect(merged.items.map((row) => row.id)).toEqual(['OPEN', 'DONE'])
    expect(merged.items[0]?.title).toBe('Still open')
    expect(days(merged.items[1]?.stageDates ?? [])).toEqual(['2026-07-01', '2026-07-15'])
    expect(merged.metadata.fetchedAt).toBe('2026-11-11T12:00:00.000Z')
    expect(merged.metadata.linearClosedThrough).toBe('2026-08-01')
  })

  it('advances the closed-through watermark to the later day', () => {
    const previous = dataset({
      items: [item('ENG-1', ['2026-08-01', '2026-08-01'])],
      linearClosedThrough: '2026-08-01',
      linearSince: '2026-08-01',
    })
    const incoming = dataset({
      items: [item('ENG-2', ['2026-09-01', '2026-09-15'])],
      linearClosedThrough: '2026-09-15',
      fetchedAt: '2026-11-11T12:00:00.000Z',
    })

    const merged = mergeDatasets(previous, incoming)
    expect(merged.metadata.linearClosedThrough).toBe('2026-09-15')
    expect(merged.metadata.fetchedAt).toBe('2026-11-11T12:00:00.000Z')
    expect(merged.metadata.linearSince).toBe('2026-08-01')
  })

  it('does not move the watermark backward', () => {
    const previous = dataset({
      items: [item('ENG-1', ['2026-10-01', '2026-10-20'])],
      linearClosedThrough: '2026-10-20',
      linearSince: '2026-08-01',
    })
    const incoming = dataset({
      items: [],
      linearClosedThrough: '2026-08-01',
      fetchedAt: '2026-11-11T12:00:00.000Z',
    })

    const merged = mergeDatasets(previous, incoming)
    expect(merged.metadata.linearClosedThrough).toBe('2026-10-20')
  })

  it('keeps previous items when the incremental dataset is empty', () => {
    const previous = dataset({
      items: [item('ENG-1', ['2026-08-02', null])],
      linearSince: '2026-08-01',
      linearClosedThrough: '2026-08-01',
      warnings: ['old warning'],
    })
    const incoming = dataset({
      items: [],
      linearClosedThrough: '2026-08-01',
      fetchedAt: '2026-11-11T15:00:00.000Z',
      warnings: [],
    })

    const merged = mergeDatasets(previous, incoming)
    expect(merged.items).toEqual(previous.items)
    expect(merged.metadata.linearSince).toBe('2026-08-01')
    expect(merged.metadata.linearClosedThrough).toBe('2026-08-01')
    expect(merged.metadata.fetchedAt).toBe('2026-11-11T15:00:00.000Z')
    expect(merged.warnings).toEqual([])
  })

  it('drops ignored ids and remaps kept rows onto incoming stages', () => {
    const previous = dataset({
      items: [item('ENG-1', ['2026-08-02', '2026-08-09']), item('CANCELED', ['2026-08-03', null])],
      linearSince: '2026-08-01',
      linearClosedThrough: '2026-08-09',
    })
    const incoming = dataset({
      items: [item('ENG-4', ['2026-09-01', null, null])],
      stages: [
        { name: 'Backlog', role: 'backlog' },
        { name: 'Todo', role: 'workflow' },
        { name: 'Done', role: 'workflow' },
      ],
      linearClosedThrough: '2026-08-09',
      fetchedAt: '2026-11-11T12:00:00.000Z',
    })

    const merged = mergeDatasets(previous, incoming, { dropIds: ['CANCELED'] })
    expect(merged.items.map((row) => row.id)).toEqual(['ENG-1', 'ENG-4'])
    expect(days(merged.items[0]?.stageDates ?? [])).toEqual([null, '2026-08-02', '2026-08-09'])
    expect(merged.metadata.stages.map((stage) => stage.name)).toEqual(['Backlog', 'Todo', 'Done'])
    expect(merged.metadata.linearSince).toBe('2026-08-01')
  })
})
