/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { applySubIssueFilter } from '../../domain/subIssues.ts'
import type { Dataset, WorkItem, WorkflowStage } from '../../domain/types.ts'
import { I18nProvider } from '../../ui/i18n.tsx'
import { MonteCarloWhenChart } from './MonteCarloWhenChart.tsx'

const stages: WorkflowStage[] = [
  { name: 'New', role: 'workflow' },
  { name: 'In Progress', role: 'workflow' },
  { name: 'Done', role: 'workflow' },
]

const asOf = new Date(2026, 0, 10)

function item(id: string, stageDates: (Date | null)[], parentId?: string): WorkItem {
  const row: WorkItem = { id, stageDates, blockedDays: 0, attributes: {} }
  if (parentId !== undefined) row.parentId = parentId
  return row
}

const dataset: Dataset = {
  metadata: {
    sourceName: 'File',
    idColumn: 'ID',
    stages,
    attributeColumns: [],
    dateOrder: 'ymd',
  },
  items: [],
  warnings: [],
}

const items = [
  item('PARENT', [new Date(2026, 0, 1), new Date(2026, 0, 2), null]),
  item('CHILD', [new Date(2026, 0, 1), new Date(2026, 0, 2), null], 'linear-parent'),
  item('NEW-ITEM', [new Date(2026, 0, 3), null, null]),
  item('DONE-ITEM', [new Date(2026, 0, 1), new Date(2026, 0, 2), asOf]),
]

describe('Monte Carlo When open table', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('hides the open rows until the count control opens them, and the checkbox only changes the forecast', () => {
    const host = mount(applySubIssueFilter(items, false))
    expect(host.textContent).toContain('Include 1 open items in workflow')
    expect(host.querySelector('#monte-carlo-open-items')).toBeNull()
    expect(host.textContent).not.toContain('CHILD')

    const button = host.querySelector('button.mc-open-count')
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const table = host.querySelector('#monte-carlo-open-items')
    expect(button?.getAttribute('aria-expanded')).toBe('true')
    expect(table?.textContent).toContain('PARENT')
    expect(table?.textContent).not.toContain('CHILD')
    expect(table?.textContent).not.toContain('NEW-ITEM')
    expect(table?.textContent).not.toContain('DONE-ITEM')
    expect(host.textContent).toContain('Forecasting 1 items (1 open + 0 extra).')

    const checkbox = host.querySelector('input[type="checkbox"]')
    act(() => {
      checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Forecasting 0 items (0 open + 0 extra).')
    expect(host.querySelector('#monte-carlo-open-items')?.textContent).toContain('PARENT')
  })

  it('includes a sub-issue in the open count and table when the shared filter is on, and still omits New and Done', () => {
    const host = mount(applySubIssueFilter(items, true))
    expect(host.textContent).toContain('Include 2 open items in workflow')
    const button = host.querySelector('button.mc-open-count')
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const table = host.querySelector('#monte-carlo-open-items')
    expect(table?.textContent).toContain('PARENT')
    expect(table?.textContent).toContain('CHILD')
    expect(table?.textContent).not.toContain('NEW-ITEM')
    expect(table?.textContent).not.toContain('DONE-ITEM')
  })
})

function mount(rows: readonly WorkItem[] = items): HTMLDivElement {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      createElement(I18nProvider, {
        children: createElement(MonteCarloWhenChart, { dataset, items: rows, stages, asOf }),
      }),
    )
  })
  return host
}
