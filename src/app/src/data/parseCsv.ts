import { detectColumns, type ColumnLayout } from '../domain/columns.ts'
import { isBeyondTomorrow, matchingDateOrders, parseDateWithOrder } from '../domain/dates.ts'
import type { Dataset, DateOrder, WorkItem } from '../domain/types.ts'

export interface ParseCsvOptions {
  today?: Date
  sourceName?: string
}

export type ParseCsvResult = { ok: true; dataset: Dataset } | { ok: false; error: string }

export function parseCsv(text: string, options: ParseCsvOptions = {}): ParseCsvResult {
  const table = parseCsvTable(text)
  return parseTable(table.rows, options, table.warnings)
}

/** Column detection and work-item build for a header row plus data rows. */
export function parseTable(
  rows: readonly (readonly string[])[],
  options: ParseCsvOptions = {},
  extraWarnings: readonly string[] = [],
): ParseCsvResult {
  const today = options.today ?? new Date()
  const detection = detectColumns(rows, today)
  if (!detection.ok) return detection

  const layout = detection.layout
  const warnings = [...extraWarnings]
  const dateOrder = detectDateOrder(rows, layout, today, warnings)
  if (dateOrder === 'invalid') {
    return { ok: false, error: 'Format error: Unrecognized date format.' }
  }

  const items: WorkItem[] = []
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (row === undefined) continue
    const item = buildWorkItem(row, rowIndex, layout, dateOrder, today, warnings)
    if (item) items.push(item)
  }

  return {
    ok: true,
    dataset: {
      metadata: {
        sourceName: options.sourceName ?? 'CSV',
        idColumn: rows[0]?.[0] ?? 'ID',
        linkColumn: columnName(rows, layout.linkColumn),
        titleColumn: columnName(rows, layout.titleColumn),
        stages: layout.stages,
        attributeColumns: layout.attributeColumns,
        blockedDaysColumn:
          layout.blockedDaysIndex === undefined
            ? undefined
            : (rows[0]?.[layout.blockedDaysIndex] ?? undefined),
        dateOrder,
      },
      items,
      warnings,
    },
  }
}

export function parseCsvTable(text: string): { rows: string[][]; warnings: string[] } {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  const warnings: string[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let expectedWidth: number | undefined
  let line = 1
  let rowStartLine = 1

  const finishField = () => {
    row.push(field.trim())
    field = ''
  }

  const finishRow = () => {
    finishField()
    const blank = row.every((cell) => cell.length === 0)
    if (!blank) {
      if (expectedWidth === undefined) expectedWidth = row.length
      if (row.length === expectedWidth) rows.push(row)
      else warnings.push(`Line ${rowStartLine}: expected ${expectedWidth} fields, found ${row.length}.`)
    }
    row = []
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (inQuotes) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        if (char === '\n') line += 1
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === '\\' && (normalized[index + 1] === ',' || normalized[index + 1] === '"')) {
      field += normalized[index + 1]
      index += 1
      continue
    }
    if (char === ',') {
      finishField()
      continue
    }
    if (char === '\n') {
      finishRow()
      line += 1
      rowStartLine = line
      continue
    }
    if (char !== undefined) field += char
  }

  if (inQuotes) warnings.push(`Line ${rowStartLine}: unclosed quotes.`)
  if (field.length > 0 || row.length > 0) finishRow()
  return { rows, warnings }
}

function columnName(rows: readonly (readonly string[])[], index: number | undefined): string | undefined {
  if (index === undefined) return undefined
  return rows[0]?.[index]
}

function detectDateOrder(
  rows: readonly (readonly string[])[],
  layout: ColumnLayout,
  today: Date,
  warnings: string[],
): DateOrder | 'invalid' {
  if (rows.length > 1 && (rows[1]?.[0] ?? '') === '') {
    warnings.push(
      'Format warning: Not enough data to distinguish between date formats. Defaulting to mm/dd/yyyy.',
    )
    return 'mdy'
  }

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    for (let offset = 0; offset < layout.workflowCount; offset += 1) {
      const cell = rows[rowIndex]?.[layout.workflowStart + offset] ?? ''
      if (cell.length === 0) continue
      const orders = matchingDateOrders(cell, today)
      if (orders.length === 1) return orders[0] ?? 'invalid'
      if (orders.length === 0) return 'invalid'
    }
  }

  warnings.push(
    'Format warning: Not enough data to distinguish between date formats. Defaulting to mm/dd/yyyy.',
  )
  return 'mdy'
}

function buildWorkItem(
  row: readonly string[],
  rowIndex: number,
  layout: ColumnLayout,
  dateOrder: DateOrder,
  today: Date,
  warnings: string[],
): WorkItem | null {
  const line = rowIndex + 1
  const id = row[0] ?? ''
  if (id.length === 0) {
    warnings.push(`Line ${line}: skipped row with an empty ID.`)
    return null
  }

  const parsedDates: (Date | null)[] = []
  for (let offset = 0; offset < layout.workflowCount; offset += 1) {
    const column = layout.workflowStart + offset
    const cell = row[column] ?? ''
    if (cell.length === 0) {
      parsedDates.push(null)
      continue
    }
    const date = parseDateWithOrder(cell, dateOrder, today)
    if (date === null) {
      warnings.push(`Line ${line}: invalid date in column "${layout.stages[offset]?.name ?? column}".`)
      return null
    }
    if (isBeyondTomorrow(date, today)) {
      warnings.push(`Line ${line}: future date in column "${layout.stages[offset]?.name ?? column}".`)
      return null
    }
    parsedDates.push(date)
  }

  const stageDates = fillEmptyStageDates(parsedDates)
  for (let index = 1; index < stageDates.length; index += 1) {
    const current = stageDates[index]
    const previous = stageDates[index - 1]
    if (current != null && previous != null && current.getTime() < previous.getTime()) {
      warnings.push(`Line ${line}: decreasing date in column "${layout.stages[index]?.name ?? index}".`)
      return null
    }
  }

  let blockedDays = 0
  if (layout.blockedDaysIndex !== undefined) {
    const cell = row[layout.blockedDaysIndex] ?? ''
    if (cell.length > 0) {
      const parsed = Number.parseFloat(cell)
      if (Number.isNaN(parsed)) warnings.push(`Line ${line}: blocked days "${cell}" is not a number.`)
      else blockedDays = parsed
    }
  }

  const attributes: Record<string, string> = {}
  layout.attributeColumns.forEach((name, offset) => {
    const column = (layout.attributeStart ?? 0) + offset
    attributes[name] = row[column] ?? ''
  })

  const link = layout.linkColumn === undefined ? undefined : optionalCell(row[layout.linkColumn])
  const title = layout.titleColumn === undefined ? undefined : optionalCell(row[layout.titleColumn])

  return { id, link, title, stageDates, blockedDays, attributes }
}

function optionalCell(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined
  return value
}

/** Empty stage cells take the next stage's date, so a skipped stage contributes zero days. */
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
