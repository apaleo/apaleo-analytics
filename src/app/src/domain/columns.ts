import { isCsvDate } from './dates.ts'
import type { WorkflowStage } from './types.ts'

const BLOCKED_LABELS = ['BLOCKED DAYS', 'DAYS BLOCKED', 'JOURS BLOQUÉS']

export interface ColumnLayout {
  idColumn: number
  linkColumn?: number
  titleColumn?: number
  backlogColumn?: number
  workflowStart: number
  workflowCount: number
  stages: WorkflowStage[]
  attributeStart?: number
  attributeColumns: string[]
  blockedDaysIndex?: number
}

export type ColumnDetection = { ok: true; layout: ColumnLayout } | { ok: false; error: string }

/**
 * Column order follows the original analytics sheet:
 * ID, optional LINK, optional TITLE/NAME/DESCRIPTION, optional dated BACKLOG/OPTIONS,
 * at least two dated workflow stages, then attributes. A column is dated when its
 * first non-empty cell parses as a date, or when the column is entirely empty.
 * BLOCKED DAYS / DAYS BLOCKED is recognized only among the attribute columns.
 */
export function detectColumns(rows: readonly (readonly string[])[], now = new Date()): ColumnDetection {
  const header = rows[0]
  if (header === undefined || header.length === 0) {
    return { ok: false, error: 'Format error: missing header row.' }
  }

  const nameAt = (index: number) => header[index] ?? ''
  if (!nameAt(0).toUpperCase().includes('ID')) {
    return {
      ok: false,
      error: `Format error: First column name must contain "ID", found "${nameAt(0)}".`,
    }
  }

  let index = 1
  let linkColumn: number | undefined
  if (nameAt(index).toUpperCase().includes('LINK')) {
    linkColumn = index
    index += 1
  }

  let titleColumn: number | undefined
  if (includesAny(nameAt(index), ['TITLE', 'NAME', 'DESCRIPTION'])) {
    titleColumn = index
    index += 1
  }

  let backlogColumn: number | undefined
  if (includesAny(nameAt(index), ['BACKLOG', 'OPTIONS'])) {
    if (!backlogColumnHasDates(rows, index, now)) {
      const label = nameAt(index) || '(missing)'
      return {
        ok: false,
        error: `Format error: Can't parse dates in column "${label}". The column is interpreted as the backlog/options column and must contain dates.`,
      }
    }
    backlogColumn = index
    index += 1
  }

  const workflowStart = backlogColumn ?? index
  let workflowCount = backlogColumn === undefined ? 0 : 1

  if (!requiredStageColumn(rows, header, index, now)) {
    const label = nameAt(index) || '(missing)'
    return {
      ok: false,
      error: `Format error: Can't parse dates in column "${label}". The column is interpreted as the first (non-backlog) workflow stage and must contain dates.`,
    }
  }
  index += 1
  workflowCount += 1

  if (!requiredStageColumn(rows, header, index, now)) {
    const label = nameAt(index) || '(missing)'
    return {
      ok: false,
      error: `Format error: Can't parse dates in column "${label}". At least two non-backlog workflow stages are required.`,
    }
  }
  index += 1
  workflowCount += 1

  while (index < header.length && columnLooksLikeDates(rows, index, now)) {
    workflowCount += 1
    index += 1
  }

  const stages: WorkflowStage[] = []
  for (let offset = 0; offset < workflowCount; offset += 1) {
    const column = workflowStart + offset
    stages.push({
      name: header[column] ?? '',
      role: column === backlogColumn ? 'backlog' : 'workflow',
    })
  }

  const attributeColumns: string[] = []
  let attributeStart: number | undefined
  let blockedDaysIndex: number | undefined
  if (index < header.length) {
    attributeStart = index
    for (; index < header.length; index += 1) {
      const name = header[index] ?? ''
      if (includesAny(name, BLOCKED_LABELS)) blockedDaysIndex = index
      attributeColumns.push(name)
    }
  }

  return {
    ok: true,
    layout: {
      idColumn: 0,
      linkColumn,
      titleColumn,
      backlogColumn,
      workflowStart,
      workflowCount,
      stages,
      attributeStart,
      attributeColumns,
      blockedDaysIndex,
    },
  }
}

function requiredStageColumn(
  rows: readonly (readonly string[])[],
  header: readonly string[],
  index: number,
  now: Date,
): boolean {
  if (index >= header.length) return false
  return columnLooksLikeDates(rows, index, now)
}

function columnLooksLikeDates(rows: readonly (readonly string[])[], column: number, now: Date): boolean {
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cell = rows[rowIndex]?.[column] ?? ''
    if (cell.length > 0) return isCsvDate(cell, now)
  }
  return true
}

function backlogColumnHasDates(rows: readonly (readonly string[])[], column: number, now: Date): boolean {
  if (rows.length > 1 && (rows[1]?.[0] ?? '') === '') return true
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cell = rows[rowIndex]?.[column] ?? ''
    if (cell.length > 0) return isCsvDate(cell, now)
  }
  return false
}

function includesAny(value: string, needles: readonly string[]): boolean {
  const upper = value.toUpperCase()
  return needles.some((needle) => upper.includes(needle))
}
