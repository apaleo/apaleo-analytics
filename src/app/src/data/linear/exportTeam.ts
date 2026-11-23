import { fetchLinearTeamBundle, linearClientMessage, type LinearClientOptions } from './client.ts'
import { mapLinearTeamToDataset, type MapLinearResult } from './mapToDataset.ts'
import { completedSinceIso } from './since.ts'

export interface ExportLinearTeamOptions extends LinearClientOptions {
  apiKey: string
  teamId: string
  fetchedAt?: Date
  /**
   * `YYYY-MM-DD`. On a full import this is the completion window.
   * On a delta refresh it only updates the closed-through display day.
   */
  since?: string
  mode?: 'full' | 'incremental'
}

export async function exportLinearTeam(options: ExportLinearTeamOptions): Promise<MapLinearResult> {
  let completedSince: string | undefined
  if (options.updatedSince === undefined && options.since !== undefined) {
    const iso = completedSinceIso(options.since)
    if (iso === null) return { ok: false, error: 'Choose a valid since date.' }
    completedSince = iso
  }

  // Stamp before paging so the next delta overlaps work that lands while this export runs.
  const fetchedAt = options.fetchedAt ?? new Date()

  try {
    const bundle = await fetchLinearTeamBundle(options.teamId, options.apiKey, {
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      onIssueCount: options.onIssueCount,
      completedSince,
      updatedSince: options.updatedSince,
    })
    if (bundle === null) return { ok: false, error: 'That Linear team could not be found.' }
    return mapLinearTeamToDataset(bundle, {
      fetchedAt,
      since: options.since,
      mode: options.mode,
    })
  } catch (error) {
    return { ok: false, error: linearClientMessage(error) }
  }
}
