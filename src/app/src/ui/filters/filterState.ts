import { applyFilters, attributeValues, projectWorkflowStages } from '../../domain/filters.ts'
import type { AttributeFilter, ProjectedWorkflow } from '../../domain/filters.ts'
import type { Dataset } from '../../domain/types.ts'

/**
 * UI selections for the filtered workflow.
 * An attribute with no selected values is omitted and does not filter items.
 * Checked stages are the workflow shown on the charts. Unchecked stages are removed
 * from that workflow and from each item's dates. Items are kept.
 * An empty stage list removes every stage.
 */
export interface FilterState {
  selectedAttributes: Record<string, string[]>
  enabledStages: string[]
}

export function defaultFilterState(dataset: Dataset): FilterState {
  return {
    selectedAttributes: {},
    enabledStages: dataset.metadata.stages.map((stage) => stage.name),
  }
}

const FILTER_HIDDEN_ATTRIBUTES = new Set(['Assignee', 'Priority'])

export function filterableAttributes(dataset: Dataset): string[] {
  return dataset.metadata.attributeColumns.filter(
    (name) =>
      name.length > 0 && name !== dataset.metadata.blockedDaysColumn && !FILTER_HIDDEN_ATTRIBUTES.has(name),
  )
}

export function attributeChoices(dataset: Dataset, attribute: string): string[] {
  const values = distinctAttributeValues(dataset, attribute)
  if (attribute === 'State') return orderStateChoices(dataset, values)
  return values.sort(byName)
}

function distinctAttributeValues(dataset: Dataset, attribute: string): string[] {
  const values = new Set<string>()
  for (const item of dataset.items) {
    for (const value of attributeValues(item.attributes[attribute] ?? '')) values.add(value)
  }
  return [...values]
}

/** Stage names in workflow order, using the casing stored on items, then leftover values A–Z. */
function orderStateChoices(dataset: Dataset, values: readonly string[]): string[] {
  const used = new Set<string>()
  const ranked: string[] = []
  for (const stageName of dataset.metadata.stages.map((stage) => stage.name)) {
    const key = stageName.toUpperCase()
    if (used.has(key)) continue
    const exact = values.find((value) => value === stageName)
    const match = exact ?? values.find((value) => value.toUpperCase() === key)
    if (match === undefined) continue
    ranked.push(match)
    used.add(key)
  }
  const rest = values.filter((value) => !used.has(value.toUpperCase())).sort(byName)
  return [...ranked, ...rest]
}

function byName(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

/**
 * Keeps selections that still exist on `dataset`.
 * An empty stage list stays empty. If every selected stage disappeared, all stages are enabled
 * so a renamed board does not hide every item.
 */
export function retainFilterState(current: FilterState, dataset: Dataset): FilterState {
  const stageNames = new Set(dataset.metadata.stages.map((stage) => stage.name))
  const attributes = new Set(filterableAttributes(dataset))
  const selectedAttributes: Record<string, string[]> = {}
  for (const [attribute, values] of Object.entries(current.selectedAttributes)) {
    if (!attributes.has(attribute)) continue
    const choices = attributeChoices(dataset, attribute)
    const kept = values.filter((value) =>
      choices.some((choice) => choice.toUpperCase() === value.toUpperCase()),
    )
    if (kept.length > 0) selectedAttributes[attribute] = kept
  }
  const enabledStages = current.enabledStages.filter((name) => stageNames.has(name))
  if (current.enabledStages.length > 0 && enabledStages.length === 0) {
    return {
      selectedAttributes,
      enabledStages: dataset.metadata.stages.map((stage) => stage.name),
    }
  }
  return { selectedAttributes, enabledStages }
}

export function applyFilterState(dataset: Dataset, state: FilterState): ProjectedWorkflow {
  const projected = projectWorkflowStages(dataset.metadata.stages, dataset.items, state.enabledStages)
  const attributeFilters: AttributeFilter[] = Object.entries(state.selectedAttributes)
    .filter((entry) => entry[1].length > 0)
    .map(([attribute, values]) => ({ attribute, values }))

  return {
    stages: projected.stages,
    items: attributeFilters.reduce(
      (items, attributeFilter) => applyFilters(items, attributeFilter),
      projected.items,
    ),
  }
}
