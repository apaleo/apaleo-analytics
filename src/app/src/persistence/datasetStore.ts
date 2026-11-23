import type { Dataset, DatasetMetadata, WorkItem, WorkflowStage } from '../domain/types.ts'
import { formatIsoDate, parseIsoDate } from '../data/isoDate.ts'
import {
  type SourceId,
  linearTeamIdFromSourceId,
  parseSourceId,
  sourceIdFromDataset,
  sourceKindFromId,
} from './sourceId.ts'

/** IndexedDB database for stored analytics snapshots. */
export const DATASET_DB_NAME = 'twig-analytics-dataset'
export const DATASET_DB_VERSION = 2
/** Legacy v1 object store. New writes go to `snapshots` and `catalog`. */
export const DATASET_STORE_NAME = 'twig-analytics-dataset'
export const SNAPSHOTS_STORE_NAME = 'snapshots'
export const CATALOG_STORE_NAME = 'catalog'
export const CATALOG_RECORD_ID = 'catalog'
export const DATASET_RECORD_ID = 'current'

/** Soft cap for one snapshot. A larger export is refused so every other snapshot stays. */
export const DATASET_SNAPSHOT_SOFT_CAP_BYTES = 5 * 1024 * 1024

/** File and Linear entries. Example is extra and is never evicted. */
export const MAX_STORED_SOURCES = 12

const MAX_LABEL_CHARS = 180

export interface StoredSourceMeta {
  id: SourceId
  label: string
  sourceKind: 'example' | 'linear' | 'file'
  linearTeamId?: string
  linearClosedThrough?: string
  updatedAt: string
  lastActiveAt: string
}

export interface SourceWrite {
  id: SourceId
  payload: string
  catalog: readonly StoredSourceMeta[]
  removeIds: readonly SourceId[]
}

export interface SourceLibrary {
  list(): Promise<StoredSourceMeta[]>
  read(id: SourceId): Promise<string | null>
  write(record: SourceWrite): Promise<void>
  readLegacy(): Promise<string | null>
  deleteLegacy(): Promise<void>
}

export interface LegacyPreferenceHint {
  sourceKind?: string
  linearTeamId?: string
  activeSourceId?: string
}

export interface SourceLibraryHooks {
  hint: () => LegacyPreferenceHint
  activate: (id: SourceId) => void
}

export type SnapshotWrite =
  | { ok: true; id: SourceId; catalog: StoredSourceMeta[] }
  | { ok: false; reason: 'too-large' | 'unavailable' | 'missing-id' }

export interface WriteStoredSourceOptions {
  library?: SourceLibrary
  maxBytes?: number
  now?: Date
  maxSources?: number
}

let sourceLibraryHooks: SourceLibraryHooks | null = null
let prepareOnce: Promise<void> | null = null
let writeQueue: Promise<unknown> = Promise.resolve()

export function setSourceLibraryHooks(hooks: SourceLibraryHooks): void {
  sourceLibraryHooks = hooks
}

export function memorySourceLibrary(legacyCurrent: string | null = null): SourceLibrary {
  const snapshots = new Map<string, string>()
  let catalog: StoredSourceMeta[] = []
  let legacy = legacyCurrent
  return {
    async list() {
      return catalog.map((meta) => ({ ...meta }))
    },
    async read(id) {
      return snapshots.get(id) ?? null
    },
    async write(record) {
      snapshots.set(record.id, record.payload)
      for (const removeId of record.removeIds) {
        if (removeId !== record.id) snapshots.delete(removeId)
      }
      catalog = record.catalog.map((meta) => ({ ...meta }))
    },
    async readLegacy() {
      return legacy
    },
    async deleteLegacy() {
      legacy = null
    },
  }
}

export function sortStoredSources(sources: readonly StoredSourceMeta[]): StoredSourceMeta[] {
  const example = sources.find((source) => source.id === 'example')
  const rest = sources
    .filter((source) => source.id !== 'example')
    .slice()
    .sort((left, right) => {
      if (left.lastActiveAt !== right.lastActiveAt) return left.lastActiveAt < right.lastActiveAt ? 1 : -1
      return left.label.localeCompare(right.label)
    })
  return example ? [example, ...rest] : rest
}

export function serializeDataset(dataset: Dataset): string {
  return JSON.stringify({
    metadata: dataset.metadata,
    warnings: dataset.warnings,
    items: dataset.items.map((item) => ({
      id: item.id,
      parentId: item.parentId,
      link: item.link,
      title: item.title,
      stageDates: item.stageDates.map((date) => (date === null ? null : formatIsoDate(date))),
      blockedDays: item.blockedDays,
      attributes: item.attributes,
    })),
  })
}

export function deserializeDataset(payload: string): Dataset | null {
  let value: unknown
  try {
    value = JSON.parse(payload) as unknown
  } catch {
    return null
  }
  if (!isRecord(value) || !isRecord(value.metadata) || !Array.isArray(value.items)) return null
  const metadata = parseMetadata(value.metadata)
  if (metadata === null) return null
  const items: WorkItem[] = []
  for (const entry of value.items) {
    const item = parseItem(entry, metadata.stages.length)
    if (item === null) return null
    items.push(item)
  }
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
    : []
  return { metadata, items, warnings }
}

export async function listStoredSources(library?: SourceLibrary): Promise<StoredSourceMeta[] | null> {
  try {
    const source = library ?? browserLibrary()
    return sortStoredSources(await source.list())
  } catch {
    return null
  }
}

export async function readStoredSource(id: SourceId, library?: SourceLibrary): Promise<Dataset | null> {
  try {
    const payload = await (library ?? browserLibrary()).read(id)
    if (payload === null || payload.length === 0) return null
    return deserializeDataset(payload)
  } catch {
    return null
  }
}

export async function writeStoredSource(dataset: Dataset, options: WriteStoredSourceOptions = {}): Promise<SnapshotWrite> {
  const id = sourceIdFromDataset(dataset)
  if (id === null) return { ok: false, reason: 'missing-id' }
  const payload = serializeDataset(dataset)
  const maxBytes = options.maxBytes ?? DATASET_SNAPSHOT_SOFT_CAP_BYTES
  if (new TextEncoder().encode(payload).length > maxBytes) return { ok: false, reason: 'too-large' }
  const library = options.library ?? browserLibrary()
  const now = options.now ?? new Date()
  const maxSources = options.maxSources ?? MAX_STORED_SOURCES
  return enqueue(async () => {
    try {
      const existing = await library.list()
      const meta = metaFromDataset(dataset, id, now.toISOString())
      const next = upsertMeta(existing, meta)
      const capped = capLibrary(next, id, maxSources)
      await library.write({ id, payload, catalog: capped.catalog, removeIds: capped.removeIds })
      return { ok: true as const, id, catalog: sortStoredSources(capped.catalog) }
    } catch {
      return { ok: false as const, reason: 'unavailable' as const }
    }
  })
}

/** Bumps `lastActiveAt` without rewriting other snapshots. */
export async function touchStoredSource(
  id: SourceId,
  options: { library?: SourceLibrary; now?: Date } = {},
): Promise<StoredSourceMeta[] | null> {
  const library = options.library ?? browserLibrary()
  const nowIso = (options.now ?? new Date()).toISOString()
  return enqueue(async () => {
    try {
      const existing = await library.list()
      if (!existing.some((source) => source.id === id)) return sortStoredSources(existing)
      const payload = await library.read(id)
      if (payload === null) return sortStoredSources(existing)
      const catalog = existing.map((source) => (source.id === id ? { ...source, lastActiveAt: nowIso } : source))
      await library.write({ id, payload, catalog, removeIds: [] })
      return sortStoredSources(catalog)
    } catch {
      return null
    }
  })
}

/**
 * Copies a v1 `current` record into the library when preferences still say Linear.
 * A team id becomes `linear:{teamId}`. Without one, the record is `file:legacy-current`.
 * Returns the new id, or null when there is nothing to migrate.
 */
export async function migrateLegacyCurrent(
  library: SourceLibrary,
  hint: LegacyPreferenceHint,
  now = new Date(),
): Promise<SourceId | null> {
  if (hint.sourceKind !== 'linear') return null
  const payload = await library.readLegacy()
  if (payload === null || payload.length === 0) return null
  const dataset = deserializeDataset(payload)
  if (dataset === null) return null
  const teamId = (hint.linearTeamId ?? dataset.metadata.linearTeamId ?? '').trim().slice(0, 80)
  const id: SourceId = teamId.length > 0 && !/\s/.test(teamId) ? `linear:${teamId}` : 'file:legacy-current'
  if ((await library.read(id)) === null) {
    const stored =
      teamId.length > 0
        ? {
            ...dataset,
            metadata: { ...dataset.metadata, sourceKind: 'linear' as const, linearTeamId: teamId },
          }
        : dataset
    const nowIso = now.toISOString()
    const catalog = upsertMeta(await library.list(), metaFromDataset(stored, id, nowIso))
    await library.write({
      id,
      payload: serializeDataset(stored),
      catalog,
      removeIds: [],
    })
  }
  await library.deleteLegacy()
  return id
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task)
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function upsertMeta(catalog: readonly StoredSourceMeta[], meta: StoredSourceMeta): StoredSourceMeta[] {
  return [...catalog.filter((source) => source.id !== meta.id), meta]
}

function capLibrary(
  catalog: readonly StoredSourceMeta[],
  writingId: SourceId,
  maxSources: number,
): { catalog: StoredSourceMeta[]; removeIds: SourceId[] } {
  const example = catalog.filter((source) => source.id === 'example')
  const others = catalog.filter((source) => source.id !== 'example')
  const protectedEntry = others.find((source) => source.id === writingId)
  const rest = others.filter((source) => source.id !== writingId)
  const slots = protectedEntry ? Math.max(0, maxSources - 1) : maxSources
  if (rest.length <= slots) return { catalog: [...example, ...others], removeIds: [] }
  const ranked = rest.slice().sort((left, right) => {
    if (left.lastActiveAt !== right.lastActiveAt) return left.lastActiveAt < right.lastActiveAt ? -1 : 1
    return left.id < right.id ? -1 : 1
  })
  const removeIds = ranked.slice(0, rest.length - slots).map((source) => source.id)
  const dropped = new Set<SourceId>(removeIds)
  return {
    catalog: [...example, ...others.filter((source) => !dropped.has(source.id))],
    removeIds,
  }
}

function metaFromDataset(dataset: Dataset, id: SourceId, nowIso: string): StoredSourceMeta {
  const sourceKind = sourceKindFromId(id)
  const meta: StoredSourceMeta = {
    id,
    label: sourceLabel(dataset).slice(0, MAX_LABEL_CHARS),
    sourceKind,
    updatedAt: nowIso,
    lastActiveAt: nowIso,
  }
  if (sourceKind === 'linear') {
    const teamId = dataset.metadata.linearTeamId?.trim() || linearTeamIdFromSourceId(id)
    if (teamId) meta.linearTeamId = teamId
    if (dataset.metadata.linearClosedThrough) meta.linearClosedThrough = dataset.metadata.linearClosedThrough
  }
  return meta
}

function sourceLabel(dataset: Dataset): string {
  const team = dataset.metadata.linearTeamName?.trim()
  if ((dataset.metadata.sourceKind === 'linear' || dataset.metadata.linearTeamId) && team) return `Linear · ${team}`
  const name = dataset.metadata.sourceName.trim()
  return name.length > 0 ? name : 'Dataset'
}

function browserLibrary(): SourceLibrary {
  return {
    async list() {
      await prepareBrowser()
      return rawBrowserLibrary.list()
    },
    async read(id) {
      await prepareBrowser()
      return rawBrowserLibrary.read(id)
    },
    async write(record) {
      await prepareBrowser()
      return rawBrowserLibrary.write(record)
    },
    async readLegacy() {
      await prepareBrowser()
      return rawBrowserLibrary.readLegacy()
    },
    async deleteLegacy() {
      await prepareBrowser()
      return rawBrowserLibrary.deleteLegacy()
    },
  }
}

const rawBrowserLibrary: SourceLibrary = {
  async list() {
    const db = await openDatabase()
    try {
      if (!db.objectStoreNames.contains(CATALOG_STORE_NAME)) return []
      const value = await idbGet(db, CATALOG_STORE_NAME, CATALOG_RECORD_ID)
      return parseCatalog(value)
    } finally {
      db.close()
    }
  },
  async read(id) {
    const db = await openDatabase()
    try {
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE_NAME)) return null
      const value = await idbGet(db, SNAPSHOTS_STORE_NAME, id)
      return typeof value === 'string' ? value : null
    } finally {
      db.close()
    }
  },
  async write(record) {
    const db = await openDatabase()
    try {
      await runTransaction(db, [SNAPSHOTS_STORE_NAME, CATALOG_STORE_NAME], (tx) => {
        const snapshots = tx.objectStore(SNAPSHOTS_STORE_NAME)
        snapshots.put(record.payload, record.id)
        for (const removeId of record.removeIds) {
          if (removeId !== record.id) snapshots.delete(removeId)
        }
        tx.objectStore(CATALOG_STORE_NAME).put([...record.catalog], CATALOG_RECORD_ID)
      })
    } finally {
      db.close()
    }
  },
  async readLegacy() {
    const db = await openDatabase()
    try {
      if (!db.objectStoreNames.contains(DATASET_STORE_NAME)) return null
      const value = await idbGet(db, DATASET_STORE_NAME, DATASET_RECORD_ID)
      return typeof value === 'string' ? value : null
    } finally {
      db.close()
    }
  },
  async deleteLegacy() {
    const db = await openDatabase()
    try {
      if (!db.objectStoreNames.contains(DATASET_STORE_NAME)) return
      await runTransaction(db, [DATASET_STORE_NAME], (tx) => {
        tx.objectStore(DATASET_STORE_NAME).delete(DATASET_RECORD_ID)
      })
    } finally {
      db.close()
    }
  },
}

async function prepareBrowser(): Promise<void> {
  if (prepareOnce === null) {
    prepareOnce = migrateBrowserLibrary().catch((error: unknown) => {
      prepareOnce = null
      throw error
    })
  }
  await prepareOnce
}

async function migrateBrowserLibrary(): Promise<void> {
  const hint = sourceLibraryHooks?.hint() ?? {}
  const id = await migrateLegacyCurrent(rawBrowserLibrary, hint)
  if (id === null || sourceLibraryHooks === null) return
  if (parseSourceId(sourceLibraryHooks.hint().activeSourceId)) return
  sourceLibraryHooks.activate(id)
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATASET_DB_NAME, DATASET_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE_NAME)) db.createObjectStore(SNAPSHOTS_STORE_NAME)
      if (!db.objectStoreNames.contains(CATALOG_STORE_NAME)) db.createObjectStore(CATALOG_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function idbGet(db: IDBDatabase, store: string, key: IDBValidKey): Promise<unknown> {
  return requestToPromise(db.transaction(store, 'readonly').objectStore(store).get(key))
}

function runTransaction(db: IDBDatabase, stores: string[], fill: (tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
    fill(tx)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function parseCatalog(value: unknown): StoredSourceMeta[] {
  if (!Array.isArray(value)) return []
  const byId = new Map<SourceId, StoredSourceMeta>()
  for (const entry of value) {
    const meta = parseMeta(entry)
    if (meta) byId.set(meta.id, meta)
  }
  return [...byId.values()]
}

function parseMeta(value: unknown): StoredSourceMeta | null {
  if (!isRecord(value)) return null
  const id = parseSourceId(value.id)
  if (id === undefined) return null
  if (typeof value.label !== 'string' || value.label.trim().length === 0) return null
  const sourceKind = sourceKindFromId(id)
  if (value.sourceKind !== undefined && value.sourceKind !== sourceKind) return null
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : ''
  const lastActiveAt = typeof value.lastActiveAt === 'string' && value.lastActiveAt.length > 0 ? value.lastActiveAt : updatedAt
  const meta: StoredSourceMeta = {
    id,
    label: value.label.slice(0, MAX_LABEL_CHARS),
    sourceKind,
    updatedAt,
    lastActiveAt,
  }
  if (sourceKind === 'linear') {
    const teamId = linearTeamIdFromSourceId(id)
    if (teamId) meta.linearTeamId = teamId
    if (typeof value.linearClosedThrough === 'string' && parseIsoDate(value.linearClosedThrough) !== null) {
      meta.linearClosedThrough = formatIsoDate(parseIsoDate(value.linearClosedThrough) ?? new Date(0))
    }
  }
  return meta
}

function parseMetadata(value: Record<string, unknown>): DatasetMetadata | null {
  if (typeof value.sourceName !== 'string' || typeof value.idColumn !== 'string') return null
  if (!Array.isArray(value.stages) || !Array.isArray(value.attributeColumns)) return null
  const stages: WorkflowStage[] = []
  for (const stage of value.stages) {
    if (!isRecord(stage) || typeof stage.name !== 'string') return null
    if (stage.role !== 'backlog' && stage.role !== 'workflow') return null
    stages.push({ name: stage.name, role: stage.role })
  }
  if (stages.length === 0) return null
  const attributeColumns = value.attributeColumns.filter((name): name is string => typeof name === 'string')
  if (attributeColumns.length !== value.attributeColumns.length) return null
  const dateOrder = value.dateOrder
  if (dateOrder !== 'ymd' && dateOrder !== 'dmy' && dateOrder !== 'mdy') return null

  const metadata: DatasetMetadata = {
    sourceName: value.sourceName,
    idColumn: value.idColumn,
    stages,
    attributeColumns,
    dateOrder,
  }
  if (typeof value.linkColumn === 'string') metadata.linkColumn = value.linkColumn
  if (typeof value.titleColumn === 'string') metadata.titleColumn = value.titleColumn
  if (typeof value.blockedDaysColumn === 'string') metadata.blockedDaysColumn = value.blockedDaysColumn
  const sourceKind = value.sourceKind
  if (sourceKind === 'linear' || sourceKind === 'file' || sourceKind === 'example') metadata.sourceKind = sourceKind
  if (typeof value.linearTeamId === 'string' && value.linearTeamId.trim().length > 0) {
    metadata.linearTeamId = value.linearTeamId
  }
  if (typeof value.linearTeamName === 'string') metadata.linearTeamName = value.linearTeamName
  if (typeof value.fetchedAt === 'string' && Number.isFinite(Date.parse(value.fetchedAt))) {
    metadata.fetchedAt = new Date(value.fetchedAt).toISOString()
  }
  const linearSince = optionalDay(value.linearSince)
  if (linearSince !== undefined) metadata.linearSince = linearSince
  const linearClosedThrough = optionalDay(value.linearClosedThrough)
  if (linearClosedThrough !== undefined) metadata.linearClosedThrough = linearClosedThrough
  return metadata
}

function optionalDay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const date = parseIsoDate(value)
  if (date === null) return undefined
  return formatIsoDate(date)
}

function parseItem(value: unknown, stageCount: number): WorkItem | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) return null
  if (!Array.isArray(value.stageDates) || value.stageDates.length !== stageCount) return null
  const stageDates: (Date | null)[] = []
  for (const cell of value.stageDates) {
    if (cell === null) {
      stageDates.push(null)
      continue
    }
    if (typeof cell !== 'string') return null
    const date = parseIsoDate(cell)
    if (date === null) return null
    stageDates.push(date)
  }
  const attributes: Record<string, string> = {}
  if (value.attributes !== undefined) {
    if (!isRecord(value.attributes)) return null
    for (const [key, attribute] of Object.entries(value.attributes)) {
      if (typeof attribute !== 'string') return null
      attributes[key] = attribute
    }
  }
  const blockedDays = value.blockedDays === undefined ? 0 : value.blockedDays
  if (typeof blockedDays !== 'number' || !Number.isFinite(blockedDays)) return null
  const item: WorkItem = { id: value.id, stageDates, blockedDays, attributes }
  if (typeof value.link === 'string' && value.link.length > 0) item.link = value.link
  if (typeof value.title === 'string' && value.title.length > 0) item.title = value.title
  if (typeof value.parentId === 'string' && value.parentId.trim().length > 0) item.parentId = value.parentId.trim()
  return item
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
