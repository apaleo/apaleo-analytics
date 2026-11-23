import { isBeyondTomorrow } from '../domain/dates.ts'
import type { DatasetMetadata, DateOrder, WorkItem, WorkflowStage } from '../domain/types.ts'
import { parseIsoDate } from './isoDate.ts'
import { parseTable, type ParseCsvOptions, type ParseCsvResult } from './parseCsv.ts'

/**
 * JSON import. Two shapes are accepted.
 *
 * 1. Domain dataset. Stage dates are `YYYY-MM-DD` (a trailing time is ignored) or null
 *    when the item has not reached that stage. Column fields may live under `metadata`.
 *
 *    {
 *      "sourceName": "Board",
 *      "dateOrder": "ymd",
 *      "idColumn": "ID",
 *      "linkColumn": "Link",
 *      "titleColumn": "Title",
 *      "blockedDaysColumn": "Blocked Days",
 *      "attributeColumns": ["Type", "Blocked Days"],
 *      "stages": [
 *        { "name": "Ready", "role": "workflow" },
 *        { "name": "Done", "role": "workflow" }
 *      ],
 *      "items": [
 *        {
 *          "id": "AA-1",
 *          "title": "Checkout",
 *          "link": "https://example.com/AA-1",
 *          "stageDates": ["2026-01-06", "2026-01-15"],
 *          "blockedDays": 1,
 *          "attributes": { "Type": "Feature", "Blocked Days": "1" }
 *        }
 *      ]
 *    }
 *
 * 2. Flat rows. A top-level array, `{ "rows": [...] }`, or `{ "items": [...] }` when the
 *    objects are column values rather than domain items. Keys become the header, then the
 *    CSV column rules apply. Date cells should be strings such as `2026-01-06`.
 */
export function parseJson(text: string, options: ParseCsvOptions = {}): ParseCsvResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return fail('JSON error: the file is not valid JSON.')
  }

  if (Array.isArray(parsed)) return parseRowRecords(parsed, options)
  if (!isRecord(parsed)) return fail('JSON error: expected an object or an array of rows.')

  if (isRecord(parsed.metadata) && Array.isArray(parsed.metadata.stages)) {
    return parseDomain(
      {
        ...parsed.metadata,
        items: parsed.items,
        warnings: parsed.warnings ?? parsed.metadata.warnings,
      },
      options,
    )
  }
  if (Array.isArray(parsed.stages)) return parseDomain(parsed, options)
  if (Array.isArray(parsed.items) && parsed.items.some(isDomainItem)) {
    return fail('JSON error: domain items need a stages array.')
  }
  if (Array.isArray(parsed.rows)) return parseRowRecords(parsed.rows, options)
  if (Array.isArray(parsed.items)) return parseRowRecords(parsed.items, options)
  return fail('JSON error: expected { items, stages }, a dataset, or an array of row objects.')
}

function parseRowRecords(records: unknown, options: ParseCsvOptions): ParseCsvResult {
  if (!Array.isArray(records)) return fail('JSON error: rows must be an array.')
  if (records.length === 0) return fail('JSON error: the row array is empty.')

  const objects: Record<string, unknown>[] = []
  for (const record of records) {
    if (!isRecord(record)) return fail('JSON error: each row must be an object.')
    objects.push(record)
  }

  const headers: string[] = []
  for (const record of objects) {
    for (const key of Object.keys(record)) {
      if (!headers.includes(key)) headers.push(key)
    }
  }
  if (headers.length === 0) return fail('JSON error: the rows have no columns.')

  const rows = [headers, ...objects.map((record) => headers.map((key) => jsonCell(record[key])))]
  return parseTable(rows, { ...options, sourceName: options.sourceName ?? 'JSON' })
}

function parseDomain(body: Record<string, unknown>, options: ParseCsvOptions): ParseCsvResult {
  const stagesResult = readStages(body.stages)
  if (!stagesResult.ok) return stagesResult

  if (!Array.isArray(body.items)) return fail('JSON error: items must be an array.')
  const declared = declaredColumns(body.attributeColumns)
  if (!declared.ok) return declared

  const blockedDaysColumn = readBlockedColumn(body.blockedDaysColumn)
  if (!blockedDaysColumn.ok) return blockedDaysColumn

  const columns = declared.columns ?? collectAttributeKeys(body.items)
  if (blockedDaysColumn.name !== undefined && !columns.includes(blockedDaysColumn.name)) {
    columns.push(blockedDaysColumn.name)
  }

  const today = options.today ?? new Date()
  const items: WorkItem[] = []
  for (const entry of body.items) {
    const built = readItem(entry, stagesResult.stages, columns, blockedDaysColumn.name, today)
    if (!built.ok) return built
    items.push(built.item)
  }

  const dateOrder = readDateOrder(body.dateOrder)
  const metadata: DatasetMetadata = {
    sourceName: options.sourceName ?? textOrUndefined(body.sourceName) ?? 'JSON',
    idColumn: textOrUndefined(body.idColumn) ?? 'ID',
    linkColumn: textOrUndefined(body.linkColumn) ?? (items.some((item) => item.link !== undefined) ? 'Link' : undefined),
    titleColumn:
      textOrUndefined(body.titleColumn) ?? (items.some((item) => item.title !== undefined) ? 'Title' : undefined),
    stages: stagesResult.stages,
    attributeColumns: columns,
    blockedDaysColumn: blockedDaysColumn.name,
    dateOrder,
  }

  return {
    ok: true,
    dataset: { metadata, items, warnings: readWarnings(body.warnings) },
  }
}

function readStages(value: unknown): { ok: true; stages: WorkflowStage[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 2) return fail('JSON error: at least two stages are required.')

  const stages: WorkflowStage[] = []
  const names = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.trim().length === 0) {
      return fail('JSON error: each stage needs a name and a role.')
    }
    const name = entry.name.trim()
    if (names.has(name)) return fail(`JSON error: stage names must be unique. "${name}" is repeated.`)
    names.add(name)
    if (entry.role !== 'backlog' && entry.role !== 'workflow') {
      return fail(`JSON error: stage "${name}" must use role "backlog" or "workflow".`)
    }
    if (entry.role === 'backlog' && stages.length > 0) {
      return fail('JSON error: the backlog stage must be the first stage.')
    }
    stages.push({ name, role: entry.role })
  }

  const workflowCount = stages.filter((stage) => stage.role === 'workflow').length
  if (workflowCount < 2) return fail('JSON error: at least two workflow stages are required.')
  return { ok: true, stages }
}

function readItem(
  entry: unknown,
  stages: readonly WorkflowStage[],
  columns: readonly string[],
  blockedDaysColumn: string | undefined,
  today: Date,
): { ok: true; item: WorkItem } | { ok: false; error: string } {
  if (!isRecord(entry)) return fail('JSON error: each item must be an object.')
  if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
    return fail('JSON error: an item is missing an id.')
  }
  const id = entry.id.trim()
  if (!Array.isArray(entry.stageDates)) return fail(`JSON error: item "${id}" is missing stageDates.`)
  if (entry.stageDates.length !== stages.length) {
    return fail(
      `JSON error: item "${id}" has ${entry.stageDates.length} stage dates, but ${stages.length} stages were declared.`,
    )
  }

  const parsedDates: (Date | null)[] = []
  for (let index = 0; index < stages.length; index += 1) {
    const cell = entry.stageDates[index]
    const stageName = stages[index]?.name ?? String(index)
    if (cell === null || cell === '') {
      parsedDates.push(null)
      continue
    }
    if (typeof cell !== 'string') {
      return fail(`JSON error: item "${id}" has an invalid date for stage "${stageName}".`)
    }
    const date = parseIsoDate(cell)
    if (date === null) return fail(`JSON error: item "${id}" has an invalid date for stage "${stageName}".`)
    if (isBeyondTomorrow(date, today)) {
      return fail(`JSON error: item "${id}" has a future date for stage "${stageName}".`)
    }
    parsedDates.push(date)
  }

  const stageDates = fillEmptyStageDates(parsedDates)
  for (let index = 1; index < stageDates.length; index += 1) {
    const current = stageDates[index]
    const previous = stageDates[index - 1]
    if (current != null && previous != null && current.getTime() < previous.getTime()) {
      const stageName = stages[index]?.name ?? String(index)
      return fail(`JSON error: item "${id}" has a decreasing date for stage "${stageName}".`)
    }
  }

  const attributesResult = readAttributes(entry.attributes, columns, id)
  if (!attributesResult.ok) return attributesResult

  const blocked = readBlockedDays(entry.blockedDays, attributesResult.attributes, blockedDaysColumn, id)
  if (!blocked.ok) return blocked

  return {
    ok: true,
    item: {
      id,
      link: textOrUndefined(entry.link),
      title: textOrUndefined(entry.title),
      stageDates,
      blockedDays: blocked.days,
      attributes: blocked.attributes,
    },
  }
}

function readAttributes(
  value: unknown,
  columns: readonly string[],
  itemId: string,
): { ok: true; attributes: Record<string, string> } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, attributes: Object.fromEntries(columns.map((column) => [column, ''])) }
  if (!isRecord(value)) return fail(`JSON error: item "${itemId}" attributes must be an object.`)

  const attributes: Record<string, string> = {}
  for (const column of columns) {
    const cell = value[column]
    if (cell === undefined || cell === null) {
      attributes[column] = ''
      continue
    }
    if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
      attributes[column] = String(cell)
      continue
    }
    return fail(`JSON error: item "${itemId}" attribute "${column}" must be text or a number.`)
  }
  return { ok: true, attributes }
}

function readBlockedDays(
  value: unknown,
  attributes: Record<string, string>,
  blockedDaysColumn: string | undefined,
  itemId: string,
): { ok: true; days: number; attributes: Record<string, string> } | { ok: false; error: string } {
  let days = 0
  if (value !== undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fail(`JSON error: item "${itemId}" blockedDays must be a number.`)
    }
    days = value
  } else if (blockedDaysColumn !== undefined && (attributes[blockedDaysColumn] ?? '').length > 0) {
    const parsed = Number.parseFloat(attributes[blockedDaysColumn] ?? '')
    if (Number.isNaN(parsed)) {
      return fail(`JSON error: item "${itemId}" blocked days "${attributes[blockedDaysColumn]}" is not a number.`)
    }
    days = parsed
  }

  if (blockedDaysColumn !== undefined && (attributes[blockedDaysColumn] ?? '').length === 0 && days !== 0) {
    return { ok: true, days, attributes: { ...attributes, [blockedDaysColumn]: String(days) } }
  }
  return { ok: true, days, attributes }
}

function declaredColumns(
  value: unknown,
): { ok: true; columns: string[] | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, columns: undefined }
  if (!Array.isArray(value)) return fail('JSON error: attributeColumns must be an array of names.')
  const columns: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return fail('JSON error: attributeColumns must be an array of names.')
    }
    const name = entry.trim()
    if (!columns.includes(name)) columns.push(name)
  }
  return { ok: true, columns }
}

function collectAttributeKeys(items: readonly unknown[]): string[] {
  const keys: string[] = []
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.attributes)) continue
    for (const key of Object.keys(item.attributes)) {
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

function readBlockedColumn(value: unknown): { ok: true; name: string | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, name: undefined }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail('JSON error: blockedDaysColumn must be a name.')
  }
  return { ok: true, name: value.trim() }
}

function readDateOrder(value: unknown): DateOrder {
  if (value === 'ymd' || value === 'dmy' || value === 'mdy') return value
  return 'ymd'
}

function readWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function fillEmptyStageDates(dates: readonly (Date | null)[]): (Date | null)[] {
  const resolved = dates.slice()
  let carried: Date | null = null
  for (let index = resolved.length - 1; index >= 0; index -= 1) {
    const current = resolved[index]
    if (current == null) resolved[index] = carried === null ? null : new Date(carried.getTime())
    else carried = current
  }
  return resolved
}

function jsonCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function textOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function isDomainItem(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.stageDates)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}
