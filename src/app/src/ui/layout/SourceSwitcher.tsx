import { parseIsoDate } from '../../data/isoDate.ts'
import { sortStoredSources, type StoredSourceMeta } from '../../persistence/datasetStore.ts'
import { parseSourceId, sourceKindFromId, type SourceId } from '../../persistence/sourceId.ts'
import { UI_LOCALE } from '../i18n.tsx'

export function SourceSwitcher({
  sources,
  activeSourceId,
  activeLabel,
  ariaLabel,
  busy,
  statusText,
  onSourceChange,
}: {
  sources: readonly StoredSourceMeta[]
  activeSourceId: string
  activeLabel: string
  ariaLabel: string
  busy: boolean
  statusText?: string
  onSourceChange: (id: string) => void
}) {
  const choices = sourcesForSwitcher(sources, { id: activeSourceId, label: activeLabel })
  const selected = choices.some((source) => source.id === activeSourceId) ? activeSourceId : (choices[0]?.id ?? 'example')
  return (
    <p className="topbar__dataset" data-switching={busy ? 'true' : 'false'} aria-busy={busy}>
      <span className="topbar__dot" aria-hidden="true" />
      <select
        className="topbar__source"
        aria-label={ariaLabel}
        value={selected}
        onChange={(event) => onSourceChange(event.target.value)}
      >
        {choices.map((source) => (
          <option key={source.id} value={source.id}>
            {sourceOptionLabel(source)}
          </option>
        ))}
      </select>
      {statusText ? (
        <span className="topbar__switch-status" role="status">
          {statusText}
        </span>
      ) : null}
    </p>
  )
}

function sourcesForSwitcher(
  stored: readonly StoredSourceMeta[],
  active: { id: string; label: string },
): StoredSourceMeta[] {
  const sorted = sortStoredSources(stored)
  const example: StoredSourceMeta = sorted.find((source) => source.id === 'example') ?? {
    id: 'example',
    label: 'Example Data',
    sourceKind: 'example',
    updatedAt: '',
    lastActiveAt: '',
  }
  const choices = [example, ...sorted.filter((source) => source.id !== 'example')]
  if (choices.some((source) => source.id === active.id)) return choices
  const parsed: SourceId | undefined = parseSourceId(active.id)
  if (parsed === undefined) return choices
  return [
    ...choices,
    {
      id: parsed,
      label: active.label.trim().length > 0 ? active.label : parsed,
      sourceKind: sourceKindFromId(parsed),
      updatedAt: '',
      lastActiveAt: '',
    },
  ]
}

function sourceOptionLabel(source: StoredSourceMeta): string {
  if (source.sourceKind !== 'linear' || source.linearClosedThrough === undefined) return source.label
  const date = parseIsoDate(source.linearClosedThrough)
  if (date === null) return source.label
  const formatted = new Intl.DateTimeFormat(UI_LOCALE, { dateStyle: 'medium' }).format(date)
  return `${source.label} · ${formatted}`
}
