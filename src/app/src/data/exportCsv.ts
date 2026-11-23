import type { Dataset, DatasetMetadata, WorkItem } from '../domain/types.ts'
import { formatIsoDate } from './isoDate.ts'

type CsvColumn =
  | { header: string; kind: 'id' }
  | { header: string; kind: 'link' }
  | { header: string; kind: 'title' }
  | { header: string; kind: 'stage'; index: number }
  | { header: string; kind: 'attribute'; name: string }
  | { header: string; kind: 'blocked'; name: string }

/** UTF-8 CSV with a byte-order mark. Dates are `YYYY-MM-DD` so the file imports again without an ambiguous order. */
export function datasetToCsv(dataset: Dataset, items: readonly WorkItem[] = dataset.items): string {
  const columns = csvColumns(dataset.metadata)
  const lines = [columns.map((column) => csvField(column.header)).join(',')]
  for (const item of items) {
    lines.push(columns.map((column) => csvField(cellValue(item, column))).join(','))
  }
  return `\uFEFF${lines.join('\n')}\n`
}

export function csvDownloadName(sourceName: string, filtered: boolean): string {
  const stripped = sourceName.replace(/\.(csv|json|xlsx|xls)$/i, '')
  const safe = stripped
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const base = safe.length > 0 ? safe.slice(0, 80) : 'analytics'
  return filtered ? `${base}-filtered.csv` : `${base}.csv`
}

function csvColumns(metadata: DatasetMetadata): CsvColumn[] {
  const columns: CsvColumn[] = [{ header: metadata.idColumn, kind: 'id' }]
  if (metadata.linkColumn !== undefined) columns.push({ header: metadata.linkColumn, kind: 'link' })
  if (metadata.titleColumn !== undefined) columns.push({ header: metadata.titleColumn, kind: 'title' })
  metadata.stages.forEach((stage, index) => {
    columns.push({ header: stage.name, kind: 'stage', index })
  })
  for (const name of metadata.attributeColumns) {
    columns.push({
      header: name,
      kind: name === metadata.blockedDaysColumn ? 'blocked' : 'attribute',
      name,
    })
  }
  return columns
}

function cellValue(item: WorkItem, column: CsvColumn): string {
  switch (column.kind) {
    case 'id':
      return item.id
    case 'link':
      return item.link ?? ''
    case 'title':
      return item.title ?? ''
    case 'stage': {
      const date = item.stageDates[column.index] ?? null
      return date === null ? '' : formatIsoDate(date)
    }
    case 'blocked': {
      const raw = item.attributes[column.name] ?? ''
      if (raw.length === 0 && item.blockedDays !== 0) return String(item.blockedDays)
      return raw
    }
    case 'attribute':
      return item.attributes[column.name] ?? ''
    default: {
      const unexpected: never = column
      return unexpected
    }
  }
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}
