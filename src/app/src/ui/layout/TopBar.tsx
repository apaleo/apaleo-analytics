import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { RecentFile } from '../../persistence/preferences.ts'
import type { ThemeName } from '../theme.tsx'
import { useTheme } from '../theme.tsx'
import { UI_LOCALE, useI18n, type MessageKey } from '../i18n.tsx'
import type { StoredSourceMeta } from '../../persistence/datasetStore.ts'
import { LinearSettingsFields } from '../linear/LinearSettingsFields.tsx'
import { SourceSwitcher } from './SourceSwitcher.tsx'
import { Wordmark } from './Wordmark.tsx'

type MenuId = 'data' | 'export' | 'settings'

export function TopBar({
  datasetName,
  sources,
  activeSourceId,
  onSourceChange,
  sourceBusy,
  sourceStatusText,
  itemCount,
  exampleLoaded,
  recentFiles,
  onTheme,
  filtersOpen,
  onToggleFilters,
  onImportCsv,
  onImportJson,
  onImportExcel,
  onLoadExample,
  onOpenAdapter,
  onImportLinear,
  onRefreshLinear,
  linearActive,
  linearRefreshing,
  linearFetchedAt,
  settingsRequest,
  initialMenu,
  onExportCsv,
  onExportPng,
}: {
  datasetName: string
  sources: readonly StoredSourceMeta[]
  activeSourceId: string
  onSourceChange: (id: string) => void
  sourceBusy?: boolean
  sourceStatusText?: string
  itemCount: number
  exampleLoaded: boolean
  recentFiles: readonly RecentFile[]
  onTheme: (theme: ThemeName) => void
  filtersOpen: boolean
  onToggleFilters: () => void
  onImportCsv: (file: File) => void
  onImportJson: (file: File) => void
  onImportExcel: (file: File) => void
  onLoadExample: () => void
  onOpenAdapter: (service: 'jira' | 'trello') => void
  onImportLinear: () => void
  onRefreshLinear: () => void
  linearActive: boolean
  linearRefreshing: boolean
  /** ISO time of the last successful fetch. Refresh loads issues updated after it. */
  linearFetchedAt?: string
  /** Increment to open the Settings menu, for example after a missing Linear key. */
  settingsRequest?: number
  initialMenu?: MenuId
  onExportCsv: (scope: 'all' | 'filtered') => void
  onExportPng: () => void
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const [openMenu, setOpenMenu] = useState<MenuId | null>(initialMenu ?? null)
  const menusRef = useRef<HTMLDivElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const jsonInput = useRef<HTMLInputElement>(null)
  const excelInput = useRef<HTMLInputElement>(null)
  const baseId = useId()

  useEffect(() => {
    if (settingsRequest === undefined || settingsRequest === 0) return
    setOpenMenu('settings')
  }, [settingsRequest])

  useEffect(() => {
    if (openMenu === null) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menusRef.current?.contains(target)) return
      setOpenMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu])

  const toggle = (menu: MenuId) => {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  const run = (action: () => void) => {
    setOpenMenu(null)
    action()
  }

  const pick = (input: { current: HTMLInputElement | null }) => {
    setOpenMenu(null)
    input.current?.click()
  }

  const takeFile = (event: { target: HTMLInputElement }, handler: (file: File) => void) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) handler(file)
  }

  const refreshLabel = refreshTitle(t, linearFetchedAt)

  return (
    <div className="topbar">
      <div className="topbar__brand">
        <Wordmark />
      </div>
      <div className="topbar__menus" ref={menusRef}>
        <Menu id={`${baseId}-data`} label={t('data')} open={openMenu === 'data'} onToggle={() => toggle('data')}>
          <p className="menu__kicker">{t('loaded')}</p>
          <p className="menu__title">{datasetName}</p>
          {exampleLoaded ? <p className="menu__note">{t('exampleLoaded')}</p> : null}
          <p className="menu__meta">
            {itemCount} {t('workItems')}
          </p>
          <div className="menu__rule" />
          <p className="menu__label">{t('import')}</p>
          <div className="menu__actions">
            <button type="button" className="menu__action" onClick={() => pick(csvInput)}>
              {t('importCsv')}
            </button>
            <button type="button" className="menu__action" onClick={() => pick(jsonInput)}>
              {t('importJson')}
            </button>
            <button type="button" className="menu__action" onClick={() => pick(excelInput)}>
              {t('importExcel')}
            </button>
            <button type="button" className="menu__action" onClick={() => run(onImportLinear)}>
              {t('importLinear')}
            </button>
            <button type="button" className="menu__action" onClick={() => run(onLoadExample)}>
              {t('loadExample')}
            </button>
            <button type="button" className="menu__action" onClick={() => run(() => onOpenAdapter('jira'))}>
              {t('importJira')}
            </button>
            <button type="button" className="menu__action" onClick={() => run(() => onOpenAdapter('trello'))}>
              {t('importTrello')}
            </button>
          </div>
          <div className="menu__rule" />
          <p className="menu__label">{t('recentFiles')}</p>
          <p className="menu__hint">{t('recentHint')}</p>
          {recentFiles.length === 0 ? (
            <p className="menu__note">{t('noRecentFiles')}</p>
          ) : (
            <ul className="menu__recent">
              {recentFiles.map((file) => (
                <li key={`${file.name}-${file.importedAt}`}>
                  <span>{file.name}</span>
                  <time dateTime={file.importedAt}>{formatRecent(file.importedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </Menu>
        <Menu
          id={`${baseId}-export`}
          label={t('export')}
          open={openMenu === 'export'}
          onToggle={() => toggle('export')}
        >
          <div className="menu__actions">
            <button type="button" className="menu__action" onClick={() => run(onExportPng)}>
              {t('exportImage')}
            </button>
          </div>
          <p className="menu__hint">{t('pngNote')}</p>
          <div className="menu__actions">
            <button type="button" className="menu__action" onClick={() => run(() => onExportCsv('all'))}>
              {t('exportRaw')}
            </button>
            <button type="button" className="menu__action" onClick={() => run(() => onExportCsv('filtered'))}>
              {t('exportFiltered')}
            </button>
          </div>
        </Menu>
        <Menu
          id={`${baseId}-settings`}
          label={t('settings')}
          open={openMenu === 'settings'}
          onToggle={() => toggle('settings')}
        >
          <div className="menu__field">
            <p className="menu__label">{t('theme')}</p>
            <div className="segment" role="group" aria-label={t('theme')}>
              <SegmentButton pressed={theme === 'light'} onClick={() => onTheme('light')}>
                {t('light')}
              </SegmentButton>
              <SegmentButton pressed={theme === 'dark'} onClick={() => onTheme('dark')}>
                {t('dark')}
              </SegmentButton>
            </div>
          </div>
          <LinearSettingsFields />
        </Menu>
      </div>
      <SourceSwitcher
        sources={sources}
        activeSourceId={activeSourceId}
        activeLabel={datasetName}
        ariaLabel={t('sourceSwitcher')}
        busy={sourceBusy === true || linearRefreshing}
        statusText={sourceStatusText}
        onSourceChange={onSourceChange}
      />
      {linearActive ? (
        <button
          type="button"
          className="topbar__refresh"
          onClick={onRefreshLinear}
          disabled={linearRefreshing || sourceBusy === true}
          aria-busy={linearRefreshing || sourceBusy === true}
          title={refreshLabel}
          aria-label={refreshLabel}
        >
          {linearRefreshing ? t('linearRefreshing') : t('linearRefresh')}
        </button>
      ) : null}
      <button
        type="button"
        className="topbar__filters"
        aria-pressed={filtersOpen}
        aria-controls="filter-panel"
        onClick={onToggleFilters}
      >
        {t('filters')}
      </button>
      <input
        ref={csvInput}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => takeFile(event, onImportCsv)}
      />
      <input
        ref={jsonInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => takeFile(event, onImportJson)}
      />
      <input
        ref={excelInput}
        type="file"
        accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(event) => takeFile(event, onImportExcel)}
      />
    </div>
  )
}

function formatRecent(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(UI_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function refreshTitle(t: (key: MessageKey) => string, fetchedAt: string | undefined): string {
  if (!fetchedAt) return t('linearRefresh')
  return t('linearFetchedAt').replace('{0}', formatRecent(fetchedAt))
}

function Menu({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="menu">
      <button type="button" className="menu__button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {label}
      </button>
      {open ? (
        <div className="menu__panel" id={id} role="region" aria-label={label}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

function SegmentButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="segment__button" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}
