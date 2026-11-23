import { describe, expect, it, vi } from 'vitest'
import { loadExampleDataset } from '../data/exampleDataset.ts'
import { refreshLinearDataset } from '../data/linear/refreshDataset.ts'
import type { Dataset } from '../domain/types.ts'
import { loadSourceSelection } from './sourceSwitch.ts'

function linearDataset(teamId: string, closedThrough: string): Dataset {
  return {
    metadata: {
      sourceName: `Linear · ${teamId}`,
      sourceKind: 'linear',
      linearTeamId: teamId,
      linearTeamName: teamId,
      linearSince: '2026-08-01',
      linearClosedThrough: closedThrough,
      fetchedAt: '2026-11-01T00:00:00.000Z',
      idColumn: 'ID',
      stages: [
        { name: 'Backlog', role: 'backlog' },
        { name: 'Done', role: 'workflow' },
      ],
      attributeColumns: [],
      dateOrder: 'ymd',
    },
    items: [
      {
        id: 'OLD-1',
        stageDates: [new Date(2026, 0, 5), null],
        blockedDays: 0,
        attributes: {},
      },
    ],
    warnings: [],
  }
}

describe('source switch', () => {
  it('refreshes a Linear selection through the incremental export and leaves Example offline', async () => {
    const base = linearDataset('team-1', '2026-10-20')
    const incoming = linearDataset('team-1', '2026-11-11')
    incoming.items = [
      {
        id: 'NEW-1',
        stageDates: [new Date(2026, 10, 1), new Date(2026, 10, 11)],
        blockedDays: 0,
        attributes: {},
      },
    ]
    const exportTeam = vi.fn(async () => ({ ok: true as const, dataset: incoming, ignoredIds: [] as string[] }))
    const seen: string[] = []
    const outcome = await loadSourceSelection('linear:team-1', {
      read: async (id) => (id === 'linear:team-1' ? base : null),
      loadExample: () => loadExampleDataset(),
      onLoaded: (dataset) => {
        seen.push(dataset.metadata.linearTeamId ?? '')
      },
      refreshLinear: (dataset) =>
        refreshLinearDataset(dataset, {
          apiKey: 'lin_test',
          exportTeam,
          loadParents: async () => new Map(),
        }),
    })

    expect(seen).toEqual(['team-1'])
    expect(exportTeam).toHaveBeenCalledOnce()
    expect(exportTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'lin_test',
        teamId: 'team-1',
        updatedSince: '2026-11-01T00:00:00.000Z',
        mode: 'incremental',
        fetchedAt: expect.any(Date),
      }),
    )
    expect(outcome.status).toBe('refreshed')
    if (outcome.status !== 'refreshed') return
    expect(outcome.dataset.items.map((item) => item.id)).toEqual(['OLD-1', 'NEW-1'])
    expect(outcome.dataset.metadata.linearClosedThrough).toBe('2026-11-11')

    const exampleExport = vi.fn()
    const example = await loadSourceSelection('example', {
      read: async () => null,
      loadExample: () => loadExampleDataset(),
      refreshLinear: (dataset) => refreshLinearDataset(dataset, { apiKey: 'lin_test', exportTeam: exampleExport }),
    })
    expect(exampleExport).not.toHaveBeenCalled()
    expect(example.status).toBe('loaded')
    if (example.status === 'loaded') expect(example.dataset.metadata.sourceKind).toBe('example')
  })

  it('does not call Linear for a file snapshot, even when the payload still says Linear', async () => {
    const refreshLinear = vi.fn()
    const outcome = await loadSourceSelection('file:board', {
      read: async () => linearDataset('team-1', '2026-10-20'),
      loadExample: () => loadExampleDataset(),
      refreshLinear,
    })
    expect(refreshLinear).not.toHaveBeenCalled()
    expect(outcome.status).toBe('loaded')
    if (outcome.status === 'loaded') {
      expect(outcome.dataset.metadata.sourceKind).toBe('file')
      expect(outcome.dataset.metadata.linearTeamId).toBeUndefined()
    }
  })

  it('aborts an in-flight Linear refresh before the export runs', async () => {
    const controller = new AbortController()
    controller.abort()
    const exportTeam = vi.fn()
    const direct = await refreshLinearDataset(linearDataset('team-1', '2026-10-20'), {
      apiKey: 'lin_test',
      signal: controller.signal,
      exportTeam,
    })
    expect(direct).toEqual({ ok: false, error: 'canceled', canceled: true })
    expect(exportTeam).not.toHaveBeenCalled()

    const refreshLinear = vi.fn()
    const outcome = await loadSourceSelection('linear:team-1', {
      signal: controller.signal,
      read: async () => linearDataset('team-1', '2026-10-20'),
      loadExample: () => loadExampleDataset(),
      refreshLinear,
    })
    expect(outcome.status).toBe('canceled')
    expect(refreshLinear).not.toHaveBeenCalled()
  })
})
