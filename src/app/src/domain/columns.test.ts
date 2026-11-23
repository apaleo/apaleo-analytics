import { describe, expect, it } from 'vitest'
import { detectColumns } from './columns.ts'
import { parseCsv } from '../data/parseCsv.ts'

const today = new Date(2026, 10, 11)

function table(csv: string): string[][] {
  return csv
    .trim()
    .split('\n')
    .map((line) => line.split(','))
}

describe('detectColumns', () => {
  it('rejects a header whose first column does not contain ID', () => {
    const result = detectColumns(table('Name,Start,Done\n1,2026-01-01,2026-01-03'), today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('must contain "ID"')
  })

  it('rejects a sheet with only one workflow stage', () => {
    const result = detectColumns(table('ID,Start\n1,2026-01-02'), today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('At least two non-backlog workflow stages')
  })

  it('rejects a backlog column that does not contain dates', () => {
    const result = detectColumns(
      table('ID,Backlog,Start,Done\n1,soon,2026-01-01,2026-01-02'),
      today,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Backlog')
      expect(result.error).toContain('backlog/options')
    }
  })

  it('rejects a non-date first workflow column', () => {
    const result = detectColumns(table('ID,Notes,Done\n1,later,2026-01-02'), today)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Notes')
      expect(result.error).toContain('first (non-backlog) workflow stage')
    }
  })

  it('detects link, title, backlog, stages, attributes, and blocked days', () => {
    const result = detectColumns(
      table(
        'ID,Link,Title,Backlog,Doing,Done,Team,Blocked Days\n1,https://example.com/1,Checkout,2026-01-01,2026-01-02,2026-01-04,Payments,2',
      ),
      today,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.linkColumn).toBe(1)
    expect(result.layout.titleColumn).toBe(2)
    expect(result.layout.backlogColumn).toBe(3)
    expect(result.layout.stages.map((stage) => stage.name)).toEqual(['Backlog', 'Doing', 'Done'])
    expect(result.layout.stages[0]?.role).toBe('backlog')
    expect(result.layout.stages[1]?.role).toBe('workflow')
    expect(result.layout.attributeColumns).toEqual(['Team', 'Blocked Days'])
    expect(result.layout.blockedDaysIndex).toBe(7)
  })

  it('accepts a minimal ID column plus two dated stages', () => {
    const result = detectColumns(table('Story ID,Start,Done\n1,15/01/2026,20/01/2026'), today)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.stages.map((stage) => stage.role)).toEqual(['workflow', 'workflow'])
    expect(result.layout.linkColumn).toBeUndefined()
    expect(result.layout.attributeColumns).toEqual([])
  })

  it('stops workflow columns at the first non-date attribute', () => {
    const result = detectColumns(
      table('ID,Start,Done,Team\n1,2026-01-01,2026-01-05,Payments'),
      today,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.stages.map((stage) => stage.name)).toEqual(['Start', 'Done'])
    expect(result.layout.attributeColumns).toEqual(['Team'])
  })

  it('treats an entirely empty trailing column as a workflow stage', () => {
    const result = detectColumns(table('ID,Start,Done,Extra\n1,2026-01-01,2026-01-03,'), today)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.stages.map((stage) => stage.name)).toEqual(['Start', 'Done', 'Extra'])
  })

  it('returns the same ID error from parseCsv', () => {
    const result = parseCsv('Name,Start,Done\n1,2026-01-01,2026-01-03', { today })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('must contain "ID"')
  })
})
