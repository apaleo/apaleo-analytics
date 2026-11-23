import { Children, createElement, isValidElement, type ChangeEvent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StoredSourceMeta } from '../../persistence/datasetStore.ts'
import { TopBar } from '../layout/TopBar.tsx'
import { SourceSwitcher } from '../layout/SourceSwitcher.tsx'
import { I18nProvider } from '../i18n.tsx'
import { ThemeProvider, type ThemeName } from '../theme.tsx'
import { defaultLinearSince } from '../../data/linear/since.ts'
import type { LinearTeam } from '../../data/linear/types.ts'
import { linearExportFillPercent, TeamPickerDialog, TeamPickerView } from './TeamPickerDialog.tsx'

describe('Linear shell', () => {
  it('links to create a Linear API key from Settings', () => {
    const html = renderShell(createElement(TopBar, { ...barProps(), initialMenu: 'settings' }))

    expect(html).toContain('Linear API key')
    expect(html).toContain('>Create API key<')
    expect(html).toContain('href="https://linear.app/apaleocom/settings/account/security/api-keys/new"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('shows Linear in the Data menu and Refresh when that source is active', () => {
    const html = renderShell(
      createElement(TopBar, {
        ...barProps(),
        initialMenu: 'data',
        linearActive: true,
        linearRefreshing: false,
        linearFetchedAt: '2026-11-11T10:00:00.000Z',
      }),
    )

    expect(html).toContain('Linear…')
    expect(html).toContain('>Jira<')
    expect(html).toContain('>Trello<')
    expect(html).toContain('>Refresh<')
    expect(html).toContain('Issues updated after')
    expect(html).not.toContain('Closed through')
    expect(html).not.toContain('Refreshing…')
  })

  it('hides Refresh for a file dataset and shows a busy refresh label', () => {
    const idle = renderShell(createElement(TopBar, { ...barProps(), linearActive: false }))
    expect(idle).not.toContain('>Refresh<')
    expect(idle).not.toContain('Include sub-issues')

    const busy = renderShell(createElement(TopBar, { ...barProps(), linearActive: true, linearRefreshing: true }))
    expect(busy).toContain('Refreshing…')
    expect(busy).toContain('disabled')
  })

  it('lists stored sources in the header and reports the chosen id', () => {
    const html = renderShell(
      createElement(TopBar, {
        ...barProps(),
        sourceBusy: true,
        sourceStatusText: 'Switching…',
      }),
    )
    expect(html).toContain('aria-label="Stored datasets"')
    expect(html).toContain('value="example"')
    expect(html).toContain('value="linear:team-1"')
    expect(html).toContain('Example Data')
    expect(html).toContain('Linear · Platform')
    expect(html).toContain('Switching…')

    let chosen = ''
    const element = SourceSwitcher({
      sources: storedSources,
      activeSourceId: 'linear:team-1',
      activeLabel: 'Linear · Platform',
      ariaLabel: 'Stored datasets',
      busy: false,
      onSourceChange: (id: string) => {
        chosen = id
      },
    })
    const select = Children.toArray(element.props.children).find(
      (child) => isValidElement(child) && child.type === 'select',
    )
    if (!isValidElement<{ onChange?: (event: ChangeEvent<HTMLSelectElement>) => void }>(select)) {
      throw new Error('source select missing')
    }
    select.props.onChange?.({ target: { value: 'example' } } as ChangeEvent<HTMLSelectElement>)
    expect(chosen).toBe('example')
  })

  it('opens the team picker without an exclude-canceled checkbox', () => {
    const html = renderToStaticMarkup(
      createElement(I18nProvider, {
        children: createElement(TeamPickerDialog, {
          apiKey: 'lin_api_test',
          onClose: () => undefined,
          onImported: () => Promise.resolve({ ok: true as const }),
        }),
      }),
    )
    expect(html).toContain('Choose a Linear team')
    expect(html).toContain('Canceled, duplicate, and triage issues are left out.')
    expect(html).toContain('Load issues since')
    expect(html).toContain('Open issues are always included.')
    expect(html).toContain('type="date"')
    expect(html).toContain(`value="${defaultLinearSince()}"`)
    expect(html).not.toContain('Exclude canceled issues')
    expect(html).not.toContain('type="checkbox"')
    expect(html).toContain('Loading teams…')
    expect(html).toContain('Load team')
  })

  it('hides the picker and shows an indeterminate progress bar before the first count', () => {
    const html = renderPicker({ exporting: true, loadedIssues: 0, teamName: 'Platform' })

    expect(html).toContain('Exporting from Linear')
    expect(html).toContain('Linear · Platform')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('linear-progress--indeterminate')
    expect(html).toContain('aria-valuetext="Exporting issues… 0 loaded."')
    expect(html).not.toContain('aria-valuenow')
    expect(html).toContain('>Close<')
    expect(html).not.toContain('type="radio"')
    expect(html).not.toContain('type="date"')
    expect(html).not.toContain('Pick a parent team')
    expect(html).not.toContain('>Load team<')
  })

  it('fills the progress bar from the loaded issue count', () => {
    const html = renderPicker({ exporting: true, loadedIssues: 400, teamName: 'Platform' })
    const fill = linearExportFillPercent(400)

    expect(fill).toBeGreaterThan(60)
    expect(fill).toBeLessThan(95)
    expect(linearExportFillPercent(0)).toBe(0)
    expect(linearExportFillPercent(40_000)).toBe(95)
    expect(html).toContain('aria-valuenow="400"')
    expect(html).toContain('400 loaded')
    expect(html).toContain(`width:${fill}%`)
    expect(html).not.toContain('linear-progress--indeterminate')
    expect(html).not.toContain('type="radio"')
  })

  it('restores the picker and shows the error when export is not running', () => {
    const html = renderPicker({ exporting: false, error: 'invalid API key' })

    expect(html).toContain('Choose a Linear team')
    expect(html).toContain('The Linear API key was rejected. Check the key in Settings.')
    expect(html).toContain('Pick a parent team')
    expect(html).toContain('type="radio"')
    expect(html).toContain('type="date"')
    expect(html).toContain('Load issues since')
    expect(html).toContain('>Load team<')
    expect(html).not.toContain('progressbar')
    expect(html).not.toContain('type="checkbox"')
  })
})

const platformTeam: LinearTeam = { id: 'team-1', name: 'Platform', parentId: null, parentName: null }

function renderPicker(options: {
  exporting?: boolean
  loadedIssues?: number
  teamName?: string | null
  error?: string | null
}): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      children: createElement(TeamPickerView, {
        exporting: options.exporting ?? false,
        loadedIssues: options.loadedIssues ?? 0,
        teamName: options.teamName ?? null,
        teams: [platformTeam],
        selectedId: platformTeam.id,
        since: defaultLinearSince(),
        sinceValid: true,
        error: options.error ?? null,
        onClose: () => undefined,
        onSelect: () => undefined,
        onSince: () => undefined,
        onConfirm: () => undefined,
      }),
    }),
  )
}

function renderShell(child: ReactNode): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      theme: 'light' satisfies ThemeName,
      children: createElement(I18nProvider, {
        children: child,
      }),
    }),
  )
}

const storedSources: StoredSourceMeta[] = [
  {
    id: 'linear:team-1',
    label: 'Linear · Platform',
    sourceKind: 'linear',
    linearTeamId: 'team-1',
    linearClosedThrough: '2026-10-20',
    updatedAt: '2026-11-11T10:00:00.000Z',
    lastActiveAt: '2026-11-11T10:00:00.000Z',
  },
]

function barProps() {
  return {
    datasetName: 'Linear · Platform',
    sources: storedSources,
    activeSourceId: 'linear:team-1',
    onSourceChange: () => undefined,
    itemCount: 3,
    exampleLoaded: false,
    recentFiles: [],
    onTheme: () => undefined,
    filtersOpen: true,
    onToggleFilters: () => undefined,
    onImportCsv: () => undefined,
    onImportJson: () => undefined,
    onImportExcel: () => undefined,
    onLoadExample: () => undefined,
    onOpenAdapter: () => undefined,
    onImportLinear: () => undefined,
    onRefreshLinear: () => undefined,
    linearActive: false,
    linearRefreshing: false,
    onExportCsv: () => undefined,
    onExportPng: () => undefined,
  }
}
