import type { Dataset, SourceKind } from '../domain/types.ts'

/** `example`, a Linear team, or a slug of an imported file name. */
export type SourceId = 'example' | `linear:${string}` | `file:${string}`

const MAX_TEAM_ID_CHARS = 80
const MAX_SLUG_CHARS = 80

export function sourceKindFromId(id: SourceId): SourceKind {
  if (id === 'example') return 'example'
  if (id.startsWith('linear:')) return 'linear'
  return 'file'
}

export function linearTeamIdFromSourceId(id: SourceId): string | undefined {
  if (!id.startsWith('linear:')) return undefined
  const teamId = id.slice('linear:'.length)
  return teamId.length > 0 ? teamId : undefined
}

/** Lowercase file name without the extension, safe to store after `file:`. */
export function slugSourceName(name: string): string {
  const withoutExtension = name.trim().replace(/\.[a-z0-9]{1,8}$/i, '')
  let slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length > MAX_SLUG_CHARS) slug = slug.slice(0, MAX_SLUG_CHARS).replace(/-+$/g, '')
  return slug.length > 0 ? slug : 'import'
}

export function sourceIdFromDataset(dataset: Dataset): SourceId | null {
  const kind = dataset.metadata.sourceKind
  if (kind === 'example' || (kind === undefined && dataset.metadata.sourceName === 'Example Data')) return 'example'
  if (kind === 'linear') {
    const teamId = dataset.metadata.linearTeamId?.trim().slice(0, MAX_TEAM_ID_CHARS) ?? ''
    if (teamId.length === 0 || /\s/.test(teamId)) return null
    return `linear:${teamId}`
  }
  return `file:${slugSourceName(dataset.metadata.sourceName)}`
}

export function parseSourceId(value: unknown): SourceId | undefined {
  if (value === 'example') return 'example'
  if (typeof value !== 'string') return undefined
  if (value.startsWith('linear:')) {
    const teamId = value.slice('linear:'.length).trim()
    if (teamId.length === 0 || teamId.length > MAX_TEAM_ID_CHARS || /\s/.test(teamId)) return undefined
    return `linear:${teamId}`
  }
  if (value.startsWith('file:')) {
    const slug = value.slice('file:'.length)
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return undefined
    return `file:${slug}`
  }
  return undefined
}
