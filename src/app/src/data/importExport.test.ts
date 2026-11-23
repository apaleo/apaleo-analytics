import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { datasetToCsv } from './exportCsv.ts'
import { formatIsoDate } from './isoDate.ts'
import { parseCsv } from './parseCsv.ts'
import { parseExcel } from './parseExcel.ts'
import { parseJson } from './parseJson.ts'
import type { Dataset } from '../domain/types.ts'

const today = new Date(2026, 10, 11)

const domainJson = JSON.stringify({
  sourceName: 'Board',
  idColumn: 'ID',
  linkColumn: 'Link',
  titleColumn: 'Title',
  blockedDaysColumn: 'Blocked Days',
  attributeColumns: ['Type', 'Blocked Days'],
  stages: [
    { name: 'Backlog', role: 'backlog' },
    { name: 'Ready', role: 'workflow' },
    { name: 'Done', role: 'workflow' },
  ],
  items: [
    {
      id: 'AA-1',
      link: 'https://example.com/AA-1',
      title: 'Hello, "world"',
      stageDates: ['2026-01-05', null, '2026-01-15'],
      blockedDays: 1,
      attributes: { Type: 'Feature', 'Blocked Days': '1' },
    },
    {
      id: 'AA-2',
      title: 'Still open',
      stageDates: ['2026-02-02', '2026-02-03', null],
      attributes: { Type: 'Bug' },
    },
  ],
})

describe('parseJson', () => {
  it('reads a domain dataset and fills a skipped stage from the next date', () => {
    const result = parseJson(domainJson, { today, sourceName: 'board.json' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.sourceName).toBe('board.json')
    expect(result.dataset.metadata.stages.map((stage) => stage.role)).toEqual(['backlog', 'workflow', 'workflow'])
    const first = result.dataset.items[0]
    expect(first?.title).toBe('Hello, "world"')
    expect(formatIsoDate(first?.stageDates[1] ?? new Date(0))).toBe('2026-01-15')
    expect(result.dataset.items[1]?.stageDates[2]).toBeNull()
  })

  it('reads domain items nested under metadata', () => {
    const result = parseJson(
      JSON.stringify({
        metadata: {
          stages: [
            { name: 'Ready', role: 'workflow' },
            { name: 'Done', role: 'workflow' },
          ],
          dateOrder: 'dmy',
        },
        items: [{ id: 'AA-3', stageDates: ['2026-04-01', '2026-04-03'], attributes: { Team: 'Payments' } }],
      }),
      { today },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.dateOrder).toBe('dmy')
    expect(result.dataset.items[0]?.attributes.Team).toBe('Payments')
  })

  it('reads an array of row objects through column detection', () => {
    const result = parseJson(
      JSON.stringify([
        { ID: 'AA-4', Title: 'Row item', Ready: '2026-05-01', Done: '2026-05-04', Type: 'Debt' },
      ]),
      { today, sourceName: 'rows.json' },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.titleColumn).toBe('Title')
    expect(result.dataset.items[0]?.attributes.Type).toBe('Debt')
    expect(formatIsoDate(result.dataset.items[0]?.stageDates[1] ?? new Date(0))).toBe('2026-05-04')
  })

  it('rejects invalid JSON, a decreasing date, and domain items without stages', () => {
    expect(parseJson('{', { today })).toEqual({ ok: false, error: 'JSON error: the file is not valid JSON.' })
    const decreasing = parseJson(
      JSON.stringify({
        stages: [
          { name: 'Ready', role: 'workflow' },
          { name: 'Done', role: 'workflow' },
        ],
        items: [{ id: 'AA-5', stageDates: ['2026-06-10', '2026-06-01'] }],
      }),
      { today },
    )
    expect(decreasing.ok).toBe(false)
    if (decreasing.ok) return
    expect(decreasing.error).toContain('decreasing date')
    const missingStages = parseJson(JSON.stringify({ items: [{ id: 'AA-6', stageDates: [] }] }), { today })
    expect(missingStages).toEqual({ ok: false, error: 'JSON error: domain items need a stages array.' })
  })
})

describe('datasetToCsv', () => {
  it('round-trips a JSON import, including a filtered subset', () => {
    const imported = parseJson(domainJson, { today, sourceName: 'board.json' })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    const again = parseCsv(datasetToCsv(imported.dataset), { today, sourceName: 'board.json' })
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(snapshot(again.dataset)).toEqual(snapshot(imported.dataset))

    const filtered = datasetToCsv(imported.dataset, imported.dataset.items.filter((item) => item.id === 'AA-2'))
    const filteredAgain = parseCsv(filtered, { today })
    expect(filteredAgain.ok).toBe(true)
    if (!filteredAgain.ok) return
    expect(filteredAgain.dataset.items.map((item) => item.id)).toEqual(['AA-2'])
    expect(filtered).not.toContain('AA-1')
  })
})

describe('parseExcel', () => {
  it('reads the first sheet with the CSV column rules', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['ID', 'Title', 'Ready', 'Done', 'Type'],
      ['AA-9', 'From excel', '2026-03-02', '2026-03-11', 'Feature'],
    ])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Board')
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBufferView
    const result = parseExcel(bytes, { today, sourceName: 'board.xlsx' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.metadata.sourceName).toBe('board.xlsx')
    expect(result.dataset.items[0]?.title).toBe('From excel')
    expect(formatIsoDate(result.dataset.items[0]?.stageDates[0] ?? new Date(0))).toBe('2026-03-02')
    expect(result.dataset.items[0]?.attributes.Type).toBe('Feature')
  })

  it('reports an empty first sheet', () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), 'Empty')
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBufferView
    const result = parseExcel(bytes, { today })
    expect(result).toEqual({ ok: false, error: 'Excel error: the first sheet is empty.' })
  })
})

function snapshot(dataset: Dataset) {
  return dataset.items.map((item) => ({
    id: item.id,
    link: item.link ?? '',
    title: item.title ?? '',
    stages: item.stageDates.map((date) => (date === null ? '' : formatIsoDate(date))),
    blockedDays: item.blockedDays,
    attributes: item.attributes,
  }))
}
