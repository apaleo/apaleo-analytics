import { describe, expect, it } from 'vitest'
import type { Dataset } from '../domain/types.ts'
import { formatIsoDate } from '../data/isoDate.ts'
import {
  MAX_STORED_SOURCES,
  deserializeDataset,
  listStoredSources,
  memorySourceLibrary,
  migrateLegacyCurrent,
  readStoredSource,
  serializeDataset,
  writeStoredSource,
} from './datasetStore.ts'

function sample(): Dataset {
  return {
    metadata: {
      sourceName: 'Linear · Platform',
      sourceKind: 'linear',
      linearTeamId: 'team-1',
      linearTeamName: 'Platform',
      fetchedAt: '2026-11-11T10:00:00.000Z',
      linearSince: '2026-08-01',
      linearClosedThrough: '2026-10-20',
      idColumn: 'ID',
      linkColumn: 'Link',
      titleColumn: 'Title',
      stages: [
        { name: 'Backlog', role: 'backlog' },
        { name: 'Done', role: 'workflow' },
      ],
      attributeColumns: ['State'],
      dateOrder: 'ymd',
    },
    items: [
      {
        id: 'ENG-1',
        link: 'https://linear.app/acme/issue/ENG-1',
        title: 'Ship it',
        stageDates: [new Date(2026, 0, 5), null],
        blockedDays: 0,
        attributes: { State: 'Backlog' },
      },
    ],
    warnings: ['Skipped 1 issue with no identifier.'],
  }
}

function linearTeam(teamId: string, name: string): Dataset {
  const dataset = sample()
  return {
    ...dataset,
    metadata: {
      ...dataset.metadata,
      sourceName: `Linear · ${name}`,
      sourceKind: 'linear',
      linearTeamId: teamId,
      linearTeamName: name,
    },
  }
}

describe('dataset snapshot store', () => {
  it('stores two Linear teams and reads each one back', async () => {
    const library = memorySourceLibrary()
    const first = await writeStoredSource(linearTeam('team-a', 'Alpha'), {
      library,
      now: new Date('2026-11-01T00:00:00.000Z'),
    })
    const second = await writeStoredSource(linearTeam('team-b', 'Beta'), {
      library,
      now: new Date('2026-11-02T00:00:00.000Z'),
    })
    expect(first.ok && first.id).toBe('linear:team-a')
    expect(second.ok && second.id).toBe('linear:team-b')

    const listed = await listStoredSources(library)
    expect(listed?.map((source) => source.id)).toEqual(['linear:team-b', 'linear:team-a'])
    expect(listed?.[0]?.label).toBe('Linear · Beta')
    expect(listed?.[0]?.linearClosedThrough).toBe('2026-10-20')

    const alpha = await readStoredSource('linear:team-a', library)
    const beta = await readStoredSource('linear:team-b', library)
    expect(alpha?.metadata.linearTeamId).toBe('team-a')
    expect(beta?.metadata.linearTeamName).toBe('Beta')
    expect(alpha?.items[0]?.id).toBe('ENG-1')
    expect(formatIsoDate(alpha?.items[0]?.stageDates[0] ?? new Date(0))).toBe('2026-01-05')
    expect(alpha?.warnings).toEqual(['Skipped 1 issue with no identifier.'])
  })

  it('migrates a legacy current record when preferences still say Linear', async () => {
    const legacy = serializeDataset(sample())
    const library = memorySourceLibrary(legacy)
    expect(await migrateLegacyCurrent(library, { sourceKind: 'file', linearTeamId: 'team-9' })).toBeNull()
    expect(await library.readLegacy()).toBe(legacy)

    const id = await migrateLegacyCurrent(library, { sourceKind: 'linear', linearTeamId: 'team-9' }, new Date('2026-11-11T00:00:00.000Z'))
    expect(id).toBe('linear:team-9')
    expect(await library.readLegacy()).toBeNull()
    const restored = await readStoredSource('linear:team-9', library)
    expect(restored?.metadata.linearTeamId).toBe('team-9')
    expect(restored?.metadata.sourceKind).toBe('linear')
    expect(restored?.items[0]?.id).toBe('ENG-1')

    const again = memorySourceLibrary(legacy)
    const kept = linearTeam('team-1', 'Platform')
    kept.items = [{ ...kept.items[0]!, id: 'KEEP' }]
    expect((await writeStoredSource(kept, { library: again })).ok).toBe(true)
    expect(await migrateLegacyCurrent(again, { sourceKind: 'linear', linearTeamId: 'team-1' })).toBe('linear:team-1')
    expect((await readStoredSource('linear:team-1', again))?.items[0]?.id).toBe('KEEP')
    expect(await again.readLegacy()).toBeNull()
  })

  it('stores a legacy Linear snapshot without a team id under file:legacy-current', async () => {
    const dataset = sample()
    delete dataset.metadata.linearTeamId
    const library = memorySourceLibrary(serializeDataset(dataset))
    expect(await migrateLegacyCurrent(library, { sourceKind: 'linear' })).toBe('file:legacy-current')
    expect(await readStoredSource('file:legacy-current', library)).not.toBeNull()
  })

  it('leaves a corrupt legacy record in place', async () => {
    const library = memorySourceLibrary('{')
    expect(await migrateLegacyCurrent(library, { sourceKind: 'linear', linearTeamId: 'team-1' })).toBeNull()
    expect(await library.readLegacy()).toBe('{')
  })

  it('evicts the least recently activated file or Linear source past the cap and keeps Example', async () => {
    const library = memorySourceLibrary()
    const example = linearTeam('ignored', 'Example')
    example.metadata = {
      ...example.metadata,
      sourceKind: 'example',
      sourceName: 'Example Data',
    }
    delete example.metadata.linearTeamId
    delete example.metadata.linearTeamName
    expect(
      (
        await writeStoredSource(example, {
          library,
          now: new Date('2025-01-01T00:00:00.000Z'),
        })
      ).ok,
    ).toBe(true)

    for (let index = 1; index <= MAX_STORED_SOURCES + 1; index += 1) {
      const saved = await writeStoredSource(linearTeam(`team-${index}`, `T${index}`), {
        library,
        now: new Date(Date.UTC(2026, 0, index)),
      })
      expect(saved.ok).toBe(true)
    }

    const listed = await listStoredSources(library)
    const ids = listed?.map((source) => source.id) ?? []
    expect(ids[0]).toBe('example')
    expect(ids.filter((id) => id !== 'example')).toHaveLength(MAX_STORED_SOURCES)
    expect(ids).not.toContain('linear:team-1')
    expect(ids).toContain('linear:team-13')
    expect(await readStoredSource('linear:team-1', library)).toBeNull()
    expect(await readStoredSource('example', library)).not.toBeNull()
    expect((await readStoredSource('linear:team-2', library))?.metadata.linearTeamId).toBe('team-2')
  })

  it('refuses an oversized snapshot without deleting the other team', async () => {
    const library = memorySourceLibrary()
    expect((await writeStoredSource(linearTeam('team-a', 'Alpha'), { library })).ok).toBe(true)
    expect(await writeStoredSource(linearTeam('team-b', 'Beta'), { library, maxBytes: 40 })).toEqual({
      ok: false,
      reason: 'too-large',
    })
    const listed = await listStoredSources(library)
    expect(listed?.map((source) => source.id)).toEqual(['linear:team-a'])
    expect((await readStoredSource('linear:team-a', library))?.metadata.linearTeamName).toBe('Alpha')
    expect(await readStoredSource('linear:team-b', library)).toBeNull()
  })

  it('keys a file import by a slug of its name', async () => {
    const dataset = sample()
    dataset.metadata = { ...dataset.metadata, sourceKind: 'file', sourceName: 'Board Export.csv' }
    delete dataset.metadata.linearTeamId
    delete dataset.metadata.linearTeamName
    delete dataset.metadata.fetchedAt
    delete dataset.metadata.linearSince
    delete dataset.metadata.linearClosedThrough
    const library = memorySourceLibrary()
    const saved = await writeStoredSource(dataset, { library })
    expect(saved.ok && saved.id).toBe('file:board-export')
    expect((await readStoredSource('file:board-export', library))?.metadata.sourceName).toBe('Board Export.csv')
  })

  it('normalizes since and closed-through to calendar days', () => {
    const payload = JSON.parse(serializeDataset(sample())) as { metadata: Record<string, unknown> }
    payload.metadata.linearSince = '2026-08-01T00:00:00.000Z'
    payload.metadata.linearClosedThrough = '2026-10-20T15:00:00.000Z'
    const dataset = deserializeDataset(JSON.stringify(payload))
    expect(dataset?.metadata.linearSince).toBe('2026-08-01')
    expect(dataset?.metadata.linearClosedThrough).toBe('2026-10-20')

    payload.metadata.linearSince = 'soon'
    const invalid = deserializeDataset(JSON.stringify(payload))
    expect(invalid?.metadata.linearSince).toBeUndefined()
    expect(invalid?.metadata.linearClosedThrough).toBe('2026-10-20')
  })

  it('leaves a legacy linearExcludeCanceled flag unread', () => {
    const payload = JSON.parse(serializeDataset(sample())) as { metadata: Record<string, unknown> }
    payload.metadata.linearExcludeCanceled = false
    const dataset = deserializeDataset(JSON.stringify(payload))
    expect(dataset?.metadata.sourceKind).toBe('linear')
    expect(dataset?.metadata).not.toHaveProperty('linearExcludeCanceled')
  })

  it('treats a corrupt payload as missing', () => {
    expect(deserializeDataset('{')).toBeNull()
    expect(deserializeDataset(serializeDataset(sample()))?.metadata.sourceKind).toBe('linear')
  })
})
