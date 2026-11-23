import type { Dataset, DatasetMetadata, StageRole, WorkItem } from '../../domain/types.ts'
import { formatIsoDate, parseIsoDate } from '../isoDate.ts'
import { linearClosedThrough } from './since.ts'
import type { LinearHistoryEntry, LinearIssue, LinearTeamBundle, LinearWorkflowState } from './types.ts'

export const LINEAR_ATTRIBUTE_COLUMNS = ['State', 'Assignee', 'Priority', 'Project', 'Labels', 'Team'] as const

const SKIPPED_STATE_TYPES = new Set(['canceled', 'cancelled', 'duplicate', 'triage'])

/** Board order. Anything outside this list sorts after `completed`. */
const LINEAR_TYPE_RANK: Record<string, number> = {
  backlog: 0,
  unstarted: 1,
  started: 2,
  completed: 3,
}

export interface MapLinearOptions {
  fetchedAt?: Date
  /** `YYYY-MM-DD` lower bound. Stored on a full import; an incremental refresh keeps the previous value. */
  since?: string
  mode?: 'full' | 'incremental'
}

export type MapLinearResult =
  | { ok: true; dataset: Dataset; ignoredIds: string[] }
  | { ok: false; error: string }

interface PlannedStage {
  id: string
  name: string
  type: string
  role: StageRole
}

/**
 * Workflow states follow Linear board order: type rank, then position within that type.
 * Canceled, duplicate, and triage types are omitted.
 * Every backlog state uses the backlog role, so cycle time starts at the first
 * commitment stage. If that leaves fewer than two workflow stages, the first non-completed
 * state is counted as workflow. Fewer than two remaining stages is an error.
 */
export function mapLinearTeamToDataset(bundle: LinearTeamBundle, options: MapLinearOptions = {}): MapLinearResult {
  const plan = planStages(bundle.states)
  if (plan === null) {
    return {
      ok: false,
      error:
        'This Linear team needs at least two workflow stages. Canceled, duplicate, and triage states are skipped, and one remaining stage is not enough.',
    }
  }

  const teamName = bundle.teamName.trim() || bundle.teamId
  const warnings: string[] = []
  if (plan.promoted) {
    warnings.push(
      'The first non-completed state was counted as a workflow stage because the team would otherwise have fewer than two.',
    )
  }

  const items: WorkItem[] = []
  const ignoredIds: string[] = []
  const completedAts: (string | null)[] = []
  let skipped = 0
  for (const issue of bundle.issues) {
    const identifier = issue.identifier.trim()
    if (isIgnoredIssue(issue)) {
      if (identifier.length > 0) ignoredIds.push(identifier)
      continue
    }
    if (identifier.length === 0) {
      skipped += 1
      continue
    }
    completedAts.push(issue.completedAt)
    items.push(toWorkItem(issue, identifier, plan.stages, teamName))
  }

  if (skipped === 1) warnings.push('Skipped 1 issue with no identifier.')
  else if (skipped > 1) warnings.push(`Skipped ${skipped} issues with no identifier.`)

  const metadata: DatasetMetadata = {
    sourceName: `Linear · ${teamName}`,
    sourceKind: 'linear',
    linearTeamId: bundle.teamId,
    linearTeamName: teamName,
    fetchedAt: (options.fetchedAt ?? new Date()).toISOString(),
    idColumn: 'ID',
    linkColumn: 'Link',
    titleColumn: 'Title',
    stages: plan.stages.map((stage) => ({ name: stage.name, role: stage.role })),
    attributeColumns: [...LINEAR_ATTRIBUTE_COLUMNS],
    dateOrder: 'ymd',
  }
  const sinceDay = options.since === undefined ? null : parseIsoDate(options.since)
  if (sinceDay !== null) {
    const since = formatIsoDate(sinceDay)
    metadata.linearClosedThrough = linearClosedThrough(completedAts, since)
    if (options.mode !== 'incremental') metadata.linearSince = since
  }

  return { ok: true, dataset: { metadata, items, warnings }, ignoredIds }
}

function planStages(states: readonly LinearWorkflowState[]): { stages: PlannedStage[]; promoted: boolean } | null {
  const usable = states
    .filter((state) => !SKIPPED_STATE_TYPES.has(normalizeType(state.type)))
    .map((state) => ({ ...state, type: normalizeType(state.type) }))
    .sort(compareWorkflowStates)

  const usedNames = new Set<string>()
  const stages: PlannedStage[] = usable.map((state) => {
    const role: StageRole = state.type === 'backlog' ? 'backlog' : 'workflow'
    return {
      id: state.id,
      name: uniqueStageName(state.name.trim() || state.id, usedNames),
      type: state.type,
      role,
    }
  })

  let promoted = false
  if (countWorkflow(stages) < 2) {
    const index = stages.findIndex((stage) => stage.type !== 'completed')
    const stage = index >= 0 ? stages[index] : undefined
    if (stage && stage.role !== 'workflow') {
      stages[index] = { ...stage, role: 'workflow' }
      promoted = true
    }
  }

  if (countWorkflow(stages) < 2) return null
  return { stages, promoted }
}

function toWorkItem(issue: LinearIssue, identifier: string, stages: readonly PlannedStage[], teamName: string): WorkItem {
  const link = issue.url.trim()
  const title = issue.title.trim()
  const item: WorkItem = {
    id: identifier,
    link: link.length > 0 ? link : undefined,
    title: title.length > 0 ? title : undefined,
    stageDates: stageDatesFor(issue, stages),
    blockedDays: 0,
    attributes: {
      State: issue.state?.name ?? '',
      Assignee: issue.assignee?.displayName ?? '',
      Priority: issue.priorityLabel,
      Project: issue.project?.name ?? '',
      Labels: toMultiAttribute(issue.labels),
      Team: issue.team?.name.trim() || teamName,
    },
  }
  if (issue.parentId !== null && issue.parentId.length > 0) item.parentId = issue.parentId
  return item
}

/**
 * The first transition into a state wins. The state an issue was created in is dated `createdAt`.
 * With no state history, backlog uses `createdAt`, the started state uses `startedAt`,
 * and the completed state uses `completedAt`. Those timestamps also fill a stage history never entered.
 */
function stageDatesFor(issue: LinearIssue, stages: readonly PlannedStage[]): (Date | null)[] {
  const entered = new Map<string, Date>()
  const transitions = issue.history
    .filter((entry) => entry.fromState !== null || entry.toState !== null)
    .map((entry) => ({ entry, at: parseIsoDate(entry.createdAt) }))
    .filter((row): row is { entry: LinearHistoryEntry; at: Date } => row.at !== null)
    .sort((left, right) => left.at.getTime() - right.at.getTime())

  for (const row of transitions) {
    const toId = row.entry.toState?.id
    if (toId === undefined || entered.has(toId)) continue
    entered.set(toId, row.at)
  }

  const created = parseIsoDate(issue.createdAt)
  const earliest = transitions[0]
  if (earliest?.entry.fromState && created && !entered.has(earliest.entry.fromState.id)) {
    entered.set(earliest.entry.fromState.id, created)
  }

  if (transitions.length === 0 && created) {
    for (const stage of stages) {
      if (stage.type === 'backlog') entered.set(stage.id, created)
    }
  }

  const started = issue.startedAt === null ? null : parseIsoDate(issue.startedAt)
  if (started) {
    const current = stages.find((stage) => stage.id === issue.state?.id)
    const currentIsActive =
      current !== undefined && (current.type === 'started' || current.type === 'unstarted') && !entered.has(current.id)
    const target = currentIsActive ? current : stages.find((stage) => stage.type === 'started' && !entered.has(stage.id))
    if (target) entered.set(target.id, started)
  }

  const completed = issue.completedAt === null ? null : parseIsoDate(issue.completedAt)
  if (completed) {
    const current = stages.find((stage) => stage.id === issue.state?.id)
    const currentIsDone = current !== undefined && current.type === 'completed' && !entered.has(current.id)
    const target = currentIsDone
      ? current
      : [...stages].reverse().find((stage) => stage.type === 'completed' && !entered.has(stage.id))
    if (target) entered.set(target.id, completed)
  }

  if (transitions.length === 0 && created) {
    const current = stages.find((stage) => stage.id === issue.state?.id)
    if (current && !entered.has(current.id)) entered.set(current.id, created)
  }

  return stages.map((stage) => entered.get(stage.id) ?? null)
}

/** Canceled, duplicate, and triage issues never enter a dataset. */
export function isIgnoredIssue(issue: LinearIssue): boolean {
  if (issue.canceledAt !== null && issue.canceledAt.trim().length > 0) return true
  const type = issue.state ? normalizeType(issue.state.type) : ''
  return SKIPPED_STATE_TYPES.has(type)
}

/**
 * Linear `position` restarts inside each state type. Board order is type rank, then that position.
 */
function compareWorkflowStates(left: LinearWorkflowState, right: LinearWorkflowState): number {
  return (
    linearTypeRank(left.type) - linearTypeRank(right.type) ||
    left.position - right.position ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

function linearTypeRank(type: string): number {
  return LINEAR_TYPE_RANK[type] ?? LINEAR_TYPE_RANK.completed + 1
}

function countWorkflow(stages: readonly PlannedStage[]): number {
  return stages.filter((stage) => stage.role === 'workflow').length
}

function uniqueStageName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  let suffix = 2
  let next = `${name} (${suffix})`
  while (used.has(next)) {
    suffix += 1
    next = `${name} (${suffix})`
  }
  used.add(next)
  return next
}

function normalizeType(type: string): string {
  return type.trim().toLowerCase()
}

/** Bracket form so each label is a distinct filter choice. Empty input stays empty. */
function toMultiAttribute(values: readonly string[]): string {
  const parts = values.map((value) => value.trim()).filter((value) => value.length > 0)
  if (parts.length === 0) return ''
  return `[${parts.join('|')}]`
}
