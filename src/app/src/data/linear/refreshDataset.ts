import type { Dataset, WorkItem } from '../../domain/types.ts'
import { fetchLinearIssueParents } from './client.ts'
import { exportLinearTeam, type ExportLinearTeamOptions } from './exportTeam.ts'
import type { MapLinearResult } from './mapToDataset.ts'
import { mergeDatasets } from './mergeDatasets.ts'
import { completedSinceIso, defaultLinearSince } from './since.ts'

export type RefreshLinearResult =
  | { ok: true; dataset: Dataset }
  | { ok: false; error: string; canceled?: boolean }

/**
 * Incremental refresh for one Linear snapshot.
 * A saved `fetchedAt` queries issues updated after that instant. The next watermark
 * is the time this query starts, and it is stored only after the export merges.
 * With no fetch time, one refresh uses the completion window (`linearClosedThrough`,
 * then `linearSince`, then the default since day) and then stores `fetchedAt`.
 */
export async function refreshLinearDataset(
  base: Dataset,
  options: {
    apiKey: string
    signal?: AbortSignal
    now?: Date
    exportTeam?: (options: ExportLinearTeamOptions) => Promise<MapLinearResult>
    /** Parent id by issue identifier. The default reads Linear. Tests can supply a map. */
    loadParents?: (teamId: string, completedSince: string | undefined) => Promise<ReadonlyMap<string, string | null>>
  },
): Promise<RefreshLinearResult> {
  if (options.signal?.aborted) return { ok: false, error: 'canceled', canceled: true }
  const teamId = base.metadata.linearTeamId?.trim()
  if (!teamId) return { ok: false, error: 'missing-team' }

  const startedAt = options.now ?? new Date()
  const updatedSince = updatedSinceInstant(base.metadata.fetchedAt)
  const exportTeam = options.exportTeam ?? exportLinearTeam
  const request: ExportLinearTeamOptions = {
    apiKey: options.apiKey,
    teamId,
    since: refreshSince(base, updatedSince, startedAt),
    mode: 'incremental',
    signal: options.signal,
    fetchedAt: startedAt,
  }
  if (updatedSince !== null) request.updatedSince = updatedSince

  const result = await exportTeam(request)
  if (options.signal?.aborted) return { ok: false, error: 'canceled', canceled: true }
  if (!result.ok) {
    if (result.error === 'canceled') return { ok: false, error: 'canceled', canceled: true }
    return { ok: false, error: result.error }
  }
  const merged = mergeDatasets(base, result.dataset, { dropIds: result.ignoredIds })
  const sinceDay = base.metadata.linearClosedThrough ?? base.metadata.linearSince
  const completedSince = sinceDay === undefined ? undefined : (completedSinceIso(sinceDay) ?? undefined)
  const loadParents =
    options.loadParents ??
    ((id, since) =>
      fetchLinearIssueParents(id, options.apiKey, { signal: options.signal, completedSince: since }))
  const parents = await loadParents(teamId, completedSince)
  return { ok: true, dataset: applyParentIds(merged, parents) }
}

/** Writes parent ids from a Linear parent pass onto saved rows, including rows the delta did not return. */
export function applyParentIds(dataset: Dataset, parents: ReadonlyMap<string, string | null>): Dataset {
  if (parents.size === 0) return dataset
  return {
    ...dataset,
    items: dataset.items.map((item) => withParentId(item, parents)),
  }
}

function withParentId(item: WorkItem, parents: ReadonlyMap<string, string | null>): WorkItem {
  if (!parents.has(item.id)) return item
  const parentId = parents.get(item.id)
  if (parentId === null || parentId === undefined || parentId.trim().length === 0) {
    if (item.parentId === undefined) return item
    const next = { ...item }
    delete next.parentId
    return next
  }
  const trimmed = parentId.trim()
  if (item.parentId === trimmed) return item
  return { ...item, parentId: trimmed }
}

/** Closed-through day for display. It is the query window only when there is no fetch time. */
function refreshSince(base: Dataset, updatedSince: string | null, now: Date): string | undefined {
  const floor = base.metadata.linearClosedThrough ?? base.metadata.linearSince
  if (floor !== undefined) return floor
  if (updatedSince === null) return defaultLinearSince(now)
  return undefined
}

/** ISO instant used as `updatedAt: { gt }`. Unparseable values count as missing. */
function updatedSinceInstant(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  return new Date(time).toISOString()
}
