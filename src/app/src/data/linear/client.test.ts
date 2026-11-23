import { describe, expect, it } from 'vitest'
import { fetchLinearTeamBundle, linearGraphql, listLinearTeams, readLinearPayload } from './client.ts'
import {
  ISSUE_HISTORY_QUERY,
  LINEAR_GRAPHQL_URL,
  TEAM_ISSUES_QUERY,
  TEAM_ISSUES_UNFILTERED_QUERY,
  TEAM_ISSUES_UPDATED_QUERY,
  TEAMS_QUERY,
} from './queries.ts'
import { completedSinceIso } from './since.ts'

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
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    priorityLabel: 'No priority',
    state: { id: 'doing', name: 'Doing', type: 'started' },
    assignee: null,
    project: null,
    labels: { nodes: [] },
    team: { id: 'team-1', name: 'Eng' },
    ...overrides,
  }
}

function teamPayload(query: string, issues: unknown[]) {
  if (query.includes('LinearTeamStates')) {
    return {
      data: {
        team: {
          id: 'team-1',
          name: 'Eng',
          states: {
            nodes: [{ id: 'doing', name: 'Doing', type: 'started', position: 1 }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    }
  }
  if (query.includes('LinearTeamIssues')) {
    return {
      data: {
        team: {
          id: 'team-1',
          name: 'Eng',
          issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: issues },
        },
      },
    }
  }
  return null
}

function historyPayload(id: string) {
  return {
    data: {
      issue: {
        id,
        history: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ createdAt: '2026-03-01T00:00:00.000Z', fromState: null, toState: { id: 'doing', name: 'Doing' } }],
        },
      },
    },
  }
}

describe('Linear client', () => {
  it('reads a 401 as an invalid API key', () => {
    expect(readLinearPayload(401, { errors: [{ message: 'Authentication required' }] })).toEqual({
      ok: false,
      error: 'invalid API key',
      invalidKey: true,
    })
    expect(
      readLinearPayload(200, {
        errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }],
      }),
    ).toEqual({ ok: false, error: 'invalid API key', invalidKey: true })
  })

  it('posts the key in Authorization with no Bearer prefix', async () => {
    let seenUrl = ''
    let seenMethod = ''
    let seenAuth: string | null = null
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input)
      seenMethod = init?.method ?? ''
      seenAuth = new Headers(init?.headers).get('Authorization')
      return jsonResponse({ data: { ok: true } })
    }

    await expect(linearGraphql('Bearer lin_api_test', 'query { viewer { id } }', undefined, { fetchImpl })).resolves.toEqual({
      ok: true,
    })
    expect(seenUrl).toBe(LINEAR_GRAPHQL_URL)
    expect(seenMethod).toBe('POST')
    expect(seenAuth).toBe('lin_api_test')
  })

  it('pages teams and falls back when parent is not a field', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: { after?: string } }
      if (body.query.includes('LinearTeamsFlat')) {
        return jsonResponse({
          data: {
            teams: {
              nodes: [{ id: 'solo', name: 'Solo' }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        })
      }
      if (body.query.includes('parent')) {
        return jsonResponse({
          errors: [{ message: 'Cannot query field "parent" on type "Team".' }],
        })
      }
      throw new Error(body.query)
    }

    await expect(listLinearTeams('lin_api_test', { fetchImpl })).resolves.toEqual([
      { id: 'solo', name: 'Solo', parentId: null, parentName: null },
    ])
  })

  it('follows issue and history cursors', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: { id?: string; after?: string } }
      if (body.query.includes('LinearTeamStates')) {
        return jsonResponse({
          data: {
            team: {
              id: 'team-1',
              name: 'Eng',
              states: {
                nodes: [{ id: 'doing', name: 'Doing', type: 'started', position: 1 }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }
      if (body.query.includes('LinearTeamIssues') && body.variables?.after === undefined) {
        return jsonResponse({
          data: {
            team: {
              id: 'team-1',
              name: 'Eng',
              issues: {
                pageInfo: { hasNextPage: true, endCursor: 'i1' },
                nodes: [
                  {
                    id: 'issue-1',
                    identifier: 'ENG-1',
                    url: 'https://linear.app/eng/issue/ENG-1',
                    title: 'One',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    startedAt: null,
                    completedAt: null,
                    canceledAt: null,
                    priorityLabel: 'High',
                    state: { id: 'doing', name: 'Doing', type: 'started' },
                    assignee: { displayName: 'Ada' },
                    project: { name: 'Launch' },
                    labels: { nodes: [{ name: 'Bug' }] },
                    team: { id: 'team-1', name: 'Eng' },
                  },
                ],
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
              name: 'Eng',
              issues: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: 'issue-2',
                    identifier: 'ENG-2',
                    url: 'https://linear.app/eng/issue/ENG-2',
                    title: 'Two',
                    createdAt: '2026-01-04T00:00:00.000Z',
                    startedAt: null,
                    completedAt: null,
                    canceledAt: null,
                    priorityLabel: 'Low',
                    state: null,
                    assignee: null,
                    project: null,
                    labels: { nodes: [] },
                    team: { id: 'team-1', name: 'Eng' },
                  },
                ],
              },
            },
          },
        })
      }
      if (body.query.includes('LinearIssueHistory') && body.variables?.id === 'issue-1' && body.variables.after === undefined) {
        return jsonResponse({
          data: {
            issue: {
              id: 'issue-1',
              history: {
                pageInfo: { hasNextPage: true, endCursor: 'h1' },
                nodes: [
                  {
                    createdAt: '2026-01-02T00:00:00.000Z',
                    fromState: { id: 'todo', name: 'Todo' },
                    toState: { id: 'doing', name: 'Doing' },
                  },
                ],
              },
            },
          },
        })
      }
      if (body.query.includes('LinearIssueHistory') && body.variables?.id === 'issue-1' && body.variables.after === 'h1') {
        return jsonResponse({
          data: {
            issue: {
              id: 'issue-1',
              history: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    createdAt: '2026-01-03T00:00:00.000Z',
                    fromState: { id: 'doing', name: 'Doing' },
                    toState: { id: 'done', name: 'Done' },
                  },
                ],
              },
            },
          },
        })
      }
      if (body.query.includes('LinearIssueHistory') && body.variables?.id === 'issue-2') {
        return jsonResponse({
          data: {
            issue: {
              id: 'issue-2',
              history: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
            },
          },
        })
      }
      throw new Error(body.query)
    }

    const bundle = await fetchLinearTeamBundle('team-1', 'lin_api_test', { fetchImpl })
    expect(bundle?.teamName).toBe('Eng')
    expect(bundle?.states.map((state) => state.name)).toEqual(['Doing'])
    expect(bundle?.issues.map((issue) => issue.identifier)).toEqual(['ENG-1', 'ENG-2'])
    expect(bundle?.issues[0]?.history.map((entry) => entry.createdAt)).toEqual([
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
    ])
    expect(bundle?.issues[0]?.labels).toEqual(['Bug'])
    expect(bundle?.issues[0]?.assignee).toEqual({ displayName: 'Ada' })
  })

  it('skips history for canceled, duplicate, and triage issues and fetches the rest six at a time', async () => {
    const active = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']
    const skipped = [
      issueNode('c-at', { canceledAt: '2026-02-01T00:00:00.000Z' }),
      issueNode('c-type', { state: { id: 'canceled', name: 'Canceled', type: 'canceled' } }),
      issueNode('c-brit', { state: { id: 'cancelled', name: 'Cancelled', type: 'Cancelled' } }),
      issueNode('dup', { state: { id: 'dup', name: 'Duplicate', type: 'duplicate' } }),
      issueNode('tri', { state: { id: 'tri', name: 'Triage', type: 'Triage' } }),
    ]
    const nodes = [...active.map((id) => issueNode(id)), ...skipped]
    const historyIds: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const counts: number[] = []

    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: { id?: string } }
      const page = teamPayload(body.query, nodes)
      if (page) return jsonResponse(page)
      if (body.query.includes('LinearIssueHistory')) {
        const id = body.variables?.id ?? ''
        historyIds.push(id)
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return jsonResponse(historyPayload(id))
      }
      throw new Error(body.query)
    }

    const bundle = await fetchLinearTeamBundle('team-1', 'lin_api_test', {
      fetchImpl,
      onIssueCount: (count) => counts.push(count),
    })

    expect(historyIds.slice().sort()).toEqual(active.slice().sort())
    expect(maxInFlight).toBe(6)
    expect(bundle?.issues.map((issue) => issue.id)).toEqual(nodes.map((issue) => issue.id))
    for (const issue of bundle?.issues ?? []) {
      expect(issue.history).toHaveLength(active.includes(issue.id) ? 1 : 0)
    }
    expect(counts).toEqual([13, 6, 7, 8, 9, 10, 11, 12, 13])
  })

  it('sends completedSince and keeps open issues plus completions in the window', async () => {
    const since = completedSinceIso('2026-08-01')
    expect(since).not.toBeNull()
    if (since === null) return
    const seen: { query: string; variables: Record<string, unknown> }[] = []
    const historyIds: string[] = []
    const nodes = [
      issueNode('OLD', { identifier: 'OLD', completedAt: new Date(Date.parse(since) - 1).toISOString() }),
      issueNode('EXACT', { identifier: 'EXACT', completedAt: since, state: { id: 'done', name: 'Done', type: 'completed' } }),
      issueNode('NEW', { identifier: 'NEW', completedAt: '2026-09-01T12:00:00.000Z', state: { id: 'done', name: 'Done', type: 'completed' } }),
      issueNode('OPEN', { identifier: 'OPEN', completedAt: null }),
      issueNode('CANCELED', { identifier: 'CANCELED', completedAt: null, canceledAt: '2026-04-01T00:00:00.000Z' }),
    ]

    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, unknown> }
      seen.push({ query: body.query, variables: body.variables ?? {} })
      if (body.query.includes('LinearTeamIssues')) {
        return jsonResponse({
          data: {
            team: {
              id: 'team-1',
              name: 'Eng',
              issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
            },
          },
        })
      }
      const page = teamPayload(body.query, nodes)
      if (page) return jsonResponse(page)
      if (body.query.includes('LinearIssueHistory')) {
        historyIds.push(String(body.variables?.id ?? ''))
        return jsonResponse(historyPayload(String(body.variables?.id ?? '')))
      }
      throw new Error(body.query)
    }

    const bundle = await fetchLinearTeamBundle('team-1', 'lin_api_test', { fetchImpl, completedSince: since })
    const issueCall = seen.find((call) => call.query.includes('LinearTeamIssues'))
    expect(issueCall?.variables).toEqual({ id: 'team-1', completedSince: since })
    expect(issueCall?.query).toContain('$completedSince: DateTimeOrDuration!')
    expect(issueCall?.query).toContain('completedAt: { gte: $completedSince }')
    expect(issueCall?.query).toContain('completedAt: { null: true }')
    expect(bundle?.issues.map((issue) => issue.identifier)).toEqual(['EXACT', 'NEW', 'OPEN', 'CANCELED'])
    expect(historyIds).not.toContain('OLD')
    expect(historyIds).not.toContain('CANCELED')
  })

  it('sends updatedSince and keeps issues outside the completion window', async () => {
    const updatedSince = '2026-11-11T14:00:00.000Z'
    const seen: { query: string; variables: Record<string, unknown> }[] = []
    const historyIds: string[] = []
    const nodes = [
      issueNode('OLD-DONE', {
        identifier: 'OLD-DONE',
        completedAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2026-11-11T15:00:00.000Z',
        state: { id: 'done', name: 'Done', type: 'completed' },
      }),
      issueNode('CANCELED', {
        identifier: 'CANCELED',
        canceledAt: '2026-11-11T16:00:00.000Z',
        state: { id: 'canceled', name: 'Canceled', type: 'canceled' },
      }),
    ]

    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, unknown> }
      seen.push({ query: body.query, variables: body.variables ?? {} })
      if (body.query.includes('LinearTeamIssues')) {
        return jsonResponse({
          data: {
            team: {
              id: 'team-1',
              name: 'Eng',
              issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
            },
          },
        })
      }
      const page = teamPayload(body.query, nodes)
      if (page) return jsonResponse(page)
      if (body.query.includes('LinearIssueHistory')) {
        historyIds.push(String(body.variables?.id ?? ''))
        return jsonResponse(historyPayload(String(body.variables?.id ?? '')))
      }
      throw new Error(body.query)
    }

    const bundle = await fetchLinearTeamBundle('team-1', 'lin_api_test', { fetchImpl, updatedSince })
    const issueCall = seen.find((call) => call.query.includes('LinearTeamIssues'))
    expect(issueCall?.variables).toEqual({ id: 'team-1', updatedSince })
    expect(issueCall?.query).toContain('updatedAt: { gt: $updatedSince }')
    expect(issueCall?.query).toContain('includeArchived: true')
    expect(issueCall?.query).not.toContain('completedSince')
    expect(issueCall?.query).not.toContain('completedAt: { null: true }')
    expect(bundle?.issues.map((issue) => issue.identifier)).toEqual(['OLD-DONE', 'CANCELED'])
    expect(bundle?.issues[0]?.updatedAt).toBe('2026-11-11T15:00:00.000Z')
    expect(historyIds).toEqual(['OLD-DONE'])
  })

  it('does not download every issue when the updatedAt filter is rejected', async () => {
    let issueCalls = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string }
      if (body.query.includes('LinearTeamIssues')) {
        issueCalls += 1
        return jsonResponse({ errors: [{ message: 'Field "gt" is not defined by type "DateComparator".' }] })
      }
      const page = teamPayload(body.query, [])
      if (page) return jsonResponse(page)
      throw new Error(body.query)
    }

    await expect(
      fetchLinearTeamBundle('team-1', 'lin_api_test', { fetchImpl, updatedSince: '2026-11-11T14:00:00.000Z' }),
    ).rejects.toThrow(/gt/)
    expect(issueCalls).toBe(1)
  })

  it('filters on the client when Linear rejects the null completedAt predicate', async () => {
    const since = completedSinceIso('2026-08-01')
    expect(since).not.toBeNull()
    if (since === null) return
    const queries: string[] = []
    let issueCalls = 0
    const nodes = [
      issueNode('OLD', { completedAt: '2026-01-01T00:00:00.000Z' }),
      issueNode('OPEN', { completedAt: null }),
    ]

    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, unknown> }
      queries.push(body.query)
      if (body.query.includes('LinearTeamIssues')) {
        issueCalls += 1
        if (issueCalls === 1) {
          return jsonResponse({
            errors: [{ message: 'Field "null" is not defined by type "DateComparator".' }],
          })
        }
        expect(body.variables?.completedSince).toBeUndefined()
        return jsonResponse({
          data: {
            team: {
              id: 'team-1',
              name: 'Eng',
              issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
            },
          },
        })
      }
      const page = teamPayload(body.query, nodes)
      if (page) return jsonResponse(page)
      if (body.query.includes('LinearIssueHistory')) return jsonResponse(historyPayload(String(body.variables?.id ?? '')))
      throw new Error(body.query)
    }

    const bundle = await fetchLinearTeamBundle('team-1', 'lin_api_test', { fetchImpl, completedSince: since })
    expect(issueCalls).toBe(2)
    expect(queries.some((query) => query.includes('completedAt: { null: true }'))).toBe(true)
    expect(queries.some((query) => query.includes('LinearTeamIssues') && !query.includes('completedSince'))).toBe(true)
    expect(bundle?.issues.map((issue) => issue.id)).toEqual(['OPEN'])
  })

  it('reads a parent identifier when Linear rejects parent { id }', async () => {
    const queries: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: { id?: string } }
      queries.push(body.query)
      if (body.query.includes('LinearTeamIssues') && body.query.includes('parent { id }')) {
        return jsonResponse({ errors: [{ message: 'Cannot query field "parent" on type "Issue".' }] })
      }
      const page = teamPayload(body.query, [issueNode('child', { parent: { identifier: 'ECO-PARENT' } })])
      if (page) return jsonResponse(page)
      if (body.query.includes('LinearIssueHistory')) return jsonResponse(historyPayload(String(body.variables?.id ?? '')))
      throw new Error(body.query)
    }

    const bundle = await fetchLinearTeamBundle('team-1', 'lin_api_test', { fetchImpl })
    expect(bundle?.issues.map((issue) => issue.parentId)).toEqual(['ECO-PARENT'])
    expect(queries.some((query) => query.includes('LinearTeamIssues') && query.includes('parent { id }'))).toBe(true)
    expect(queries.some((query) => query.includes('LinearTeamIssues') && query.includes('parent { identifier }'))).toBe(true)
    expect(queries.some((query) => query.includes('LinearTeamIssues') && !query.includes('parent'))).toBe(false)
  })

  it('keeps a parent id from the issue payload', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      if (!String(input).includes('api.linear.app')) throw new Error(String(input))
      const body = JSON.parse(String(init?.body)) as { query: string; variables?: { id?: string } }
      const page = teamPayload(body.query, [issueNode('child', { parent: { id: 'parent-issue' } })])
      if (page) return jsonResponse(page)
      if (body.query.includes('LinearIssueHistory')) return jsonResponse(historyPayload(String(body.variables?.id ?? '')))
      throw new Error(body.query)
    }

    const bundle = await fetchLinearTeamBundle('team-1', 'lin_api_test', { fetchImpl })
    expect(bundle?.issues[0]?.parentId).toBe('parent-issue')
  })

  it('asks for the issue fields the mapper needs', () => {
    expect(TEAMS_QUERY).toContain('parent')
    expect(TEAM_ISSUES_QUERY).toContain('parent { id }')
    for (const field of [
      'identifier',
      'url',
      'title',
      'createdAt',
      'startedAt',
      'completedAt',
      'canceledAt',
      'priorityLabel',
      'displayName',
      'includeArchived: true',
      'issues(first: 25',
    ]) {
      expect(TEAM_ISSUES_QUERY).toContain(field)
    }
    expect(TEAM_ISSUES_QUERY).not.toContain('history')
    expect(TEAM_ISSUES_QUERY).toContain('completedAt: { gte: $completedSince }')
    expect(TEAM_ISSUES_QUERY).toContain('completedAt: { null: true }')
    expect(TEAM_ISSUES_QUERY).not.toContain('updatedSince')
    expect(TEAM_ISSUES_UNFILTERED_QUERY).not.toContain('completedSince')
    expect(TEAM_ISSUES_UPDATED_QUERY).toContain('updatedAt: { gt: $updatedSince }')
    expect(TEAM_ISSUES_UPDATED_QUERY).toContain('archivedAt: { gt: $updatedSince }')
    expect(TEAM_ISSUES_UPDATED_QUERY).toContain('canceledAt: { gt: $updatedSince }')
    expect(TEAM_ISSUES_UPDATED_QUERY).toContain('includeArchived: true')
    expect(TEAM_ISSUES_UPDATED_QUERY).not.toContain('completedSince')
    expect(TEAM_ISSUES_UPDATED_QUERY).toContain('updatedAt')
    for (const field of ['history(first: 50', 'fromState', 'toState', '$id: String!']) {
      expect(ISSUE_HISTORY_QUERY).toContain(field)
    }
  })
})
