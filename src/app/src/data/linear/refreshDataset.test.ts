import { describe, expect, it } from 'vitest'
import { openForecastIssues } from '../../charts/montecarlo/openIssues.ts'
import { applySubIssueFilter } from '../../domain/subIssues.ts'
import type { Dataset } from '../../domain/types.ts'
import { exportLinearTeam } from './exportTeam.ts'
import { refreshLinearDataset } from './refreshDataset.ts'
import { completedSinceIso } from './since.ts'

const noParents = async () => new Map<string, string | null>()

const FETCHED_AT = '2026-11-11T14:00:00.000Z'
const NOW = new Date('2026-11-12T12:00:00.000Z')

function linearDataset(fetchedAt?: string): Dataset {
  return {
    metadata: {
      sourceName: 'Linear · Platform',
      sourceKind: 'linear',
      linearTeamId: 'team-1',
      linearTeamName: 'Platform',
      linearSince: '2026-08-01',
      linearClosedThrough: '2026-10-20',
      fetchedAt,
      idColumn: 'ID',
      stages: [
        { name: 'Todo', role: 'workflow' },
        { name: 'Done', role: 'workflow' },
      ],
      attributeColumns: [],
      dateOrder: 'ymd',
    },
    items: [
      {
        id: 'KEEP-1',
        stageDates: [new Date(2026, 0, 5), null],
        blockedDays: 0,
        attributes: {},
      },
      {
        id: 'GONE-1',
        stageDates: [new Date(2026, 0, 6), null],
        blockedDays: 0,
        attributes: {},
      },
    ],
    warnings: [],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function issueNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    identifier: id,
    url: `https://linear.app/eng/issue/${id}`,
    title: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-11-11T15:00:00.000Z',
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    archivedAt: null,
    priorityLabel: 'No priority',
    state: { id: 'todo', name: 'Todo', type: 'unstarted' },
    assignee: null,
    project: null,
    labels: { nodes: [] },
    team: { id: 'team-1', name: 'Platform' },
    ...overrides,
  }
}

interface GraphqlCall {
  query: string
  variables: Record<string, unknown>
}

function linearFetch(issues: unknown[], calls: GraphqlCall[]): typeof fetch {
  return async (input, init) => {
    if (!String(input).includes('api.linear.app')) throw new Error(String(input))
    const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, unknown> }
    calls.push({ query: body.query, variables: body.variables ?? {} })
    if (body.query.includes('LinearTeamStates')) {
      return jsonResponse({
        data: {
          team: {
            id: 'team-1',
            name: 'Platform',
            states: {
              nodes: [
                { id: 'todo', name: 'Todo', type: 'unstarted', position: 1 },
                { id: 'done', name: 'Done', type: 'completed', position: 2 },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
    }
    if (body.query.includes('LinearTeamIssues')) {
      return jsonResponse({
        data: {
          team: {
            id: 'team-1',
            name: 'Platform',
            issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: issues },
          },
        },
      })
    }
    if (body.query.includes('LinearIssueHistory')) {
      return jsonResponse({
        data: {
          issue: {
            id: body.variables?.id,
            history: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
          },
        },
      })
    }
    throw new Error(body.query)
  }
}

function issueCalls(calls: readonly GraphqlCall[]): GraphqlCall[] {
  return calls.filter((call) => call.query.includes('LinearTeamIssues'))
}

describe('refreshLinearDataset', () => {
  it('queries issues updated after fetchedAt and keeps an empty delta', async () => {
    const calls: GraphqlCall[] = []
    const base = linearDataset(FETCHED_AT)
    const result = await refreshLinearDataset(base, {
      apiKey: 'lin_api_test',
      now: NOW,
      exportTeam: (options) => exportLinearTeam({ ...options, fetchImpl: linearFetch([], calls) }),
      loadParents: noParents,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const issueCall = issueCalls(calls)[0]
    expect(issueCall?.variables).toEqual({ id: 'team-1', updatedSince: FETCHED_AT })
    expect(issueCall?.query).toContain('updatedAt: { gt: $updatedSince }')
    expect(issueCall?.query).not.toContain('completedSince')
    expect(issueCall?.query).not.toContain('completedAt: { null: true }')
    expect(result.dataset.items.map((item) => item.id)).toEqual(['KEEP-1', 'GONE-1'])
    expect(result.dataset.metadata.fetchedAt).toBe(NOW.toISOString())
    expect(result.dataset.metadata.linearSince).toBe('2026-08-01')
    expect(base.metadata.fetchedAt).toBe(FETCHED_AT)
  })

  it('drops canceled issues from the delta and loads history only for the rest', async () => {
    const calls: GraphqlCall[] = []
    const nodes = [
      issueNode('issue-new', {
        identifier: 'NEW-1',
        completedAt: '2020-01-01T00:00:00.000Z',
        state: { id: 'done', name: 'Done', type: 'completed' },
      }),
      issueNode('issue-gone', {
        identifier: 'GONE-1',
        canceledAt: '2026-11-11T16:00:00.000Z',
        state: { id: 'canceled', name: 'Canceled', type: 'canceled' },
      }),
    ]
    const result = await refreshLinearDataset(linearDataset(FETCHED_AT), {
      apiKey: 'lin_api_test',
      now: NOW,
      exportTeam: (options) => exportLinearTeam({ ...options, fetchImpl: linearFetch(nodes, calls) }),
      loadParents: noParents,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(issueCalls(calls)[0]?.variables.updatedSince).toBe(FETCHED_AT)
    expect(issueCalls(calls)[0]?.variables.completedSince).toBeUndefined()
    expect(result.dataset.items.map((item) => item.id)).toEqual(['KEEP-1', 'NEW-1'])
    const historyIds = calls.filter((call) => call.query.includes('LinearIssueHistory')).map((call) => call.variables.id)
    expect(historyIds).toEqual(['issue-new'])
    expect(result.dataset.metadata.fetchedAt).toBe(NOW.toISOString())
  })

  it('uses one completion-window refresh when fetchedAt is missing, then updatedAt', async () => {
    const calls: GraphqlCall[] = []
    const fetchImpl = linearFetch([], calls)
    const first = await refreshLinearDataset(linearDataset(undefined), {
      apiKey: 'lin_api_test',
      now: NOW,
      exportTeam: (options) => exportLinearTeam({ ...options, fetchImpl }),
      loadParents: noParents,
    })

    expect(first.ok).toBe(true)
    if (!first.ok) return
    const windowCall = issueCalls(calls)[0]
    expect(windowCall?.variables).toEqual({ id: 'team-1', completedSince: completedSinceIso('2026-10-20') })
    expect(windowCall?.query).toContain('completedAt: { gte: $completedSince }')
    expect(windowCall?.query).toContain('completedAt: { null: true }')
    expect(windowCall?.query).not.toContain('updatedSince')
    expect(first.dataset.metadata.fetchedAt).toBe(NOW.toISOString())
    expect(first.dataset.items.map((item) => item.id)).toEqual(['KEEP-1', 'GONE-1'])
    expect(first.dataset.metadata.linearSince).toBe('2026-08-01')

    const later = new Date('2026-11-12T18:00:00.000Z')
    const second = await refreshLinearDataset(first.dataset, {
      apiKey: 'lin_api_test',
      now: later,
      exportTeam: (options) => exportLinearTeam({ ...options, fetchImpl }),
      loadParents: noParents,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const deltaCall = issueCalls(calls)[1]
    expect(deltaCall?.variables).toEqual({ id: 'team-1', updatedSince: NOW.toISOString() })
    expect(deltaCall?.query).toContain('updatedAt: { gt: $updatedSince }')
    expect(deltaCall?.query).not.toContain('completedSince')
    expect(second.dataset.metadata.fetchedAt).toBe(later.toISOString())
    expect(second.dataset.items.map((item) => item.id)).toEqual(['KEEP-1', 'GONE-1'])
  })

  it('treats an unparseable fetchedAt as missing and uses the completion window', async () => {
    const calls: GraphqlCall[] = []
    const base = linearDataset('not-a-date')
    const result = await refreshLinearDataset(base, {
      apiKey: 'lin_api_test',
      now: NOW,
      exportTeam: (options) => exportLinearTeam({ ...options, fetchImpl: linearFetch([], calls) }),
      loadParents: noParents,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(issueCalls(calls)[0]?.variables.completedSince).toBe(completedSinceIso('2026-10-20'))
    expect(issueCalls(calls)[0]?.variables.updatedSince).toBeUndefined()
    expect(result.dataset.metadata.fetchedAt).toBe(NOW.toISOString())
  })

  it('leaves the previous fetchedAt when the export fails', async () => {
    const base = linearDataset(FETCHED_AT)
    const fetchImpl: typeof fetch = async () => new Response('no', { status: 500 })
    const result = await refreshLinearDataset(base, {
      apiKey: 'lin_api_test',
      now: NOW,
      exportTeam: (options) => exportLinearTeam({ ...options, fetchImpl }),
      loadParents: noParents,
    })

    expect(result).toEqual({ ok: false, error: 'Linear request failed (500).' })
    expect(base.metadata.fetchedAt).toBe(FETCHED_AT)
  })

  it('keeps the completedAt filter on a first import', async () => {
    const calls: GraphqlCall[] = []
    const result = await exportLinearTeam({
      apiKey: 'lin_api_test',
      teamId: 'team-1',
      since: '2026-08-01',
      mode: 'full',
      fetchImpl: linearFetch([], calls),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const issueCall = issueCalls(calls)[0]
    expect(issueCall?.variables).toEqual({ id: 'team-1', completedSince: completedSinceIso('2026-08-01') })
    expect(issueCall?.query).toContain('completedAt: { gte: $completedSince }')
    expect(issueCall?.query).toContain('completedAt: { null: true }')
    expect(issueCall?.query).not.toContain('updatedAt: { gt:')
    expect(result.dataset.metadata.linearSince).toBe('2026-08-01')
    expect(result.dataset.metadata.fetchedAt).toBeDefined()
  })

  it('stamps a parent id onto a saved issue the delta did not return', async () => {
    const calls: GraphqlCall[] = []
    const result = await refreshLinearDataset(linearDataset(FETCHED_AT), {
      apiKey: 'lin_api_test',
      now: NOW,
      exportTeam: (options) => exportLinearTeam({ ...options, fetchImpl: linearFetch([], calls) }),
      loadParents: async () => new Map([['KEEP-1', 'parent-issue']]),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.items.find((item) => item.id === 'KEEP-1')?.parentId).toBe('parent-issue')
    expect(result.dataset.items.find((item) => item.id === 'GONE-1')?.parentId).toBeUndefined()
    const stages = result.dataset.metadata.stages
    const asOf = new Date(2026, 10, 12)
    const hidden = applySubIssueFilter(result.dataset.items, false)
    const shown = applySubIssueFilter(result.dataset.items, true)
    expect(openForecastIssues(hidden, stages, asOf).map((item) => item.id)).toEqual(['GONE-1'])
    expect(openForecastIssues(shown, stages, asOf).map((item) => item.id)).toEqual(['KEEP-1', 'GONE-1'])
  })
})
