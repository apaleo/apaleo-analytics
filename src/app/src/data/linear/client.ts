import { isIgnoredIssue } from './mapToDataset.ts'
import {
  ISSUE_HISTORY_QUERY,
  ISSUE_PARENTS_QUERY,
  ISSUE_PARENTS_UNFILTERED_QUERY,
  LINEAR_GRAPHQL_URL,
  TEAMS_FLAT_QUERY,
  TEAMS_QUERY,
  TEAM_ISSUES_QUERY,
  TEAM_ISSUES_UNFILTERED_QUERY,
  TEAM_ISSUES_UPDATED_QUERY,
  TEAM_STATES_QUERY,
} from './queries.ts'
import { issueInCompletedWindow } from './since.ts'
import type { LinearHistoryEntry, LinearIssue, LinearStateRef, LinearTeam, LinearTeamBundle, LinearWorkflowState } from './types.ts'

const MAX_PAGES = 200
/** Parallel history reads. High enough to cut the serial wait, low enough to avoid a burst of rate limits. */
const HISTORY_CONCURRENCY = 6

export interface LinearClientOptions {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onIssueCount?: (count: number) => void
  /** UTC ISO instant of local midnight. First import, and a refresh that has no fetch time. Open issues stay. */
  completedSince?: string
  /** ISO DateTime. Refresh loads issues updated, archived, or canceled after this instant. */
  updatedSince?: string
}

export class LinearClientError extends Error {
  readonly invalidKey: boolean
  readonly status: number | null

  constructor(message: string, invalidKey: boolean, status: number | null) {
    super(message)
    this.name = 'LinearClientError'
    this.invalidKey = invalidKey
    this.status = status
  }
}

export type LinearPayloadResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; invalidKey: boolean }

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** Maps a failed Linear call to a short message. `invalid API key` is the stable 401 text. */
export function linearClientMessage(error: unknown): string {
  if (isAbortError(error)) return 'canceled'
  if (error instanceof LinearClientError) return error.message
  return 'Could not reach api.linear.app.'
}

/**
 * Interprets an HTTP status and a parsed GraphQL body.
 * A 401, or an `AUTHENTICATION_ERROR` extension, becomes `invalid API key`.
 */
export function readLinearPayload(status: number, payload: unknown): LinearPayloadResult {
  if (status === 401) return { ok: false, error: 'invalid API key', invalidKey: true }
  if (!isRecord(payload)) {
    const error = status >= 200 && status < 300 ? 'Linear returned an unreadable response.' : `Linear request failed (${status}).`
    return { ok: false, error, invalidKey: false }
  }

  const errors = Array.isArray(payload.errors) ? payload.errors : []
  if (errors.length > 0) {
    const parsed = graphqlErrors(errors)
    if (parsed.invalidKey) return { ok: false, error: 'invalid API key', invalidKey: true }
    return { ok: false, error: parsed.message, invalidKey: false }
  }

  if (status < 200 || status >= 300) {
    return { ok: false, error: `Linear request failed (${status}).`, invalidKey: false }
  }
  if (!('data' in payload)) return { ok: false, error: 'Linear returned no data.', invalidKey: false }
  return { ok: true, data: payload.data }
}

export async function linearGraphql(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  options: LinearClientOptions = {},
): Promise<unknown> {
  const key = apiKey.trim().replace(/^Bearer\s+/i, '').trim()
  if (key.length === 0) throw new LinearClientError('invalid API key', true, null)

  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      signal: options.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: key,
      },
      body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new LinearClientError('Could not reach api.linear.app.', false, null)
  }

  const text = await response.text()
  let payload: unknown = null
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = null
    }
  }
  const result = readLinearPayload(response.status, payload)
  if (!result.ok) throw new LinearClientError(result.error, result.invalidKey, response.status)
  return result.data
}

/** Lists teams. If `Team.parent` is rejected, the same list is loaded without parents. */
export async function listLinearTeams(apiKey: string, options: LinearClientOptions = {}): Promise<LinearTeam[]> {
  try {
    return await collectTeams(apiKey, TEAMS_QUERY, true, options)
  } catch (error) {
    if (error instanceof LinearClientError && isMissingParentField(error)) {
      return await collectTeams(apiKey, TEAMS_FLAT_QUERY, false, options)
    }
    throw error
  }
}

/** Loads workflow states and issues, then history for the issues that need it. */
export async function fetchLinearTeamBundle(
  teamId: string,
  apiKey: string,
  options: LinearClientOptions = {},
): Promise<LinearTeamBundle | null> {
  const statesPage = await collectStates(teamId, apiKey, options)
  if (statesPage === null) return null
  const issues = await collectIssues(teamId, apiKey, options)
  if (issues === null) return null
  return {
    teamId: statesPage.id,
    teamName: statesPage.name,
    states: statesPage.states,
    issues,
  }
}

async function collectTeams(
  apiKey: string,
  query: string,
  withParent: boolean,
  options: LinearClientOptions,
): Promise<LinearTeam[]> {
  const teams: LinearTeam[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await linearGraphql(apiKey, query, after === null ? {} : { after }, options)
    const connection = isRecord(data) ? connectionOf(data.teams) : emptyConnection()
    for (const node of connection.nodes) {
      const team = parseTeam(node, withParent)
      if (team) teams.push(team)
    }
    if (!connection.pageInfo.hasNextPage || connection.pageInfo.endCursor === null || connection.pageInfo.endCursor === after) {
      return teams
    }
    after = connection.pageInfo.endCursor
  }
  throw new LinearClientError('Linear returned too many pages.', false, null)
}

async function collectStates(
  teamId: string,
  apiKey: string,
  options: LinearClientOptions,
): Promise<{ id: string; name: string; states: LinearWorkflowState[] } | null> {
  const states: LinearWorkflowState[] = []
  let after: string | null = null
  let identity: { id: string; name: string } | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await linearGraphql(
      apiKey,
      TEAM_STATES_QUERY,
      after === null ? { id: teamId } : { id: teamId, after },
      options,
    )
    const team = isRecord(data) ? data.team : null
    if (team === null) return null
    if (!isRecord(team) || typeof team.id !== 'string' || typeof team.name !== 'string') return null
    identity = { id: team.id, name: team.name }
    const connection = connectionOf(team.states)
    for (const node of connection.nodes) {
      const state = parseWorkflowState(node)
      if (state) states.push(state)
    }
    if (!connection.pageInfo.hasNextPage || connection.pageInfo.endCursor === null || connection.pageInfo.endCursor === after) {
      return { id: identity.id, name: identity.name, states }
    }
    after = connection.pageInfo.endCursor
  }
  throw new LinearClientError('Linear returned too many pages.', false, null)
}

async function collectIssues(teamId: string, apiKey: string, options: LinearClientOptions): Promise<LinearIssue[] | null> {
  const updatedSince = options.updatedSince
  const completedSince = updatedSince === undefined ? options.completedSince : undefined
  let filtered = updatedSince !== undefined || completedSince !== undefined
  let parentField: ParentField = 'id'
  const issues: LinearIssue[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const variables: Record<string, unknown> = { id: teamId }
    if (after !== null) variables.after = after
    if (updatedSince !== undefined) variables.updatedSince = updatedSince
    else if (filtered && completedSince !== undefined) variables.completedSince = completedSince

    const query =
      updatedSince !== undefined ? TEAM_ISSUES_UPDATED_QUERY : filtered ? TEAM_ISSUES_QUERY : TEAM_ISSUES_UNFILTERED_QUERY

    let data: unknown
    try {
      const loaded = await loadIssuePage(apiKey, query, variables, parentField, options)
      data = loaded.data
      parentField = loaded.parentField
    } catch (error) {
      if (updatedSince !== undefined || !filtered || !isCompletedSinceFilterError(error)) throw error
      // Linear rejected `completedAt: { null: true }`. Keep the gte window on the client.
      filtered = false
      delete variables.completedSince
      const loaded = await loadIssuePage(apiKey, TEAM_ISSUES_UNFILTERED_QUERY, variables, parentField, options)
      data = loaded.data
      parentField = loaded.parentField
    }

    const team = isRecord(data) ? data.team : null
    if (team === null) return null
    if (!isRecord(team)) return null
    const connection = connectionOf(team.issues)
    for (const node of connection.nodes) {
      const issue = parseIssue(node)
      if (!issue) continue
      if (completedSince !== undefined && !issueInCompletedWindow(issue.completedAt, completedSince)) continue
      issues.push(issue)
    }
    options.onIssueCount?.(issues.length)
    if (!connection.pageInfo.hasNextPage || connection.pageInfo.endCursor === null || connection.pageInfo.endCursor === after) {
      await loadIssueHistories(issues, apiKey, options)
      return issues
    }
    after = connection.pageInfo.endCursor
  }
  throw new LinearClientError('Linear returned too many pages.', false, null)
}

type ParentField = 'id' | 'identifier'

/** `parent { id }` is the schema field. Some responses reject that selection and accept `parent { identifier }`. */
function queryWithParentField(query: string, parentField: ParentField): string {
  if (parentField === 'id') return query
  return query.replaceAll('parent { id }', 'parent { identifier }')
}

/**
 * Loads one issues page. If Linear rejects `parent { id }`, retries the same page with
 * `parent { identifier }`. A second rejection is returned to the caller.
 */
async function loadIssuePage(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  parentField: ParentField,
  options: LinearClientOptions,
): Promise<{ data: unknown; parentField: ParentField }> {
  try {
    return { data: await linearGraphql(apiKey, queryWithParentField(query, parentField), variables, options), parentField }
  } catch (error) {
    if (parentField === 'id' && error instanceof LinearClientError && isMissingParentField(error)) {
      return {
        data: await linearGraphql(apiKey, queryWithParentField(query, 'identifier'), variables, options),
        parentField: 'identifier',
      }
    }
    throw error
  }
}

/**
 * Parent id by issue identifier for one team. Uses the completion window when `completedSince`
 * is set, so a delta refresh can stamp sub-issues that did not change.
 */
export async function fetchLinearIssueParents(
  teamId: string,
  apiKey: string,
  options: LinearClientOptions = {},
): Promise<Map<string, string | null>> {
  const parents = new Map<string, string | null>()
  let after: string | null = null
  let filtered = options.completedSince !== undefined
  let parentField: ParentField = 'id'
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const variables: Record<string, unknown> = { id: teamId }
    if (after !== null) variables.after = after
    if (filtered && options.completedSince !== undefined) variables.completedSince = options.completedSince
    const query = filtered ? ISSUE_PARENTS_QUERY : ISSUE_PARENTS_UNFILTERED_QUERY
    let data: unknown
    try {
      const loaded = await loadIssuePage(apiKey, query, variables, parentField, options)
      data = loaded.data
      parentField = loaded.parentField
    } catch (error) {
      if (!filtered || !isCompletedSinceFilterError(error)) throw error
      filtered = false
      delete variables.completedSince
      const loaded = await loadIssuePage(apiKey, ISSUE_PARENTS_UNFILTERED_QUERY, variables, parentField, options)
      data = loaded.data
      parentField = loaded.parentField
    }
    const team = isRecord(data) ? data.team : null
    if (team === null) return parents
    if (!isRecord(team)) return parents
    const connection = connectionOf(team.issues)
    for (const node of connection.nodes) {
      if (!isRecord(node) || typeof node.identifier !== 'string') continue
      const identifier = node.identifier.trim()
      if (identifier.length === 0) continue
      const completedAt = typeof node.completedAt === 'string' ? node.completedAt : null
      if (options.completedSince !== undefined && !issueInCompletedWindow(completedAt, options.completedSince)) continue
      parents.set(identifier, parseParentId(node.parent))
    }
    if (!connection.pageInfo.hasNextPage || connection.pageInfo.endCursor === null || connection.pageInfo.endCursor === after) {
      return parents
    }
    after = connection.pageInfo.endCursor
  }
  throw new LinearClientError('Linear returned too many pages.', false, null)
}

function isCompletedSinceFilterError(error: unknown): boolean {
  if (!(error instanceof LinearClientError) || error.invalidKey) return false
  return /completedAt|completedSince|DateTimeOrDuration|DateComparator|Unknown type/i.test(error.message)
}

/**
 * History stays a separate query (`$id: String!`). Canceled, duplicate, and triage issues
 * are left with an empty history, and the rest are loaded `HISTORY_CONCURRENCY` at a time.
 * `onIssueCount` during this phase is how many issues have a resolved history step.
 */
async function loadIssueHistories(issues: LinearIssue[], apiKey: string, options: LinearClientOptions): Promise<void> {
  const pending: LinearIssue[] = []
  for (const issue of issues) {
    if (isIgnoredIssue(issue)) continue
    pending.push(issue)
  }
  if (pending.length === 0) return

  let finished = issues.length - pending.length
  await mapWithConcurrency(pending, HISTORY_CONCURRENCY, async (issue) => {
    issue.history = await fetchIssueHistory(issue.id, apiKey, options)
    finished += 1
    options.onIssueCount?.(finished)
  })
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let next = 0
  let failure: unknown = null
  const worker = async () => {
    while (failure === null && next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) return
      try {
        await task(item)
      } catch (error) {
        if (failure === null) failure = error
        return
      }
    }
  }
  const workers = Math.min(Math.max(concurrency, 1), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  if (failure !== null) throw failure
}

/** Pages `ISSUE_HISTORY_QUERY` from the first page. The team issues query does not include history. */
async function fetchIssueHistory(
  issueId: string,
  apiKey: string,
  options: LinearClientOptions,
): Promise<LinearHistoryEntry[]> {
  const entries: LinearHistoryEntry[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await linearGraphql(
      apiKey,
      ISSUE_HISTORY_QUERY,
      after === null ? { id: issueId } : { id: issueId, after },
      options,
    )
    const issue = isRecord(data) ? data.issue : null
    if (!isRecord(issue)) return entries
    const connection = connectionOf(issue.history)
    for (const node of connection.nodes) {
      const entry = parseHistory(node)
      if (entry) entries.push(entry)
    }
    if (!connection.pageInfo.hasNextPage || connection.pageInfo.endCursor === null || connection.pageInfo.endCursor === after) {
      return entries
    }
    after = connection.pageInfo.endCursor
  }
  return entries
}

function isMissingParentField(error: LinearClientError): boolean {
  return !error.invalidKey && /parent/i.test(error.message)
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface Connection {
  nodes: unknown[]
  pageInfo: PageInfo
}

function emptyConnection(): Connection {
  return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
}

function connectionOf(value: unknown): Connection {
  if (!isRecord(value)) return emptyConnection()
  return {
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
    pageInfo: readPageInfo(value.pageInfo),
  }
}

function readPageInfo(value: unknown): PageInfo {
  if (!isRecord(value)) return { hasNextPage: false, endCursor: null }
  const endCursor = typeof value.endCursor === 'string' && value.endCursor.length > 0 ? value.endCursor : null
  return { hasNextPage: value.hasNextPage === true && endCursor !== null, endCursor }
}

function parseTeam(value: unknown, withParent: boolean): LinearTeam | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  const parent = withParent && isRecord(value.parent) ? value.parent : null
  const parentId = parent && typeof parent.id === 'string' ? parent.id : null
  const parentName = parent && typeof parent.name === 'string' ? parent.name : null
  return { id: value.id, name: value.name, parentId, parentName }
}

function parseWorkflowState(value: unknown): LinearWorkflowState | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  const position = typeof value.position === 'number' && Number.isFinite(value.position) ? value.position : 0
  return {
    id: value.id,
    name: value.name,
    type: typeof value.type === 'string' ? value.type : '',
    position,
  }
}

function parseIssue(value: unknown): LinearIssue | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  // The team issues query omits history. A missing connection is empty.
  const history = connectionOf(value.history)
  const entries: LinearHistoryEntry[] = []
  for (const node of history.nodes) {
    const entry = parseHistory(node)
    if (entry) entries.push(entry)
  }
  return {
    id: value.id,
    identifier: typeof value.identifier === 'string' ? value.identifier : '',
    url: typeof value.url === 'string' ? value.url : '',
    title: typeof value.title === 'string' ? value.title : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    canceledAt: typeof value.canceledAt === 'string' ? value.canceledAt : null,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    priorityLabel: typeof value.priorityLabel === 'string' ? value.priorityLabel : '',
    state: parseIssueState(value.state),
    assignee: parseAssignee(value.assignee),
    project: parseProject(value.project),
    labels: parseLabels(value.labels),
    team: parseIssueTeam(value.team),
    parentId: parseParentId(value.parent),
    history: entries,
  }
}

function parseParentId(value: unknown): string | null {
  if (typeof value === 'string') {
    const id = value.trim()
    return id.length > 0 ? id : null
  }
  if (!isRecord(value)) return null
  const raw = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : value.identifier
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return id.length > 0 ? id : null
}

function parseHistory(value: unknown): LinearHistoryEntry | null {
  if (!isRecord(value) || typeof value.createdAt !== 'string') return null
  return {
    createdAt: value.createdAt,
    fromState: parseStateRef(value.fromState),
    toState: parseStateRef(value.toState),
  }
}

function parseStateRef(value: unknown): LinearStateRef | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return { id: value.id, name: typeof value.name === 'string' ? value.name : '' }
}

function parseIssueState(value: unknown): LinearIssue['state'] {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : '',
    type: typeof value.type === 'string' ? value.type : '',
  }
}

function parseAssignee(value: unknown): LinearIssue['assignee'] {
  if (!isRecord(value) || typeof value.displayName !== 'string') return null
  return { displayName: value.displayName }
}

function parseProject(value: unknown): LinearIssue['project'] {
  if (!isRecord(value) || typeof value.name !== 'string') return null
  return { name: value.name }
}

function parseIssueTeam(value: unknown): LinearIssue['team'] {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return { id: value.id, name: typeof value.name === 'string' ? value.name : '' }
}

function parseLabels(value: unknown): string[] {
  const names: string[] = []
  for (const node of connectionOf(value).nodes) {
    if (!isRecord(node) || typeof node.name !== 'string') continue
    const name = node.name.trim()
    if (name.length > 0) names.push(name)
  }
  return names
}

function graphqlErrors(errors: readonly unknown[]): { message: string; invalidKey: boolean } {
  const messages: string[] = []
  let invalidKey = false
  for (const error of errors) {
    if (!isRecord(error)) continue
    if (typeof error.message === 'string' && error.message.trim().length > 0) messages.push(error.message.trim())
    const extensions = isRecord(error.extensions) ? error.extensions : null
    if (extensions && extensions.code === 'AUTHENTICATION_ERROR') invalidKey = true
  }
  return { message: messages.join(' ') || 'Linear request failed.', invalidKey }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
