import type { Dataset, WorkItem, WorkflowStage } from '../../domain/types.ts'

/**
 * Upserts incoming work items by id and drops `dropIds`.
 * `fetchedAt` comes from the incoming export. `linearSince` stays on the original import.
 * The later closed-through day is kept for display.
 * Stages come from the incoming team export. Rows only in the previous dataset are
 * remapped onto those stage names.
 */
export function mergeDatasets(
  previous: Dataset,
  incoming: Dataset,
  options?: { dropIds?: readonly string[] },
): Dataset {
  const drop = new Set(options?.dropIds ?? [])
  const incomingById = new Map<string, WorkItem>()
  for (const item of incoming.items) {
    if (!drop.has(item.id)) incomingById.set(item.id, item)
  }

  const items: WorkItem[] = []
  const seen = new Set<string>()
  for (const item of previous.items) {
    if (drop.has(item.id)) continue
    const next = incomingById.get(item.id)
    if (next) {
      items.push(next)
      seen.add(item.id)
      continue
    }
    items.push(realignItem(item, previous.metadata.stages, incoming.metadata.stages))
  }
  for (const item of incoming.items) {
    if (seen.has(item.id) || drop.has(item.id)) continue
    items.push(item)
    seen.add(item.id)
  }

  const metadata: Dataset['metadata'] = {
    ...incoming.metadata,
    fetchedAt: incoming.metadata.fetchedAt ?? previous.metadata.fetchedAt,
  }
  const linearSince = previous.metadata.linearSince ?? incoming.metadata.linearSince
  if (linearSince === undefined) delete metadata.linearSince
  else metadata.linearSince = linearSince

  const linearClosedThrough = laterDay(previous.metadata.linearClosedThrough, incoming.metadata.linearClosedThrough)
  if (linearClosedThrough === undefined) delete metadata.linearClosedThrough
  else metadata.linearClosedThrough = linearClosedThrough

  return { metadata, items, warnings: [...incoming.warnings] }
}

function realignItem(item: WorkItem, fromStages: readonly WorkflowStage[], toStages: readonly WorkflowStage[]): WorkItem {
  if (
    fromStages.length === toStages.length &&
    fromStages.every((stage, index) => stage.name === toStages[index]?.name)
  ) {
    return item
  }
  const byName = new Map<string, Date | null>()
  fromStages.forEach((stage, index) => {
    byName.set(stage.name, item.stageDates[index] ?? null)
  })
  return {
    ...item,
    stageDates: toStages.map((stage) => byName.get(stage.name) ?? null),
  }
}

function laterDay(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return left >= right ? left : right
}
