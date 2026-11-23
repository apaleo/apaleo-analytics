import * as XLSX from 'xlsx'
import { formatIsoDate } from './isoDate.ts'
import { parseTable, type ParseCsvOptions, type ParseCsvResult } from './parseCsv.ts'

/**
 * Reads the first worksheet with SheetJS and reuses CSV column detection.
 * Date cells become `YYYY-MM-DD`. Later sheets are ignored.
 */
export function parseExcel(data: ArrayBuffer | ArrayBufferView, options: ParseCsvOptions = {}): ParseCsvResult {
  let workbook: ReturnType<typeof XLSX.read>
  try {
    workbook = XLSX.read(toBytes(data), { type: 'array', cellDates: true })
  } catch {
    return { ok: false, error: 'Excel error: the file could not be read.' }
  }

  const sheetName = workbook.SheetNames[0]
  if (sheetName === undefined) return { ok: false, error: 'Excel error: the workbook has no sheets.' }
  const sheet = workbook.Sheets[sheetName]
  if (sheet === undefined) return { ok: false, error: 'Excel error: the first sheet is empty.' }

  const table = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  }) as unknown[][]

  const rows = table
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => excelCell(cell)))
    .filter((row) => row.some((cell) => cell.length > 0))

  if (rows.length === 0) return { ok: false, error: 'Excel error: the first sheet is empty.' }
  return parseTable(rows, options)
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

function excelCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return excelDate(value)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

/**
 * SheetJS may hand back either a local midnight or a UTC midnight for a date-only cell.
 * Pick the calendar day that matches that midnight so the day does not shift across time zones.
 */
function excelDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return ''
  const utcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  if (!utcMidnight) return formatIsoDate(value)
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
