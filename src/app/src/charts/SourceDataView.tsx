import type { Dataset, DatasetMetadata, DateOrder, WorkItem, WorkflowStage } from '../domain/types.ts'
import type { MessageKey } from '../ui/i18n.tsx'
import { useI18n } from '../ui/i18n.tsx'

type MappingKind = 'id' | 'link' | 'title' | 'backlog' | 'workflow' | 'attribute' | 'blocked'

type ItemColumn =
  | { key: string; header: string; kind: 'id' | 'link' | 'title' }
  | { key: string; header: string; kind: 'stage'; index: number }
  | { key: string; header: string; kind: 'attribute' | 'blocked' }

export function SourceDataView({
  dataset,
  items,
  stages,
}: {
  dataset: Dataset
  items: readonly WorkItem[]
  stages: readonly WorkflowStage[]
}) {
  const { t } = useI18n()
  const metadata: DatasetMetadata = { ...dataset.metadata, stages: [...stages] }
  const mapping = mappingRows(metadata)

  return (
    <section className="source" data-chart="source-data">
      <h1 className="view-title">{t('chart.sourceData')}</h1>
      <dl className="source__meta">
        <div>
          <dt>{t('source')}</dt>
          <dd>{metadata.sourceName}</dd>
        </div>
        <div>
          <dt>{t('dateOrder')}</dt>
          <dd>{t(dateOrderKey(metadata.dateOrder))}</dd>
        </div>
      </dl>
      {dataset.warnings.length === 0 ? null : (
        <section className="source__section">
          <h2>{t('warnings')}</h2>
          <ul className="source__warnings">
            {dataset.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="source__section">
        <h2>{t('workflowMapping')}</h2>
        <div className="source__scroll">
          <table className="source__table">
            <thead>
              <tr>
                <th scope="col">{t('column')}</th>
                <th scope="col">{t('mapsTo')}</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((row) => (
                <tr key={`${row.kind}-${row.header}`}>
                  <th scope="row">{row.header}</th>
                  <td>
                    <span className={`role role--${row.kind}`}>{roleLabel(row.kind, t)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="source__section">
        <h2>
          {items.length} {t('workItems')}
        </h2>
        {items.length === 0 ? <p className="source__empty-copy">{t('noItems')}</p> : null}
        <SourceItemsTable metadata={metadata} items={items} />
      </section>
    </section>
  )
}

export function SourceItemsTable({
  metadata,
  items,
  id,
}: {
  metadata: DatasetMetadata
  items: readonly WorkItem[]
  id?: string
}) {
  const { t } = useI18n()
  const columns = itemColumns(metadata)
  return (
    <div className="source__scroll" id={id}>
      <table className="source__table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {columns.map((column) => (
                <td key={column.key}>{renderCell(item, column, t)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function itemColumns(metadata: DatasetMetadata): ItemColumn[] {
  const columns: ItemColumn[] = [{ key: 'id', header: metadata.idColumn, kind: 'id' }]
  if (metadata.linkColumn !== undefined) columns.push({ key: 'link', header: metadata.linkColumn, kind: 'link' })
  if (metadata.titleColumn !== undefined) columns.push({ key: 'title', header: metadata.titleColumn, kind: 'title' })
  metadata.stages.forEach((stage, index) => {
    columns.push({ key: `stage-${index}`, header: stage.name, kind: 'stage', index })
  })
  metadata.attributeColumns.forEach((name, index) => {
    columns.push({
      key: `attr-${index}`,
      header: name,
      kind: name === metadata.blockedDaysColumn ? 'blocked' : 'attribute',
    })
  })
  return columns
}

function mappingRows(metadata: DatasetMetadata): { header: string; kind: MappingKind }[] {
  const rows: { header: string; kind: MappingKind }[] = [{ header: metadata.idColumn, kind: 'id' }]
  if (metadata.linkColumn !== undefined) rows.push({ header: metadata.linkColumn, kind: 'link' })
  if (metadata.titleColumn !== undefined) rows.push({ header: metadata.titleColumn, kind: 'title' })
  for (const stage of metadata.stages) {
    rows.push({ header: stage.name, kind: stage.role === 'backlog' ? 'backlog' : 'workflow' })
  }
  for (const attribute of metadata.attributeColumns) {
    rows.push({
      header: attribute,
      kind: attribute === metadata.blockedDaysColumn ? 'blocked' : 'attribute',
    })
  }
  return rows
}

function renderCell(item: WorkItem, column: ItemColumn, t: (key: MessageKey) => string) {
  if (column.kind === 'id') {
    const href = safeLink(item.link)
    if (href === undefined) return item.id
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {item.id}
      </a>
    )
  }
  if (column.kind === 'link') {
    const href = safeLink(item.link)
    if (item.link === undefined) return blank()
    if (href === undefined) return item.link
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {t('openLink')}
      </a>
    )
  }
  if (column.kind === 'title') return item.title ?? blank()
  if (column.kind === 'stage') {
    const date = item.stageDates[column.index] ?? null
    const formatted = formatDate(date)
    if (formatted.length === 0) return empty(t('notReached'))
    return formatted
  }
  const raw = item.attributes[column.header] ?? ''
  if (raw.length === 0) return blank()
  return raw
}

function empty(label: string) {
  return (
    <span className="source__empty" title={label}>
      —
    </span>
  )
}

function blank() {
  return <span className="source__empty">—</span>
}

function roleLabel(kind: MappingKind, t: (key: MessageKey) => string): string {
  switch (kind) {
    case 'id':
      return t('roleId')
    case 'link':
      return t('roleLink')
    case 'title':
      return t('roleTitle')
    case 'backlog':
      return t('roleBacklog')
    case 'workflow':
      return t('roleWorkflow')
    case 'attribute':
      return t('roleAttribute')
    case 'blocked':
      return t('roleBlocked')
    default: {
      const unexpected: never = kind
      return unexpected
    }
  }
}

function dateOrderKey(order: DateOrder): MessageKey {
  if (order === 'ymd') return 'date.ymd'
  if (order === 'dmy') return 'date.dmy'
  return 'date.mdy'
}

function formatDate(date: Date | null): string {
  if (date === null) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function safeLink(link: string | undefined): string | undefined {
  if (link === undefined) return undefined
  if (/^https?:\/\//i.test(link)) return link
  return undefined
}
