import { useEffect, useId, useRef, useState } from 'react'
import { isAbortError, linearClientMessage, listLinearTeams } from '../../data/linear/client.ts'
import { exportLinearTeam } from '../../data/linear/exportTeam.ts'
import { defaultLinearSince } from '../../data/linear/since.ts'
import { linearTeamTree, type LinearTeamNode } from '../../data/linear/teamTree.ts'
import type { LinearTeam } from '../../data/linear/types.ts'
import { parseIsoDate } from '../../data/isoDate.ts'
import type { Dataset } from '../../domain/types.ts'
import { useI18n } from '../i18n.tsx'

export type LinearImportOutcome = { ok: true } | { ok: false; error: string }

const EXPORT_PROGRESS_SCALE = 400
const EXPORT_PROGRESS_CAP = 95

/** Asymptotic export fill: 1 - exp(-n/400), capped at 95%. */
export function linearExportFillPercent(loadedIssues: number): number {
  if (!Number.isFinite(loadedIssues) || loadedIssues <= 0) return 0
  const percent = (1 - Math.exp(-loadedIssues / EXPORT_PROGRESS_SCALE)) * 100
  return Math.min(EXPORT_PROGRESS_CAP, Math.round(percent * 10) / 10)
}

export function TeamPickerDialog({
  apiKey,
  onClose,
  onImported,
}: {
  apiKey: string
  onClose: () => void
  onImported: (dataset: Dataset) => Promise<LinearImportOutcome>
}) {
  const abortRef = useRef<AbortController | null>(null)
  const [teams, setTeams] = useState<LinearTeam[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [since, setSince] = useState(() => defaultLinearSince())
  const [exporting, setExporting] = useState(false)
  const [exportTeamName, setExportTeamName] = useState<string | null>(null)
  const [loadedIssues, setLoadedIssues] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller
    let active = true
    void listLinearTeams(apiKey, { signal: controller.signal }).then(
      (next) => {
        if (!active) return
        setTeams(next)
        setLoadError(null)
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return
        const message = linearClientMessage(error)
        if (message === 'canceled') return
        setLoadError(message)
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [apiKey])

  const sinceValid = parseIsoDate(since) !== null

  const confirm = () => {
    if (selectedId === null || exporting || !sinceValid) return
    const teamName = teams?.find((team) => team.id === selectedId)?.name ?? selectedId
    const controller = abortRef.current
    setExportTeamName(teamName)
    setExporting(true)
    setExportError(null)
    setLoadedIssues(0)
    void exportLinearTeam({
      apiKey,
      teamId: selectedId,
      since,
      mode: 'full',
      signal: controller?.signal,
      onIssueCount: (count) => setLoadedIssues((loaded) => Math.max(loaded, count)),
    }).then(async (result) => {
      if (controller?.signal.aborted) return
      if (!result.ok) {
        if (result.error === 'canceled') return
        setExporting(false)
        setExportError(result.error)
        return
      }
      const outcome = await onImported(result.dataset)
      if (controller?.signal.aborted) return
      if (!outcome.ok) {
        setExporting(false)
        setExportError(outcome.error)
      }
    })
  }

  return (
    <TeamPickerView
      exporting={exporting}
      loadedIssues={loadedIssues}
      teamName={exportTeamName}
      teams={teams}
      selectedId={selectedId}
      since={since}
      sinceValid={sinceValid}
      error={exportError ?? loadError}
      onClose={onClose}
      onSelect={setSelectedId}
      onSince={setSince}
      onConfirm={confirm}
    />
  )
}

export function TeamPickerView({
  exporting,
  loadedIssues,
  teamName,
  teams,
  selectedId,
  since,
  sinceValid,
  error,
  onClose,
  onSelect,
  onSince,
  onConfirm,
}: {
  exporting: boolean
  loadedIssues: number
  teamName: string | null
  teams: readonly LinearTeam[] | null
  selectedId: string | null
  since: string
  sinceValid: boolean
  error: string | null
  onClose: () => void
  onSelect: (id: string) => void
  onSince: (value: string) => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const titleId = useId()
  const tree = teams === null ? [] : linearTeamTree(teams)
  const progressLabel = t('linearExportProgress').replace('{0}', String(loadedIssues))
  const indeterminate = loadedIssues <= 0

  return (
    <div className="notice" onClick={onClose}>
      <div
        className="notice__card linear-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{exporting ? t('linearExportTitle') : t('linearPickTeam')}</h2>
        <div className="notice__body">
          {exporting ? (
            <div className="linear-export">
              <p className="linear-status">{t('linearExportTeam').replace('{0}', teamName ?? '')}</p>
              <div
                className={indeterminate ? 'linear-progress linear-progress--indeterminate' : 'linear-progress'}
                role="progressbar"
                aria-valuetext={progressLabel}
                aria-valuemin={indeterminate ? undefined : 0}
                aria-valuenow={indeterminate ? undefined : loadedIssues}
              >
                <div
                  className="linear-progress__fill"
                  style={indeterminate ? undefined : { width: `${linearExportFillPercent(loadedIssues)}%` }}
                />
              </div>
              <p className="linear-status">{progressLabel}</p>
            </div>
          ) : (
            <>
              <p>{t('linearPickHint')}</p>
              <SinceField since={since} onSince={onSince} />
              {teams === null && error === null ? <p className="linear-status">{t('linearLoadTeams')}</p> : null}
              {error !== null ? <p className="linear-error">{presentLinearError(error, t('linearInvalidKey'))}</p> : null}
              {teams !== null && teams.length === 0 && error === null ? <p className="linear-status">{t('linearNoTeams')}</p> : null}
              {tree.length > 0 ? (
                <TeamNodes nodes={tree} depth={0} selectedId={selectedId} groupLabel={t('linearPickTeam')} onSelect={onSelect} />
              ) : null}
            </>
          )}
        </div>
        <div className="linear-dialog__actions">
          {exporting ? null : (
            <button type="button" className="notice__close" disabled={selectedId === null || !sinceValid} onClick={onConfirm}>
              {t('linearLoadTeam')}
            </button>
          )}
          <button type="button" className="linear-dialog__secondary" onClick={onClose} autoFocus>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SinceField({ since, onSince }: { since: string; onSince: (value: string) => void }) {
  const { t } = useI18n()
  const sinceId = useId()
  return (
    <div className="linear-since">
      <label htmlFor={sinceId}>{t('linearSinceLabel')}</label>
      <input id={sinceId} type="date" value={since} onChange={(event) => onSince(event.target.value)} />
      <p className="linear-status">{t('linearSinceHint')}</p>
    </div>
  )
}

function presentLinearError(message: string, invalidKeyText: string): string {
  return message === 'invalid API key' ? invalidKeyText : message
}

function TeamNodes({
  nodes,
  depth,
  selectedId,
  groupLabel,
  onSelect,
}: {
  nodes: readonly LinearTeamNode[]
  depth: number
  selectedId: string | null
  groupLabel: string
  onSelect: (id: string) => void
}) {
  return (
    <ul className={depth === 0 ? 'linear-teams linear-teams--root' : 'linear-teams'} role={depth === 0 ? 'radiogroup' : undefined} aria-label={depth === 0 ? groupLabel : undefined}>
      {nodes.map((node) => (
        <li key={node.team.id}>
          <label className="linear-option" style={{ paddingLeft: 8 + depth * 16 }}>
            <input
              type="radio"
              name="linear-team"
              value={node.team.id}
              checked={selectedId === node.team.id}
              onChange={() => onSelect(node.team.id)}
            />
            <span>{node.team.name}</span>
            {depth === 0 && node.team.parentName ? <span className="linear-option__parent">{node.team.parentName}</span> : null}
          </label>
          {node.children.length > 0 ? (
            <TeamNodes nodes={node.children} depth={depth + 1} selectedId={selectedId} groupLabel={groupLabel} onSelect={onSelect} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
