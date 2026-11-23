import type { WorkItem, WorkflowStage } from './types.ts'

/** Selected values for one attribute column. An empty list matches no items. */
export interface AttributeFilter {
  attribute: string
  values: readonly string[]
}

/** Workflow after unchecked stages are removed, with item dates aligned to those stages. */
export interface ProjectedWorkflow {
  stages: WorkflowStage[]
  items: WorkItem[]
}

/**
 * Attribute filters.
 * Bracketed cells such as `[Feature|Bug]` split into separate values.
 * `Labels` matches only when every selected value is present (AND).
 * Every other attribute matches when any selected value is present (OR).
 * An empty value list matches no items.
 * Attribute filters choose items. They do not remove workflow stages.
 */
export function attributeValues(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length >= 2) {
    return trimmed
      .slice(1, -1)
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }
  return trimmed.length > 0 ? [trimmed] : []
}

export function matchesAttributeFilter(item: WorkItem, filter: AttributeFilter | undefined): boolean {
  if (filter === undefined) return true
  if (filter.values.length === 0) return false
  const raw = item.attributes[filter.attribute]
  if (raw === undefined) return false
  const values = attributeValues(raw)
  const matches = (selected: string) => values.some((value) => value.toUpperCase() === selected.toUpperCase())
  if (filter.attribute === 'Labels') return filter.values.every(matches)
  return filter.values.some(matches)
}

export function applyFilters(items: readonly WorkItem[], attributeFilter?: AttributeFilter): WorkItem[] {
  return items.filter((item) => matchesAttributeFilter(item, attributeFilter))
}

/**
 * Drops unchecked workflow columns.
 * Kept stages stay in board order. Each item keeps only the dates at those indexes.
 * Items stay even when every remaining date is null.
 * An empty enabled set yields no stages and an empty date array on every item.
 */
export function projectWorkflowStages(
  stages: readonly WorkflowStage[],
  items: readonly WorkItem[],
  enabledStageNames: readonly string[],
): ProjectedWorkflow {
  const enabled = new Set(enabledStageNames)
  const kept: { stage: WorkflowStage; index: number }[] = []
  stages.forEach((stage, index) => {
    if (enabled.has(stage.name)) kept.push({ stage, index })
  })
  return {
    stages: kept.map((entry) => entry.stage),
    items: items.map((item) => ({
      ...item,
      stageDates: kept.map((entry) => item.stageDates[entry.index] ?? null),
    })),
  }
}
