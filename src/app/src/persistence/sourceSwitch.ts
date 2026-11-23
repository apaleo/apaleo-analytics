import type { Dataset } from '../domain/types.ts'
import { type SourceId, sourceKindFromId } from './sourceId.ts'

export type SourceSwitchOutcome =
  | { status: 'canceled' }
  | { status: 'missing' }
  | { status: 'loaded'; dataset: Dataset }
  | { status: 'refreshed'; dataset: Dataset }
  | { status: 'refresh-failed'; dataset: Dataset; error: string; canceled: boolean }

type RefreshOutcome = { ok: true; dataset: Dataset } | { ok: false; error: string; canceled?: boolean }

/**
 * Load one stored source. Linear snapshots then run the shared incremental refresh.
 * Example and file snapshots stop after the load.
 */
export async function loadSourceSelection(
  id: SourceId,
  deps: {
    read: (id: SourceId) => Promise<Dataset | null>
    loadExample: () => Dataset
    refreshLinear?: (dataset: Dataset) => Promise<RefreshOutcome>
    onLoaded?: (dataset: Dataset) => void
    signal?: AbortSignal
  },
): Promise<SourceSwitchOutcome> {
  if (deps.signal?.aborted) return { status: 'canceled' }
  const loaded = await readSelection(id, deps)
  if (deps.signal?.aborted) return { status: 'canceled' }
  if (loaded === null) return { status: 'missing' }
  deps.onLoaded?.(loaded)
  if (loaded.metadata.sourceKind !== 'linear' || deps.refreshLinear === undefined) {
    return { status: 'loaded', dataset: loaded }
  }
  const refreshed = await deps.refreshLinear(loaded)
  if (refreshed.ok) return { status: 'refreshed', dataset: refreshed.dataset }
  return {
    status: 'refresh-failed',
    dataset: loaded,
    error: refreshed.error,
    canceled: refreshed.canceled === true || refreshed.error === 'canceled',
  }
}

async function readSelection(
  id: SourceId,
  deps: { read: (id: SourceId) => Promise<Dataset | null>; loadExample: () => Dataset },
): Promise<Dataset | null> {
  if (id === 'example') return asExample((await deps.read('example')) ?? deps.loadExample())
  const stored = await deps.read(id)
  if (stored === null) return null
  return alignDataset(id, stored)
}

function asExample(dataset: Dataset): Dataset {
  const metadata: Dataset['metadata'] = {
    ...dataset.metadata,
    sourceKind: 'example',
    sourceName: dataset.metadata.sourceName.length > 0 ? dataset.metadata.sourceName : 'Example Data',
  }
  delete metadata.linearTeamId
  delete metadata.linearTeamName
  delete metadata.fetchedAt
  delete metadata.linearSince
  delete metadata.linearClosedThrough
  return { ...dataset, metadata }
}

function alignDataset(id: SourceId, dataset: Dataset): Dataset {
  if (id === 'example') return asExample(dataset)
  if (sourceKindFromId(id) === 'linear') {
    return {
      ...dataset,
      metadata: {
        ...dataset.metadata,
        sourceKind: 'linear',
        linearTeamId: id.slice('linear:'.length),
      },
    }
  }
  const metadata: Dataset['metadata'] = { ...dataset.metadata, sourceKind: 'file' }
  delete metadata.linearTeamId
  delete metadata.linearTeamName
  delete metadata.fetchedAt
  delete metadata.linearSince
  delete metadata.linearClosedThrough
  return { ...dataset, metadata }
}
