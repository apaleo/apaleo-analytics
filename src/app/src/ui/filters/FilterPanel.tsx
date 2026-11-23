import { Fragment, type ReactNode } from 'react'
import type { Dataset } from '../../domain/types.ts'
import { LINEAR_ATTRIBUTE_COLUMNS } from '../../data/linear/mapToDataset.ts'
import { useI18n } from '../i18n.tsx'
import { applySubIssueFilter } from '../../domain/subIssues.ts'
import { applyFilterState, attributeChoices, filterableAttributes, type FilterState } from './filterState.ts'

/** Where Include sub-issues sits among visible attribute blocks. `names.length` means after the fieldset. */
function subIssueSlot(names: readonly string[]): number {
  const projectAt = names.indexOf('Project')
  if (projectAt >= 0) return projectAt
  const priorityAt = names.indexOf('Priority')
  if (priorityAt >= 0) return priorityAt + 1
  const columnOrder: readonly string[] = LINEAR_ATTRIBUTE_COLUMNS
  const projectRank = columnOrder.indexOf('Project')
  const afterProject = names.findIndex((name) => {
    const rank = columnOrder.indexOf(name)
    return rank > projectRank
  })
  if (afterProject >= 0) return afterProject
  return names.length
}

export function FilterPanel({
  dataset,
  filters,
  includeSubIssues = false,
  onIncludeSubIssues,
  onChange,
  onClose,
}: {
  dataset: Dataset
  filters: FilterState
  includeSubIssues?: boolean
  onIncludeSubIssues: (include: boolean) => void
  onChange: (filters: FilterState) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const attributes = filterableAttributes(dataset)
    .map((attribute) => ({ attribute, choices: attributeChoices(dataset, attribute) }))
    .filter((entry) => entry.choices.length > 0)
  const shown = applySubIssueFilter(applyFilterState(dataset, filters).items, includeSubIssues).length
  const subIssueAt = subIssueSlot(attributes.map((entry) => entry.attribute))
  const subIssueControl: ReactNode = (
    <div className="filters__attribute">
      <label className="check">
        <input
          type="checkbox"
          checked={includeSubIssues}
          onChange={(event) => onIncludeSubIssues(event.target.checked)}
        />
        <span>{t('includeSubIssues')}</span>
      </label>
    </div>
  )

  const toggleStage = (name: string) => {
    const enabled = filters.enabledStages.includes(name)
    onChange({
      ...filters,
      enabledStages: enabled
        ? filters.enabledStages.filter((stage) => stage !== name)
        : [...filters.enabledStages, name],
    })
  }

  const toggleAttribute = (attribute: string, value: string) => {
    const current = filters.selectedAttributes[attribute] ?? []
    const nextValues = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    const selectedAttributes = { ...filters.selectedAttributes }
    if (nextValues.length === 0) delete selectedAttributes[attribute]
    else selectedAttributes[attribute] = nextValues
    onChange({ ...filters, selectedAttributes })
  }

  const clearAttribute = (attribute: string) => {
    const selectedAttributes = { ...filters.selectedAttributes }
    delete selectedAttributes[attribute]
    onChange({ ...filters, selectedAttributes })
  }

  return (
    <div className="filters" id="filter-panel">
      <div className="filters__header">
        <h2>{t('filters')}</h2>
        <button type="button" className="filters__close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      <p className="filters__count">
        <span className="filters__count-value">{shown}</span>
        <span className="filters__count-total">/ {dataset.items.length}</span>
        <span className="filters__count-label">{t('matchingItems')}</span>
      </p>

      {attributes.length === 0 ? null : (
        <fieldset className="filters__group">
          <legend className="filters__legend">{t('attributes')}</legend>
          <p className="filters__hint">{t('attributeHint')}</p>
          {attributes.map(({ attribute, choices }, index) => {
            const selected = filters.selectedAttributes[attribute] ?? []
            const block = (
              <div className="filters__attribute" key={attribute}>
                <p className="filters__attribute-name">{attribute}</p>
                {attribute === 'Labels' && selected.length > 0 ? (
                  <p className="filters__hint">{t('labelsMatchHint')}</p>
                ) : null}
                {selected.length === 0 ? null : (
                  <div className="filters__actions">
                    <button type="button" className="filters__text-button" onClick={() => clearAttribute(attribute)}>
                      {t('clear')}
                    </button>
                  </div>
                )}
                <div className="filters__choices">
                  {choices.map((choice) => (
                    <label className="check" key={choice}>
                      <input
                        type="checkbox"
                        checked={selected.includes(choice)}
                        onChange={() => toggleAttribute(attribute, choice)}
                      />
                      <span>{choice}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
            if (index !== subIssueAt) return block
            return (
              <Fragment key={attribute}>
                {subIssueControl}
                {block}
              </Fragment>
            )
          })}
        </fieldset>
      )}

      {attributes.length === 0 || subIssueAt === attributes.length ? subIssueControl : null}

      <fieldset className="filters__group">
        <legend className="filters__legend">{t('workflowStages')}</legend>
        <p className="filters__hint">{t('stageHint')}</p>
        <div className="filters__actions">
          <button
            type="button"
            className="filters__text-button"
            onClick={() =>
              onChange({ ...filters, enabledStages: dataset.metadata.stages.map((stage) => stage.name) })
            }
          >
            {t('all')}
          </button>
          <button type="button" className="filters__text-button" onClick={() => onChange({ ...filters, enabledStages: [] })}>
            {t('none')}
          </button>
        </div>
        <div className="filters__choices">
          {dataset.metadata.stages.map((stage) => (
            <label className="check" key={stage.name}>
              <input
                type="checkbox"
                checked={filters.enabledStages.includes(stage.name)}
                onChange={() => toggleStage(stage.name)}
              />
              <span>{stage.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
