import { describe, expect, it } from 'vitest'
import {
  PREFERENCES_KEY,
  fitPreferences,
  readPreferences,
  rememberRecentFile,
  updatePreferences,
} from './preferences.ts'

describe('preferences', () => {
  it('restores theme and chart, drops a saved locale, and keeps only recent names and timestamps', () => {
    const storage = memoryStorage()
    storage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        theme: 'dark',
        locale: 'fr',
        chartId: 'dashboard',
        recentFiles: [
          {
            name: 'board.csv',
            importedAt: '2026-11-01T09:00:00.000Z',
            csv: 'ID,Title,Ready,Done\n1,Secret,2026-01-01,2026-01-02',
          },
        ],
      }),
    )

    expect(readPreferences(storage)).toEqual({
      theme: 'dark',
      chartId: 'dashboard',
      recentFiles: [{ name: 'board.csv', importedAt: '2026-11-01T09:00:00.000Z' }],
    })

    const recent = rememberRecentFile('other.json', new Date('2026-11-11T10:00:00.000Z'), storage)
    expect(recent.map((file) => file.name)).toEqual(['other.json', 'board.csv'])
    const saved = storage.getItem(PREFERENCES_KEY) ?? ''
    expect(saved).not.toContain('Secret')
    expect(saved).not.toContain('locale')
    const parsed = JSON.parse(saved) as { recentFiles: { name: string; importedAt: string }[] }
    expect(Object.keys(parsed.recentFiles[0] ?? {}).sort()).toEqual(['importedAt', 'name'])

    updatePreferences({ theme: 'light' }, storage)
    expect(readPreferences(storage).recentFiles).toHaveLength(2)
    expect(readPreferences(storage).theme).toBe('light')
    expect(readPreferences(storage).chartId).toBe('dashboard')
  })

  it('moves a repeated name to the front and drops oldest names to fit the size cap', () => {
    const storage = memoryStorage()
    rememberRecentFile('a.csv', new Date('2026-11-01T00:00:00.000Z'), storage)
    rememberRecentFile('b.csv', new Date('2026-11-02T00:00:00.000Z'), storage)
    rememberRecentFile('a.csv', new Date('2026-11-03T00:00:00.000Z'), storage)
    expect(readPreferences(storage).recentFiles.map((file) => file.name)).toEqual(['a.csv', 'b.csv'])

    const fitted = fitPreferences(
      {
        theme: 'light',
        recentFiles: [
          { name: 'a'.repeat(40), importedAt: '2026-11-11T10:00:00.000Z' },
          { name: 'b'.repeat(40), importedAt: '2026-11-11T09:00:00.000Z' },
          { name: 'c'.repeat(40), importedAt: '2026-11-11T08:00:00.000Z' },
        ],
      },
      160,
    )
    expect(fitted.recentFiles.length).toBeLessThan(3)
    expect(fitted.recentFiles.at(-1)?.name).not.toBe('c'.repeat(40))
  })

  it('keeps the Linear team pointer out of the issue payload and clears it for a file source', () => {
    const storage = memoryStorage()
    storage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        sourceKind: 'linear',
        linearTeamId: 'team-1',
        linearFetchedAt: '2026-11-11T10:00:00.000Z',
        issues: [{ title: 'secret issue' }],
      }),
    )

    expect(readPreferences(storage)).toEqual({
      sourceKind: 'linear',
      linearTeamId: 'team-1',
      linearFetchedAt: '2026-11-11T10:00:00.000Z',
      recentFiles: [],
    })
    updatePreferences({ theme: 'dark' }, storage)
    const saved = storage.getItem(PREFERENCES_KEY) ?? ''
    expect(saved).not.toContain('secret issue')
    expect(readPreferences(storage).linearTeamId).toBe('team-1')
    expect(readPreferences(storage).theme).toBe('dark')

    updatePreferences({ sourceKind: 'file' }, storage)
    expect(readPreferences(storage).sourceKind).toBe('file')
    expect(readPreferences(storage).linearTeamId).toBeUndefined()
    expect(readPreferences(storage).linearFetchedAt).toBeUndefined()
    expect(readPreferences(storage).linearClosedThrough).toBeUndefined()
    expect(readPreferences(storage).theme).toBe('dark')
  })

  it('keeps the closed-through day with the Linear pointer and clears it for a file source', () => {
    const storage = memoryStorage()
    updatePreferences(
      {
        sourceKind: 'linear',
        linearTeamId: 'team-1',
        linearFetchedAt: '2026-11-11T10:00:00.000Z',
        linearClosedThrough: '2026-10-20T15:00:00.000Z',
      },
      storage,
    )
    expect(readPreferences(storage).linearClosedThrough).toBe('2026-10-20')
    const saved = storage.getItem(PREFERENCES_KEY) ?? ''
    expect(saved).toContain('2026-10-20')
    expect(saved).not.toContain('ENG-')

    updatePreferences({ sourceKind: 'example' }, storage)
    expect(readPreferences(storage).linearClosedThrough).toBeUndefined()
  })

  it('prefers the active source id and keeps the Linear pointer in step with it', () => {
    const storage = memoryStorage()
    updatePreferences({ activeSourceId: 'linear:team-2', linearClosedThrough: '2026-10-20' }, storage)
    expect(readPreferences(storage)).toMatchObject({
      activeSourceId: 'linear:team-2',
      sourceKind: 'linear',
      linearTeamId: 'team-2',
      linearClosedThrough: '2026-10-20',
    })

    updatePreferences({ theme: 'dark' }, storage)
    expect(readPreferences(storage).activeSourceId).toBe('linear:team-2')
    expect(readPreferences(storage).linearTeamId).toBe('team-2')
    expect(readPreferences(storage).theme).toBe('dark')

    updatePreferences({ activeSourceId: 'example' }, storage)
    expect(readPreferences(storage).activeSourceId).toBe('example')
    expect(readPreferences(storage).sourceKind).toBe('example')
    expect(readPreferences(storage).linearTeamId).toBeUndefined()
    expect(readPreferences(storage).linearClosedThrough).toBeUndefined()
    expect(readPreferences(storage).theme).toBe('dark')

    updatePreferences({ sourceKind: 'linear', linearTeamId: 'team-3' }, storage)
    expect(readPreferences(storage).activeSourceId).toBe('linear:team-3')
    updatePreferences({ sourceKind: 'file' }, storage)
    expect(readPreferences(storage).activeSourceId).toBeUndefined()
    expect(readPreferences(storage).sourceKind).toBe('file')
    expect(readPreferences(storage).linearTeamId).toBeUndefined()
  })

  it('round-trips the scatter trend and rejects a non-positive interval', () => {
    const storage = memoryStorage()
    updatePreferences({ scatterShowTrend: true, scatterTrendPercentile: 70, scatterTrendInterval: 12 }, storage)
    expect(readPreferences(storage)).toMatchObject({
      scatterShowTrend: true,
      scatterTrendPercentile: 70,
      scatterTrendInterval: 12,
    })
    updatePreferences({ theme: 'dark' }, storage)
    expect(readPreferences(storage).theme).toBe('dark')
    expect(readPreferences(storage).scatterShowTrend).toBe(true)
    expect(readPreferences(storage).scatterTrendPercentile).toBe(70)
    expect(readPreferences(storage).scatterTrendInterval).toBe(12)

    updatePreferences({ scatterTrendInterval: 0 }, storage)
    expect(readPreferences(storage).scatterTrendInterval).toBe(12)

    storage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ scatterShowTrend: true, scatterTrendPercentile: 40, scatterTrendInterval: 0 }),
    )
    expect(readPreferences(storage)).toEqual({ recentFiles: [], scatterShowTrend: true })

    storage.setItem(PREFERENCES_KEY, JSON.stringify({ scatterTrendInterval: -4 }))
    expect(readPreferences(storage).scatterTrendInterval).toBeUndefined()
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ scatterTrendInterval: 2.5 }))
    expect(readPreferences(storage).scatterTrendInterval).toBeUndefined()
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ scatterTrendInterval: '10' }))
    expect(readPreferences(storage).scatterTrendInterval).toBeUndefined()
  })

  it('round-trips the cumulative flow range and drops an unknown value', () => {
    const storage = memoryStorage()
    updatePreferences({ cfdTimeRange: '6m' }, storage)
    expect(readPreferences(storage).cfdTimeRange).toBe('6m')
    updatePreferences({ theme: 'dark' }, storage)
    expect(readPreferences(storage).theme).toBe('dark')
    expect(readPreferences(storage).cfdTimeRange).toBe('6m')

    updatePreferences({ cfdTimeRange: 'all' }, storage)
    expect(readPreferences(storage).cfdTimeRange).toBe('all')
    expect(JSON.parse(storage.getItem(PREFERENCES_KEY) ?? '{}')).toMatchObject({ cfdTimeRange: 'all', theme: 'dark' })

    storage.setItem(PREFERENCES_KEY, JSON.stringify({ cfdTimeRange: '2y' }))
    expect(readPreferences(storage).cfdTimeRange).toBeUndefined()
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ cfdTimeRange: 3 }))
    expect(readPreferences(storage).cfdTimeRange).toBeUndefined()
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ cfdTimeRange: '1M' }))
    expect(readPreferences(storage).cfdTimeRange).toBeUndefined()
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ cfdTimeRange: '' }))
    expect(readPreferences(storage).cfdTimeRange).toBeUndefined()
  })

  it('persists include sub-issues and treats a missing value as unset', () => {
    const storage = memoryStorage()
    expect(readPreferences(storage).includeSubIssues).toBeUndefined()
    updatePreferences({ includeSubIssues: true }, storage)
    expect(readPreferences(storage).includeSubIssues).toBe(true)
    updatePreferences({ includeSubIssues: false }, storage)
    expect(readPreferences(storage).includeSubIssues).toBe(false)
    expect(JSON.parse(storage.getItem(PREFERENCES_KEY) ?? '{}').includeSubIssues).toBe(false)
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ includeSubIssues: 'yes' }))
    expect(readPreferences(storage).includeSubIssues).toBeUndefined()
  })

  it('ignores a corrupt saved value and an unknown chart', () => {
    const storage = memoryStorage()
    storage.setItem(PREFERENCES_KEY, '{')
    expect(readPreferences(storage)).toEqual({ recentFiles: [] })
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: 'blue', chartId: 'not-a-chart', locale: 'fr' }))
    expect(readPreferences(storage)).toEqual({ recentFiles: [] })
  })
})

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.get(key) ?? null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}
