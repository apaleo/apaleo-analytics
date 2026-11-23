import { useEffect, useRef, useState } from 'react'
import { ChartView } from './charts/ChartView.tsx'
import { datasetToCsv, csvDownloadName } from './data/exportCsv.ts'
import { loadExampleDataset } from './data/exampleDataset.ts'
import { refreshLinearDataset } from './data/linear/refreshDataset.ts'
import { parseCsv, type ParseCsvResult } from './data/parseCsv.ts'
import { parseJson } from './data/parseJson.ts'
import type { Dataset } from './domain/types.ts'
import { downloadTextFile } from './export/download.ts'
import {
  listStoredSources,
  readStoredSource,
  setSourceLibraryHooks,
  touchStoredSource,
  writeStoredSource,
  type StoredSourceMeta,
} from './persistence/datasetStore.ts'
import { readLinearApiKey } from './persistence/linearKey.ts'
import { readPreferences, rememberRecentFile, updatePreferences, type RecentFile } from './persistence/preferences.ts'
import { parseSourceId, sourceIdFromDataset, type SourceId } from './persistence/sourceId.ts'
import { loadSourceSelection } from './persistence/sourceSwitch.ts'
import { applySubIssueFilter } from './domain/subIssues.ts'
import { applyFilterState, defaultFilterState, retainFilterState, type FilterState } from './ui/filters/filterState.ts'
import { FilterPanel } from './ui/filters/FilterPanel.tsx'
import { AnalyticsShell } from './ui/layout/AnalyticsShell.tsx'
import { NoticeDialog } from './ui/layout/NoticeDialog.tsx'
import { TopBar } from './ui/layout/TopBar.tsx'
import { TeamPickerDialog, type LinearImportOutcome } from './ui/linear/TeamPickerDialog.tsx'
import { ChartNav } from './ui/nav/ChartNav.tsx'
import { DEFAULT_CHART_ID, type ChartId } from './ui/charts.ts'
import { I18nProvider, useI18n } from './ui/i18n.tsx'
import { ThemeProvider, type ThemeName } from './ui/theme.tsx'

setSourceLibraryHooks({
  hint: () => {
    const prefs = readPreferences()
    return {
      sourceKind: prefs.sourceKind,
      linearTeamId: prefs.linearTeamId,
      activeSourceId: prefs.activeSourceId,
    }
  },
  activate: (id) => {
    if (id.startsWith('linear:')) {
      updatePreferences({
        activeSourceId: id,
        sourceKind: 'linear',
        linearTeamId: id.slice('linear:'.length),
      })
      return
    }
    updatePreferences({
      activeSourceId: id,
      sourceKind: 'file',
      linearTeamId: null,
      linearFetchedAt: null,
      linearClosedThrough: null,
    })
  },
})

type Notice =
  | { kind: 'import-error'; message: string }
  | { kind: 'png-error' }
  | { kind: 'warnings'; messages: string[] }
  | { kind: 'adapter'; service: 'jira' | 'trello' }
  | { kind: 'linear-need-key' }
  | { kind: 'linear-error'; message: string }
  | { kind: 'linear-restore' }
  | { kind: 'linear-restore-unavailable' }
  | { kind: 'linear-not-stored'; warnings: string[] }

type SourceStatus = 'idle' | 'switching' | 'refreshing'

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(() => readPreferences().theme ?? 'light')

  return (
    <ThemeProvider theme={theme}>
      <I18nProvider>
        <AnalyticsScreen theme={theme} onTheme={setTheme} />
      </I18nProvider>
    </ThemeProvider>
  )
}

function AnalyticsScreen({
  theme,
  onTheme,
}: {
  theme: ThemeName
  onTheme: (theme: ThemeName) => void
}) {
  const { t } = useI18n()
  const loadGeneration = useRef(0)
  const switchGeneration = useRef(0)
  const refreshAbort = useRef<AbortController | null>(null)
  const [dataset, setDataset] = useState<Dataset>(() => loadExampleDataset())
  const [chartId, setChartId] = useState<ChartId>(() => readPreferences().chartId ?? DEFAULT_CHART_ID)
  const [filters, setFilters] = useState<FilterState>(() => defaultFilterState(loadExampleDataset()))
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [includeSubIssues, setIncludeSubIssues] = useState(() => readPreferences().includeSubIssues === true)
  const [recentFiles, setRecentFiles] = useState<readonly RecentFile[]>(() => readPreferences().recentFiles)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [linearPicker, setLinearPicker] = useState(false)
  const [linearRefreshing, setLinearRefreshing] = useState(false)
  const [settingsRequest, setSettingsRequest] = useState(0)
  const [sources, setSources] = useState<readonly StoredSourceMeta[]>([])
  const [activeSourceId, setActiveSourceId] = useState<SourceId>('example')
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>('idle')
  const [statusTeam, setStatusTeam] = useState('')
  const filtered = applyFilterState(dataset, filters)
  const countedItems = applySubIssueFilter(filtered.items, includeSubIssues)
  const linearKey = linearPicker ? readLinearApiKey() : null
  const sourceBusy = sourceStatus !== 'idle'

  useEffect(() => {
    updatePreferences({ theme, chartId })
  }, [theme, chartId])

  useEffect(() => {
    updatePreferences({ includeSubIssues })
  }, [includeSubIssues])

  useEffect(() => {
    const generation = loadGeneration.current
    let cancelled = false
    void (async () => {
      const listed = await listStoredSources()
      if (cancelled || generation !== loadGeneration.current) return
      if (listed === null) {
        const prefs = readPreferences()
        const active = prefs.activeSourceId
        if (prefs.sourceKind === 'linear' || (active !== undefined && active.startsWith('linear:'))) {
          setNotice({ kind: 'linear-restore-unavailable' })
        }
        return
      }
      setSources(listed)
      const prefs = readPreferences()
      const active = prefs.activeSourceId
      if (active === undefined || active === 'example') {
        const cached = await readStoredSource('example')
        if (cancelled || generation !== loadGeneration.current) return
        if (cached) {
          setDataset(cached)
          setFilters(defaultFilterState(cached))
          setActiveSourceId('example')
        }
        return
      }
      const stored = await readStoredSource(active)
      if (cancelled || generation !== loadGeneration.current) return
      if (stored) {
        setDataset(stored)
        setFilters(defaultFilterState(stored))
        setActiveSourceId(active)
        return
      }
      updatePreferences({ sourceKind: 'example', activeSourceId: 'example' })
      setActiveSourceId('example')
      setNotice(active.startsWith('linear:') ? { kind: 'linear-restore' } : { kind: 'import-error', message: t('sourceMissing') })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      refreshAbort.current?.abort()
      switchGeneration.current += 1
    }
  }, [])

  const supersedeInFlight = () => {
    refreshAbort.current?.abort()
    switchGeneration.current += 1
    setLinearRefreshing(false)
    setSourceStatus('idle')
  }

  const showRefreshError = (error: string) => {
    if (error === 'need-key') {
      setNotice({ kind: 'linear-need-key' })
      return
    }
    setNotice({
      kind: 'linear-error',
      message:
        error === 'missing-team' ? t('linearMissingTeam') : error === 'invalid API key' ? t('linearInvalidKey') : error,
    })
  }

  const acceptFile = (next: Dataset, recentName: string) => {
    supersedeInFlight()
    const generation = switchGeneration.current
    loadGeneration.current += 1
    const sourceKind = recentName === 'Example Data' ? 'example' : 'file'
    const tagged = tagFileDataset(next, sourceKind)
    setDataset(tagged)
    setFilters(defaultFilterState(tagged))
    setRecentFiles(rememberRecentFile(recentName))
    setNotice(tagged.warnings.length > 0 ? { kind: 'warnings', messages: tagged.warnings } : null)
    void (async () => {
      const saved = await writeStoredSource(tagged)
      if (generation !== switchGeneration.current) return
      if (saved.ok) {
        setSources(saved.catalog)
        setActiveSourceId(saved.id)
        applyActivePreferences(tagged, saved.id)
        return
      }
      const id = sourceIdFromDataset(tagged)
      if (id) setActiveSourceId(id)
    })()
  }

  const commitLinear = async (next: Dataset, mode: 'import' | 'refresh'): Promise<LinearImportOutcome> => {
    if (mode === 'import') supersedeInFlight()
    const generation = switchGeneration.current
    loadGeneration.current += 1
    const saved = await writeStoredSource(next)
    if (generation !== switchGeneration.current) return { ok: true }
    if (!saved.ok && saved.reason === 'too-large') return { ok: false, error: t('linearTooLarge') }
    setDataset(next)
    setFilters((current) => (mode === 'refresh' ? retainFilterState(current, next) : defaultFilterState(next)))
    const id = saved.ok ? saved.id : sourceIdFromDataset(next)
    if (id) setActiveSourceId(id)
    if (saved.ok) {
      setSources(saved.catalog)
      applyActivePreferences(next, saved.id)
    }
    setRecentFiles(rememberRecentFile(next.metadata.sourceName))
    if (!saved.ok) setNotice({ kind: 'linear-not-stored', warnings: next.warnings })
    else if (next.warnings.length > 0) setNotice({ kind: 'warnings', messages: next.warnings })
    else setNotice(null)
    return { ok: true }
  }

  const refreshActive = async () => {
    if (linearRefreshing || sourceStatus !== 'idle') return
    if (dataset.metadata.sourceKind !== 'linear') return
    supersedeInFlight()
    const generation = switchGeneration.current
    const controller = new AbortController()
    refreshAbort.current = controller
    setLinearRefreshing(true)
    setSourceStatus('refreshing')
    setStatusTeam(dataset.metadata.linearTeamName ?? dataset.metadata.sourceName)
    try {
      const apiKey = readLinearApiKey()
      if (!apiKey) {
        setNotice({ kind: 'linear-need-key' })
        return
      }
      const result = await refreshLinearDataset(dataset, { apiKey, signal: controller.signal })
      if (generation !== switchGeneration.current) return
      if (!result.ok) {
        if (result.canceled) return
        showRefreshError(result.error)
        return
      }
      const committed = await commitLinear(result.dataset, 'refresh')
      if (generation !== switchGeneration.current) return
      if (!committed.ok) setNotice({ kind: 'linear-error', message: committed.error })
    } finally {
      if (generation === switchGeneration.current) {
        setLinearRefreshing(false)
        setSourceStatus('idle')
      }
    }
  }

  const switchTo = async (rawId: string) => {
    const id = parseSourceId(rawId)
    if (id === undefined) return
    supersedeInFlight()
    const generation = switchGeneration.current
    const controller = new AbortController()
    refreshAbort.current = controller
    loadGeneration.current += 1
    setSourceStatus('switching')
    const known = sources.find((source) => source.id === id)
    if (known) setStatusTeam(known.label)
    try {
      const outcome = await loadSourceSelection(id, {
        signal: controller.signal,
        read: (sourceId) => readStoredSource(sourceId),
        loadExample: () => loadExampleDataset(),
        onLoaded: (loaded) => {
          if (generation !== switchGeneration.current) return
          setDataset(loaded)
          setFilters((current) => retainFilterState(current, loaded))
          setActiveSourceId(id)
          setStatusTeam(loaded.metadata.linearTeamName ?? loaded.metadata.sourceName)
          setNotice(null)
        },
        refreshLinear: async (loaded) => {
          if (generation !== switchGeneration.current || controller.signal.aborted) {
            return { ok: false, error: 'canceled', canceled: true }
          }
          setSourceStatus('refreshing')
          setLinearRefreshing(true)
          const touched = await touchStoredSource(id)
          if (generation !== switchGeneration.current) return { ok: false, error: 'canceled', canceled: true }
          if (touched) setSources(touched)
          applyActivePreferences(loaded, id)
          const apiKey = readLinearApiKey()
          if (!apiKey) return { ok: false, error: 'need-key' }
          return refreshLinearDataset(loaded, { apiKey, signal: controller.signal })
        },
      })
      if (generation !== switchGeneration.current) return
      if (outcome.status === 'canceled') return
      if (outcome.status === 'missing') {
        setNotice(
          id.startsWith('linear:') ? { kind: 'linear-restore' } : { kind: 'import-error', message: t('sourceMissing') },
        )
        return
      }
      if (outcome.status === 'loaded') {
        const saved = await writeStoredSource(outcome.dataset)
        if (generation !== switchGeneration.current) return
        if (saved.ok) {
          setSources(saved.catalog)
          setActiveSourceId(saved.id)
          applyActivePreferences(outcome.dataset, saved.id)
        } else {
          setActiveSourceId(id)
          if (id === 'example') applyActivePreferences(outcome.dataset, id)
        }
        return
      }
      if (outcome.status === 'refresh-failed') {
        if (outcome.canceled) return
        showRefreshError(outcome.error)
        return
      }
      const committed = await commitLinear(outcome.dataset, 'refresh')
      if (generation !== switchGeneration.current) return
      if (!committed.ok) setNotice({ kind: 'linear-error', message: committed.error })
    } finally {
      if (generation === switchGeneration.current) {
        setLinearRefreshing(false)
        setSourceStatus('idle')
      }
    }
  }

  const importParsed = async (recentName: string, load: () => Promise<ParseCsvResult>) => {
    try {
      const result = await load()
      if (!result.ok) {
        setNotice({ kind: 'import-error', message: result.error })
        return
      }
      acceptFile(result.dataset, recentName)
    } catch {
      setNotice({ kind: 'import-error', message: t('fileReadError') })
    }
  }

  const exportPng = async () => {
    const node = document.getElementById('chart-export')
    if (!(node instanceof HTMLElement)) {
      setNotice({ kind: 'png-error' })
      return
    }
    try {
      const { downloadChartPng } = await import('./export/chartPng.ts')
      await downloadChartPng(node, `${chartId}.png`)
    } catch {
      setNotice({ kind: 'png-error' })
    }
  }

  const sourceStatusText =
    sourceStatus === 'switching'
      ? t('sourceSwitching')
      : sourceStatus === 'refreshing'
        ? t('sourceRefreshing').replace('{0}', statusTeam || dataset.metadata.sourceName)
        : undefined

  return (
    <>
      <AnalyticsShell
        sidebar={<ChartNav selectedId={chartId} onSelect={setChartId} />}
        topBar={
          <TopBar
            datasetName={dataset.metadata.sourceName}
            sources={sources}
            activeSourceId={activeSourceId}
            onSourceChange={(id) => {
              void switchTo(id)
            }}
            sourceBusy={sourceBusy}
            sourceStatusText={sourceStatusText}
            itemCount={dataset.items.length}
            exampleLoaded={dataset.metadata.sourceName === 'Example Data'}
            recentFiles={recentFiles}
            onTheme={onTheme}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((open) => !open)}
            onImportCsv={(file) => {
              void importParsed(file.name, async () => parseCsv(await file.text(), { sourceName: file.name }))
            }}
            onImportJson={(file) => {
              void importParsed(file.name, async () => parseJson(await file.text(), { sourceName: file.name }))
            }}
            onImportExcel={(file) => {
              void importParsed(file.name, async () => {
                const { parseExcel } = await import('./data/parseExcel.ts')
                return parseExcel(await file.arrayBuffer(), { sourceName: file.name })
              })
            }}
            onLoadExample={() => acceptFile(loadExampleDataset(), 'Example Data')}
            onOpenAdapter={(service) => setNotice({ kind: 'adapter', service })}
            onImportLinear={() => {
              if (!readLinearApiKey()) {
                setNotice({ kind: 'linear-need-key' })
                return
              }
              setLinearPicker(true)
            }}
            onRefreshLinear={() => {
              void refreshActive()
            }}
            linearActive={dataset.metadata.sourceKind === 'linear'}
            linearRefreshing={linearRefreshing}
            linearFetchedAt={dataset.metadata.fetchedAt}
            settingsRequest={settingsRequest}
            onExportCsv={(scope) => {
              const exportFiltered = scope === 'filtered'
              const source = exportFiltered
                ? { ...dataset, metadata: { ...dataset.metadata, stages: filtered.stages }, items: countedItems }
                : dataset
              downloadTextFile(csvDownloadName(dataset.metadata.sourceName, exportFiltered), datasetToCsv(source))
            }}
            onExportPng={() => {
              void exportPng()
            }}
          />
        }
        rightPanel={
          filtersOpen ? (
            <FilterPanel
              dataset={dataset}
              filters={filters}
              includeSubIssues={includeSubIssues}
              onIncludeSubIssues={setIncludeSubIssues}
              onChange={setFilters}
              onClose={() => setFiltersOpen(false)}
            />
          ) : null
        }
      >
        <ChartView chartId={chartId} dataset={dataset} items={countedItems} stages={filtered.stages} />
      </AnalyticsShell>
      {notice?.kind === 'import-error' ? (
        <NoticeDialog title={t('importFailed')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{notice.message}</p>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'png-error' ? (
        <NoticeDialog title={t('export')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{t('pngFailed')}</p>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'warnings' ? (
        <NoticeDialog title={t('importedWarnings')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <ul className="notice__warnings">
            {notice.messages.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'adapter' ? (
        <NoticeDialog title={t('adapterTitle')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{notice.service === 'jira' ? t('jiraAdapter') : t('trelloAdapter')}</p>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'linear-need-key' ? (
        <NoticeDialog title={t('linearNeedKeyTitle')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{t('linearNeedKey')}</p>
          <button
            type="button"
            className="menu__action"
            onClick={() => {
              setNotice(null)
              setSettingsRequest((current) => current + 1)
            }}
          >
            {t('linearOpenSettings')}
          </button>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'linear-error' ? (
        <NoticeDialog title={t('importFailed')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{notice.message}</p>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'linear-restore' ? (
        <NoticeDialog title={t('importFailed')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{t('linearRestoreFailed')}</p>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'linear-restore-unavailable' ? (
        <NoticeDialog title={t('importFailed')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{t('linearRestoreUnavailable')}</p>
        </NoticeDialog>
      ) : null}
      {notice?.kind === 'linear-not-stored' ? (
        <NoticeDialog title={t('importedWarnings')} closeLabel={t('close')} onClose={() => setNotice(null)}>
          <p>{t('linearNotStored')}</p>
          {notice.warnings.length > 0 ? (
            <ul className="notice__warnings">
              {notice.warnings.map((message, index) => (
                <li key={`${index}-${message}`}>{message}</li>
              ))}
            </ul>
          ) : null}
        </NoticeDialog>
      ) : null}
      {linearPicker && linearKey ? (
        <TeamPickerDialog
          apiKey={linearKey}
          onClose={() => setLinearPicker(false)}
          onImported={async (next) => {
            const outcome = await commitLinear(next, 'import')
            if (outcome.ok) setLinearPicker(false)
            return outcome
          }}
        />
      ) : null}
    </>
  )
}

function applyActivePreferences(dataset: Dataset, id: SourceId) {
  if (id.startsWith('linear:') || dataset.metadata.sourceKind === 'linear') {
    updatePreferences({
      activeSourceId: id,
      sourceKind: 'linear',
      linearTeamId: dataset.metadata.linearTeamId ?? id.slice('linear:'.length),
      linearFetchedAt: dataset.metadata.fetchedAt ?? null,
      linearClosedThrough: dataset.metadata.linearClosedThrough ?? null,
    })
    return
  }
  updatePreferences({
    activeSourceId: id,
    sourceKind: id === 'example' ? 'example' : 'file',
    linearTeamId: null,
    linearFetchedAt: null,
    linearClosedThrough: null,
  })
}

function tagFileDataset(dataset: Dataset, sourceKind: 'example' | 'file'): Dataset {
  const metadata: Dataset['metadata'] = { ...dataset.metadata, sourceKind }
  delete metadata.linearTeamId
  delete metadata.linearTeamName
  delete metadata.fetchedAt
  delete metadata.linearSince
  delete metadata.linearClosedThrough
  return { ...dataset, metadata }
}
