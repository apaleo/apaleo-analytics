import { formatIsoDate, parseIsoDate } from '../data/isoDate.ts'
import type { SourceKind } from '../domain/types.ts'
import { CHARTS, type ChartId } from '../ui/charts.ts'
import type { ThemeName } from '../ui/theme.tsx'
import { type SourceId, linearTeamIdFromSourceId, parseSourceId, sourceKindFromId } from './sourceId.ts'

/** Names, timestamps, the active source id, and a Linear team pointer. Issue payloads are not stored. */
export const PREFERENCES_KEY = 'twig.analytics.prefs'

export const MAX_RECENT_FILES = 8
export const MAX_PREFERENCE_CHARS = 8192

const MAX_NAME_CHARS = 180

export const SCATTER_TREND_PERCENTILES = [50, 70, 85, 95] as const
export type ScatterTrendPercentile = (typeof SCATTER_TREND_PERCENTILES)[number]
export const DEFAULT_SCATTER_TREND_PERCENTILE: ScatterTrendPercentile = 85
export const DEFAULT_SCATTER_TREND_INTERVAL = 10

export function isScatterTrendPercentile(value: number): value is ScatterTrendPercentile {
  return value === 50 || value === 70 || value === 85 || value === 95
}

/** Cumulative flow window. Missing and unknown values mean all time. */
export const CFD_TIME_RANGES = ['1m', '3m', '6m', '1y', 'all'] as const
export type CfdTimeRange = (typeof CFD_TIME_RANGES)[number]

export function isCfdTimeRange(value: unknown): value is CfdTimeRange {
  return typeof value === 'string' && (CFD_TIME_RANGES as readonly string[]).includes(value)
}

export interface RecentFile {
  name: string
  importedAt: string
}

export interface Preferences {
  theme?: ThemeName
  chartId?: ChartId
  recentFiles: readonly RecentFile[]
  /** Library entry to open on the next visit. Wins over `sourceKind` when both are set. */
  activeSourceId?: SourceId
  sourceKind?: SourceKind
  /** Linear team to refresh. No issue payload. */
  linearTeamId?: string
  linearFetchedAt?: string
  /** `YYYY-MM-DD` watermark. The snapshot remains the source of truth. */
  linearClosedThrough?: string
  /** Cycle time scatterplot trend. Missing values use off / 85 / 10. */
  scatterShowTrend?: boolean
  scatterTrendPercentile?: ScatterTrendPercentile
  scatterTrendInterval?: number
  /** Cumulative flow window. Missing or unknown values mean all time. */
  cfdTimeRange?: CfdTimeRange
  /** Workflow counts include sub-issues when true. Missing means off. */
  includeSubIssues?: boolean
}

interface PreferencePatch {
  theme?: ThemeName
  chartId?: ChartId
  recentFiles?: readonly RecentFile[]
  /** `null` clears the saved source. */
  activeSourceId?: SourceId | null
  sourceKind?: SourceKind | null
  linearTeamId?: string | null
  linearFetchedAt?: string | null
  linearClosedThrough?: string | null
  scatterShowTrend?: boolean
  scatterTrendPercentile?: ScatterTrendPercentile
  scatterTrendInterval?: number
  cfdTimeRange?: CfdTimeRange
  includeSubIssues?: boolean
}

const CHART_IDS = new Set<string>(CHARTS.map((chart) => chart.id))

export function readPreferences(storage: Storage | null = browserStorage()): Preferences {
  if (storage === null) return { recentFiles: [] }
  try {
    const raw = storage.getItem(PREFERENCES_KEY)
    if (raw === null || raw.length === 0) return { recentFiles: [] }
    return normalizePreferences(JSON.parse(raw) as unknown)
  } catch {
    return { recentFiles: [] }
  }
}

export function updatePreferences(patch: PreferencePatch, storage: Storage | null = browserStorage()): Preferences {
  const current = readPreferences(storage)
  const activeSourceId = resolveActiveSourceId(patch, current)
  const sourceKind = activeSourceId ? sourceKindFromId(activeSourceId) : resolveSourceKind(patch, current)
  const keepLinear = sourceKind === 'linear'
  const linearTeamId = keepLinear ? linearTeamFor(activeSourceId, patch, current) : undefined
  const next = fitPreferences({
    theme: patch.theme ?? current.theme,
    chartId: patch.chartId ?? current.chartId,
    recentFiles: patch.recentFiles ?? current.recentFiles,
    activeSourceId,
    sourceKind,
    linearTeamId,
    linearFetchedAt: keepLinear ? cleared(patch.linearFetchedAt, current.linearFetchedAt) : undefined,
    linearClosedThrough: keepLinear ? cleared(patch.linearClosedThrough, current.linearClosedThrough) : undefined,
    scatterShowTrend: patch.scatterShowTrend ?? current.scatterShowTrend,
    scatterTrendPercentile: patch.scatterTrendPercentile ?? current.scatterTrendPercentile,
    scatterTrendInterval: resolveTrendInterval(patch.scatterTrendInterval, current.scatterTrendInterval),
    cfdTimeRange: patch.cfdTimeRange ?? current.cfdTimeRange,
    includeSubIssues: patch.includeSubIssues ?? current.includeSubIssues,
  })
  writeRaw(next, storage)
  return next
}

function resolveActiveSourceId(patch: PreferencePatch, current: Preferences): SourceId | undefined {
  if (patch.activeSourceId === null) return undefined
  if (patch.activeSourceId !== undefined) return parseSourceId(patch.activeSourceId) ?? current.activeSourceId
  if (patch.sourceKind === null) return undefined
  if (patch.sourceKind === 'example') return 'example'
  if (patch.sourceKind === 'file') {
    return current.activeSourceId && sourceKindFromId(current.activeSourceId) === 'file' ? current.activeSourceId : undefined
  }
  if (patch.sourceKind === 'linear' || (patch.linearTeamId && current.sourceKind === 'linear')) {
    const team = teamFromPatch(patch, current)
    if (team) return `linear:${team}`
    if (current.activeSourceId && sourceKindFromId(current.activeSourceId) === 'linear') return current.activeSourceId
    return undefined
  }
  return current.activeSourceId
}

function resolveSourceKind(patch: PreferencePatch, current: Preferences): SourceKind | undefined {
  if (patch.sourceKind === null) return undefined
  return patch.sourceKind ?? current.sourceKind
}

function linearTeamFor(
  activeSourceId: SourceId | undefined,
  patch: PreferencePatch,
  current: Preferences,
): string | undefined {
  return linearTeamIdFromSourceId(activeSourceId ?? 'example') ?? teamFromPatch(patch, current)
}

function teamFromPatch(patch: PreferencePatch, current: Preferences): string | undefined {
  if (patch.linearTeamId === null) return undefined
  const raw = patch.linearTeamId ?? current.linearTeamId
  const team = raw?.trim().slice(0, 80)
  return team && team.length > 0 && !/\s/.test(team) ? team : undefined
}

function cleared(patchValue: string | null | undefined, current: string | undefined): string | undefined {
  if (patchValue === null) return undefined
  if (patchValue === undefined) return current
  return patchValue
}

export function rememberRecentFile(
  name: string,
  importedAt = new Date(),
  storage: Storage | null = browserStorage(),
): readonly RecentFile[] {
  const current = readPreferences(storage)
  const clipped = name.trim().slice(0, MAX_NAME_CHARS)
  if (clipped.length === 0) return current.recentFiles
  const entry: RecentFile = { name: clipped, importedAt: importedAt.toISOString() }
  const recentFiles = [entry, ...current.recentFiles.filter((file) => file.name !== entry.name)].slice(
    0,
    MAX_RECENT_FILES,
  )
  return updatePreferences({ recentFiles }, storage).recentFiles
}

/** Drops the oldest names until the saved JSON fits in `maxChars`. */
export function fitPreferences(prefs: Preferences, maxChars = MAX_PREFERENCE_CHARS): Preferences {
  let next = shapedPreferences(prefs)
  while (JSON.stringify(storedShape(next)).length > maxChars && next.recentFiles.length > 0) {
    next = { ...next, recentFiles: next.recentFiles.slice(0, -1) }
  }
  if (JSON.stringify(storedShape(next)).length > maxChars) {
    next = shapedPreferences({ ...next, recentFiles: [] })
  }
  return next
}

function shapedPreferences(prefs: Preferences): Preferences {
  const next: Preferences = {
    recentFiles: prefs.recentFiles.slice(0, MAX_RECENT_FILES).map((file) => ({
      name: file.name.slice(0, MAX_NAME_CHARS),
      importedAt: file.importedAt,
    })),
  }
  if (prefs.theme !== undefined) next.theme = prefs.theme
  if (prefs.chartId !== undefined) next.chartId = prefs.chartId
  if (prefs.activeSourceId !== undefined) next.activeSourceId = prefs.activeSourceId
  if (prefs.sourceKind !== undefined) next.sourceKind = prefs.sourceKind
  if (prefs.sourceKind === 'linear' && prefs.linearTeamId !== undefined && prefs.linearTeamId.trim().length > 0) {
    next.linearTeamId = prefs.linearTeamId.trim().slice(0, 80)
  }
  if (prefs.sourceKind === 'linear' && prefs.linearFetchedAt !== undefined && Number.isFinite(Date.parse(prefs.linearFetchedAt))) {
    next.linearFetchedAt = new Date(prefs.linearFetchedAt).toISOString()
  }
  if (prefs.sourceKind === 'linear' && prefs.linearClosedThrough !== undefined) {
    const day = preferenceDay(prefs.linearClosedThrough)
    if (day !== undefined) next.linearClosedThrough = day
  }
  if (typeof prefs.scatterShowTrend === 'boolean') next.scatterShowTrend = prefs.scatterShowTrend
  if (prefs.scatterTrendPercentile !== undefined && isScatterTrendPercentile(prefs.scatterTrendPercentile)) {
    next.scatterTrendPercentile = prefs.scatterTrendPercentile
  }
  const interval = sanitizeTrendInterval(prefs.scatterTrendInterval)
  if (interval !== undefined) next.scatterTrendInterval = interval
  if (isCfdTimeRange(prefs.cfdTimeRange)) next.cfdTimeRange = prefs.cfdTimeRange
  if (typeof prefs.includeSubIssues === 'boolean') next.includeSubIssues = prefs.includeSubIssues
  return next
}

function storedShape(prefs: Preferences): Record<string, unknown> {
  const stored: Record<string, unknown> = {}
  if (prefs.theme !== undefined) stored.theme = prefs.theme
  if (prefs.chartId !== undefined) stored.chartId = prefs.chartId
  if (prefs.activeSourceId !== undefined) stored.activeSourceId = prefs.activeSourceId
  if (prefs.sourceKind !== undefined) stored.sourceKind = prefs.sourceKind
  if (prefs.linearTeamId !== undefined) stored.linearTeamId = prefs.linearTeamId
  if (prefs.linearFetchedAt !== undefined) stored.linearFetchedAt = prefs.linearFetchedAt
  if (prefs.linearClosedThrough !== undefined) stored.linearClosedThrough = prefs.linearClosedThrough
  if (prefs.scatterShowTrend !== undefined) stored.scatterShowTrend = prefs.scatterShowTrend
  if (prefs.scatterTrendPercentile !== undefined) stored.scatterTrendPercentile = prefs.scatterTrendPercentile
  if (prefs.scatterTrendInterval !== undefined) stored.scatterTrendInterval = prefs.scatterTrendInterval
  if (prefs.cfdTimeRange !== undefined) stored.cfdTimeRange = prefs.cfdTimeRange
  if (prefs.includeSubIssues !== undefined) stored.includeSubIssues = prefs.includeSubIssues
  if (prefs.recentFiles.length > 0) stored.recentFiles = prefs.recentFiles
  return stored
}

function writeRaw(prefs: Preferences, storage: Storage | null): void {
  if (storage === null) return
  try {
    const stored = storedShape(prefs)
    if (Object.keys(stored).length === 0) storage.removeItem(PREFERENCES_KEY)
    else storage.setItem(PREFERENCES_KEY, JSON.stringify(stored))
  } catch {
    // Private mode and a full quota leave the in-memory dataset usable.
  }
}

function normalizePreferences(value: unknown): Preferences {
  if (!isRecord(value)) return { recentFiles: [] }
  const prefs: Preferences = { recentFiles: normalizeRecent(value.recentFiles) }
  if (value.theme === 'light' || value.theme === 'dark') prefs.theme = value.theme
  // A saved locale is ignored. The UI is English only, and the next write omits locale.
  if (typeof value.chartId === 'string' && CHART_IDS.has(value.chartId)) prefs.chartId = value.chartId as ChartId
  const activeSourceId = parseSourceId(value.activeSourceId)
  if (activeSourceId) {
    prefs.activeSourceId = activeSourceId
    prefs.sourceKind = sourceKindFromId(activeSourceId)
  } else if (value.sourceKind === 'linear' || value.sourceKind === 'file' || value.sourceKind === 'example') {
    prefs.sourceKind = value.sourceKind
  }
  if (prefs.sourceKind === 'linear') {
    const teamFromActive = prefs.activeSourceId ? linearTeamIdFromSourceId(prefs.activeSourceId) : undefined
    if (teamFromActive) prefs.linearTeamId = teamFromActive
    else if (typeof value.linearTeamId === 'string' && value.linearTeamId.trim().length > 0) {
      prefs.linearTeamId = value.linearTeamId.trim().slice(0, 80)
    }
    if (typeof value.linearFetchedAt === 'string' && Number.isFinite(Date.parse(value.linearFetchedAt))) {
      prefs.linearFetchedAt = new Date(value.linearFetchedAt).toISOString()
    }
    if (typeof value.linearClosedThrough === 'string') {
      const day = preferenceDay(value.linearClosedThrough)
      if (day !== undefined) prefs.linearClosedThrough = day
    }
  }
  if (typeof value.scatterShowTrend === 'boolean') prefs.scatterShowTrend = value.scatterShowTrend
  if (typeof value.scatterTrendPercentile === 'number' && isScatterTrendPercentile(value.scatterTrendPercentile)) {
    prefs.scatterTrendPercentile = value.scatterTrendPercentile
  }
  if (typeof value.scatterTrendInterval === 'number') {
    const interval = sanitizeTrendInterval(value.scatterTrendInterval)
    if (interval !== undefined) prefs.scatterTrendInterval = interval
  }
  if (isCfdTimeRange(value.cfdTimeRange)) prefs.cfdTimeRange = value.cfdTimeRange
  if (typeof value.includeSubIssues === 'boolean') prefs.includeSubIssues = value.includeSubIssues
  return prefs
}

function resolveTrendInterval(patchValue: number | undefined, current: number | undefined): number | undefined {
  if (patchValue === undefined) return sanitizeTrendInterval(current)
  return sanitizeTrendInterval(patchValue) ?? sanitizeTrendInterval(current)
}

function sanitizeTrendInterval(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return undefined
  return value
}

function preferenceDay(value: string): string | undefined {
  const date = parseIsoDate(value)
  if (date === null) return undefined
  return formatIsoDate(date)
}

function normalizeRecent(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return []
  const files: RecentFile[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.importedAt !== 'string') continue
    const name = entry.name.trim().slice(0, MAX_NAME_CHARS)
    if (name.length === 0 || Number.isNaN(Date.parse(entry.importedAt))) continue
    files.push({ name, importedAt: new Date(entry.importedAt).toISOString() })
    if (files.length === MAX_RECENT_FILES) break
  }
  return files
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}
