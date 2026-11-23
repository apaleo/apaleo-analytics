import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { loadExampleDataset } from '../../data/exampleDataset.ts'
import type { Dataset } from '../../domain/types.ts'
import { I18nProvider } from '../i18n.tsx'
import { FilterPanel } from './FilterPanel.tsx'
import { defaultFilterState } from './filterState.ts'

describe('FilterPanel', () => {
  function markup(dataset: Dataset, includeSubIssues = false): string {
    return renderToStaticMarkup(
      createElement(I18nProvider, {
        children: createElement(FilterPanel, {
          dataset,
          filters: defaultFilterState(dataset),
          includeSubIssues,
          onIncludeSubIssues: () => undefined,
          onChange: () => undefined,
          onClose: () => undefined,
        }),
      }),
    )
  }

  function orderOf(html: string, labels: string[]): number[] {
    return labels.map((label) => html.indexOf(label))
  }

  it('places Include sub-issues immediately before Project', () => {
    const html = markup(datasetWith(['State', 'Assignee', 'Priority', 'Project', 'Labels', 'Team']))
    const [state, assignee, priority, toggle, project, labels, team, stages] = orderOf(html, [
      '>State<',
      '>Assignee<',
      '>Priority<',
      'Include sub-issues',
      '>Project<',
      '>Labels<',
      '>Team<',
      '>Workflow stages<',
    ])
    expect(assignee).toBe(-1)
    expect(priority).toBe(-1)
    expect(state).toBeGreaterThan(-1)
    expect(toggle).toBeGreaterThan(state)
    expect(project).toBeGreaterThan(toggle)
    expect(labels).toBeGreaterThan(project)
    expect(team).toBeGreaterThan(labels)
    expect(stages).toBeGreaterThan(team)

    const control = html.slice(toggle - 120, toggle)
    expect(control).toContain('type="checkbox"')
    expect(control).not.toContain('checked')
    const checkedHtml = markup(datasetWith(['State', 'Project']), true)
    const checkedAt = checkedHtml.indexOf('Include sub-issues')
    expect(checkedHtml.slice(checkedAt - 120, checkedAt)).toContain('checked')
  })

  it('uses the Project slot when Project is absent', () => {
    const afterPriority = markup(datasetWith(['State', 'Priority', 'Labels']))
    const priorityHidden = orderOf(afterPriority, ['>State<', '>Priority<', 'Include sub-issues', '>Labels<'])
    expect(priorityHidden[1]).toBe(-1)
    expect(priorityHidden[2]).toBeGreaterThan(priorityHidden[0])
    expect(priorityHidden[3]).toBeGreaterThan(priorityHidden[2])

    const beforeLaterColumn = markup(datasetWith(['Type', 'Team', 'Class of Service']))
    const exampleOrder = orderOf(beforeLaterColumn, ['>Type<', 'Include sub-issues', '>Team<', '>Class of Service<'])
    expect(exampleOrder[1]).toBeGreaterThan(exampleOrder[0])
    expect(exampleOrder[2]).toBeGreaterThan(exampleOrder[1])
    expect(exampleOrder[3]).toBeGreaterThan(exampleOrder[2])

    const afterFieldset = markup(datasetWith(['Type']))
    const typeAt = afterFieldset.indexOf('>Type<')
    const toggleAt = afterFieldset.indexOf('Include sub-issues')
    const stagesAt = afterFieldset.indexOf('>Workflow stages<')
    const attributesClose = afterFieldset.indexOf('</fieldset>')
    expect(toggleAt).toBeGreaterThan(attributesClose)
    expect(toggleAt).toBeGreaterThan(typeAt)
    expect(stagesAt).toBeGreaterThan(toggleAt)
  })

  it('keeps Include sub-issues before workflow stages on the example sheet', () => {
    const html = markup(loadExampleDataset(new Date(2026, 10, 11)))
    const [type, toggle, team, stages] = orderOf(html, [
      '>Type<',
      'Include sub-issues',
      '>Team<',
      '>Workflow stages<',
    ])
    expect(toggle).toBeGreaterThan(type)
    expect(team).toBeGreaterThan(toggle)
    expect(stages).toBeGreaterThan(team)
  })
})

function datasetWith(attributeColumns: string[]): Dataset {
  return {
    metadata: {
      sourceName: 'Fixture',
      idColumn: 'ID',
      stages: [{ name: 'Done', role: 'workflow' }],
      attributeColumns,
      dateOrder: 'ymd',
    },
    items: [
      {
        id: '1',
        stageDates: [new Date(2026, 0, 2)],
        blockedDays: 0,
        attributes: Object.fromEntries(attributeColumns.map((name) => [name, `${name} value`])),
      },
    ],
    warnings: [],
  }
}
