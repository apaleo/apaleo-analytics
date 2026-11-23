import { describe, expect, it } from 'vitest'
import { formatIsoDate } from '../isoDate.ts'
import { mapLinearTeamToDataset } from './mapToDataset.ts'
import type { LinearHistoryEntry, LinearIssue, LinearTeamBundle, LinearWorkflowState } from './types.ts'

const states: LinearWorkflowState[] = [
  { id: 'triage', name: 'Triage', type: 'triage', position: 0 },
  { id: 'backlog', name: 'Backlog', type: 'backlog', position: 1 },
  { id: 'todo', name: 'Todo', type: 'unstarted', position: 2 },
  { id: 'doing', name: 'In Progress', type: 'started', position: 3 },
  { id: 'done', name: 'Done', type: 'completed', position: 4 },
  { id: 'canceled', name: 'Canceled', type: 'canceled', position: 5 },
  { id: 'dup', name: 'Duplicate', type: 'duplicate', position: 6 },
]

function history(createdAt: string, fromId: string | null, toId: string | null): LinearHistoryEntry {
  return {
    createdAt,
    fromState: fromId === null ? null : { id: fromId, name: fromId },
    toState: toId === null ? null : { id: toId, name: toId },
  }
}

function issue(overrides: Partial<LinearIssue> & Pick<LinearIssue, 'identifier'>): LinearIssue {
  return {
    id: overrides.id ?? overrides.identifier,
    identifier: overrides.identifier,
    url: overrides.url ?? `https://linear.app/acme/issue/${overrides.identifier}`,
    title: overrides.title ?? overrides.identifier,
    createdAt: overrides.createdAt ?? '2026-01-01T12:00:00.000Z',
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    canceledAt: overrides.canceledAt ?? null,
    priorityLabel: overrides.priorityLabel ?? 'No priority',
    state: overrides.state === undefined ? { id: 'backlog', name: 'Backlog', type: 'backlog' } : overrides.state,
    assignee: overrides.assignee === undefined ? null : overrides.assignee,
    project: overrides.project === undefined ? null : overrides.project,
    labels: overrides.labels ?? [],
    team: overrides.team === undefined ? { id: 'team-1', name: 'Platform' } : overrides.team,
    history: overrides.history ?? [],
    parentId: overrides.parentId === undefined ? null : overrides.parentId,
  }
}

function bundle(issues: LinearIssue[], teamStates: LinearWorkflowState[] = states): LinearTeamBundle {
  return { teamId: 'team-1', teamName: 'Platform', states: teamStates, issues }
}

function days(dates: readonly (Date | null)[]): (string | null)[] {
  return dates.map((date) => (date === null ? null : formatIsoDate(date)))
}

describe('mapLinearTeamToDataset', () => {
  const fetchedAt = new Date('2026-11-11T10:00:00.000Z')

  it('orders states, skips canceled, duplicate, and triage, and dates the first entry from history', () => {
    const result = mapLinearTeamToDataset(
      bundle([
        issue({
          identifier: 'ENG-1',
          title: 'Ship the chart',
          priorityLabel: 'High',
          assignee: { displayName: 'Ada' },
          project: { name: 'Launch' },
          labels: ['Bug', 'API'],
          state: { id: 'done', name: 'Done', type: 'completed' },
          createdAt: '2026-01-01T08:00:00.000Z',
          startedAt: '2026-01-04T08:00:00.000Z',
          completedAt: '2026-01-09T08:00:00.000Z',
          history: [
            history('2026-01-05T08:00:00.000Z', 'backlog', 'doing'),
            history('2026-01-09T08:00:00.000Z', 'doing', 'done'),
            history('2026-01-12T08:00:00.000Z', 'done', 'doing'),
          ],
        }),
      ]),
      { fetchedAt },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.stages).toEqual([
      { name: 'Backlog', role: 'backlog' },
      { name: 'Todo', role: 'workflow' },
      { name: 'In Progress', role: 'workflow' },
      { name: 'Done', role: 'workflow' },
    ])
    expect(result.dataset.metadata.sourceName).toBe('Linear · Platform')
    expect(result.dataset.metadata.sourceKind).toBe('linear')
    expect(result.dataset.metadata.linearTeamId).toBe('team-1')
    expect(result.dataset.metadata.linearTeamName).toBe('Platform')
    expect(result.dataset.metadata.fetchedAt).toBe('2026-11-11T10:00:00.000Z')
    expect(result.dataset.metadata).not.toHaveProperty('linearExcludeCanceled')
    expect(result.dataset.metadata.attributeColumns).toEqual([
      'State',
      'Assignee',
      'Priority',
      'Project',
      'Labels',
      'Team',
    ])

    const item = result.dataset.items[0]
    expect(item?.id).toBe('ENG-1')
    expect(item?.link).toBe('https://linear.app/acme/issue/ENG-1')
    expect(item?.title).toBe('Ship the chart')
    expect(item?.blockedDays).toBe(0)
    expect(days(item?.stageDates ?? [])).toEqual(['2026-01-01', null, '2026-01-05', '2026-01-09'])
    expect(item?.attributes).toEqual({
      State: 'Done',
      Assignee: 'Ada',
      Priority: 'High',
      Project: 'Launch',
      Labels: '[Bug|API]',
      Team: 'Platform',
    })
  })

  it('orders states by type rank when each Linear type restarts position at 0', () => {
    const result = mapLinearTeamToDataset(
      bundle(
        [],
        [
          { id: 'done', name: 'Done', type: 'completed', position: 0 },
          { id: 'triage', name: 'Triage', type: 'triage', position: 0 },
          { id: 'review', name: 'In Review', type: 'started', position: 1 },
          { id: 'canceled', name: 'Canceled', type: 'canceled', position: 0 },
          { id: 'progress', name: 'In Progress', type: 'started', position: 0 },
          { id: 'dup', name: 'Duplicate', type: 'duplicate', position: 0 },
          { id: 'new', name: 'New', type: 'backlog', position: 0 },
          { id: 'merged', name: 'Merged', type: 'started', position: 2 },
          { id: 'planned', name: 'Planned', type: 'unstarted', position: 0 },
        ],
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.stages).toEqual([
      { name: 'New', role: 'backlog' },
      { name: 'Planned', role: 'workflow' },
      { name: 'In Progress', role: 'workflow' },
      { name: 'In Review', role: 'workflow' },
      { name: 'Merged', role: 'workflow' },
      { name: 'Done', role: 'workflow' },
    ])
  })

  it('stores each label as a multi-value, including a single label', () => {
    const result = mapLinearTeamToDataset(
      bundle([
        issue({ identifier: 'ENG-L', labels: [' Bug ', '', 'API'] }),
        issue({ identifier: 'ENG-M', labels: ['Platform'] }),
        issue({ identifier: 'ENG-N', labels: [] }),
      ]),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.items.map((item) => item.attributes.Labels)).toEqual(['[Bug|API]', '[Platform]', ''])
  })

  it('uses created, started, and completed timestamps when history has no state transitions', () => {
    const result = mapLinearTeamToDataset(
      bundle([
        issue({
          identifier: 'ENG-2',
          state: { id: 'done', name: 'Done', type: 'completed' },
          createdAt: '2026-02-01T12:00:00.000Z',
          startedAt: '2026-02-03T12:00:00.000Z',
          completedAt: '2026-02-10T12:00:00.000Z',
          history: [],
        }),
      ]),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(days(result.dataset.items[0]?.stageDates ?? [])).toEqual([
      '2026-02-01',
      null,
      '2026-02-03',
      '2026-02-10',
    ])
  })

  it('fills a completed stage from completedAt when history never records that transition', () => {
    const result = mapLinearTeamToDataset(
      bundle([
        issue({
          identifier: 'ENG-3',
          state: { id: 'done', name: 'Done', type: 'completed' },
          createdAt: '2026-03-01T12:00:00.000Z',
          completedAt: '2026-03-08T12:00:00.000Z',
          history: [history('2026-03-04T12:00:00.000Z', 'backlog', 'doing')],
        }),
      ]),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(days(result.dataset.items[0]?.stageDates ?? [])).toEqual([
      '2026-03-01',
      null,
      '2026-03-04',
      '2026-03-08',
    ])
  })

  it('omits canceled, duplicate, and triage issues without an exclusion warning', () => {
    const issues = [
      issue({ identifier: 'ENG-4', state: { id: 'doing', name: 'In Progress', type: 'started' } }),
      issue({
        identifier: 'ENG-5',
        canceledAt: '2026-04-02T12:00:00.000Z',
        state: { id: 'canceled', name: 'Canceled', type: 'canceled' },
      }),
      issue({
        identifier: 'ENG-6',
        canceledAt: '2026-04-03T12:00:00.000Z',
        state: { id: 'doing', name: 'In Progress', type: 'started' },
      }),
      issue({
        identifier: 'ENG-7',
        state: { id: 'cancelled', name: 'Cancelled', type: 'Cancelled' },
      }),
      issue({
        identifier: 'ENG-8',
        state: { id: 'dup', name: 'Duplicate', type: 'Duplicate' },
      }),
      issue({
        identifier: 'ENG-9',
        state: { id: 'triage', name: 'Triage', type: ' triage ' },
      }),
      issue({ identifier: ' ', title: 'Missing id' }),
    ]

    const result = mapLinearTeamToDataset(bundle(issues))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.items.map((item) => item.id)).toEqual(['ENG-4'])
    expect(result.dataset.metadata.stages.map((stage) => stage.name)).toEqual([
      'Backlog',
      'Todo',
      'In Progress',
      'Done',
    ])
    expect(result.dataset.warnings).toEqual(['Skipped 1 issue with no identifier.'])
    expect(result.dataset.warnings.join(' ')).not.toMatch(/Excluded \d+ canceled/)
    expect(result.ignoredIds).toEqual(['ENG-5', 'ENG-6', 'ENG-7', 'ENG-8', 'ENG-9'])
  })

  it('promotes the first non-completed state when a team would otherwise have one workflow stage', () => {
    const result = mapLinearTeamToDataset(
      bundle(
        [],
        [
          { id: 'backlog', name: 'Backlog', type: 'backlog', position: 0 },
          { id: 'done', name: 'Done', type: 'completed', position: 1 },
        ],
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.stages).toEqual([
      { name: 'Backlog', role: 'workflow' },
      { name: 'Done', role: 'workflow' },
    ])
    expect(result.dataset.warnings[0]).toMatch(/first non-completed state/)
  })

  it('records since and the latest completed day, ignoring canceled issues', () => {
    const done = { id: 'done', name: 'Done', type: 'completed' }
    const doing = { id: 'doing', name: 'In Progress', type: 'started' }
    const result = mapLinearTeamToDataset(
      bundle([
        issue({
          identifier: 'ENG-1',
          state: done,
          completedAt: '2026-09-02T15:00:00.000Z',
        }),
        issue({
          identifier: 'ENG-2',
          state: done,
          completedAt: '2026-10-20T15:00:00.000Z',
        }),
        issue({ identifier: 'ENG-3', state: doing, completedAt: null }),
        issue({
          identifier: 'ENG-4',
          state: { id: 'canceled', name: 'Canceled', type: 'canceled' },
          completedAt: '2026-11-01T15:00:00.000Z',
          canceledAt: '2026-11-01T15:00:00.000Z',
        }),
      ]),
      { since: '2026-08-01', fetchedAt },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.items.map((item) => item.id)).toEqual(['ENG-1', 'ENG-2', 'ENG-3'])
    expect(result.dataset.metadata.linearSince).toBe('2026-08-01')
    expect(result.dataset.metadata.linearClosedThrough).toBe('2026-10-20')
    expect(result.ignoredIds).toEqual(['ENG-4'])
  })

  it('uses since as the closed-through date when nothing is completed', () => {
    const result = mapLinearTeamToDataset(
      bundle([
        issue({
          identifier: 'ENG-1',
          state: { id: 'doing', name: 'In Progress', type: 'started' },
          completedAt: null,
        }),
      ]),
      { since: '2026-08-01', fetchedAt },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.linearSince).toBe('2026-08-01')
    expect(result.dataset.metadata.linearClosedThrough).toBe('2026-08-01')
  })

  it('leaves linearSince off an incremental export', () => {
    const result = mapLinearTeamToDataset(
      bundle([
        issue({
          identifier: 'ENG-1',
          state: { id: 'done', name: 'Done', type: 'completed' },
          completedAt: '2026-10-20T15:00:00.000Z',
        }),
      ]),
      { since: '2026-10-01', mode: 'incremental', fetchedAt },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.linearSince).toBeUndefined()
    expect(result.dataset.metadata.linearClosedThrough).toBe('2026-10-20')
  })

  it('keeps a parent id and omits it when the issue has none', () => {
    const result = mapLinearTeamToDataset(
      bundle([
        issue({ identifier: 'ENG-1', parentId: 'issue-parent' }),
        issue({ identifier: 'ENG-2', parentId: null }),
      ]),
      { fetchedAt },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.items.find((item) => item.id === 'ENG-1')?.parentId).toBe('issue-parent')
    expect(result.dataset.items.find((item) => item.id === 'ENG-2')?.parentId).toBeUndefined()
  })

  it('rejects a team that still has fewer than two workflow stages', () => {
    const result = mapLinearTeamToDataset(
      bundle([], [{ id: 'done', name: 'Done', type: 'completed', position: 1 }]),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/two workflow stages/)
  })
})
