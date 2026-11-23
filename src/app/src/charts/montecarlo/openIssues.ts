import { activeStageIndex } from '../../domain/cycleTime.ts'
import { calendarDayNumber } from '../../domain/dates.ts'
import type { WorkItem, WorkflowStage } from '../../domain/types.ts'
import { workflowBounds } from '../metrics.ts'

const EXCLUDED_STAGE_NAMES = new Set(['new', 'done'])

/**
 * Issues the When forecast may add, and the rows its source table lists.
 * An item counts when it has entered a workflow stage by `asOf`, has not entered
 * the last stage by that day, and its current stage is not New or Done.
 * Sub-issues are removed earlier by the shared include-sub-issues filter.
 * Rows still in New or Done stay out of this count only.
 */
export function openForecastIssues(
  items: readonly WorkItem[],
  stages: readonly WorkflowStage[],
  asOf: Date,
): WorkItem[] {
  const bounds = workflowBounds(stages)
  if (bounds === undefined) return []
  const asOfDay = calendarDayNumber(asOf)
  const open: WorkItem[] = []
  for (const item of items) {
    if (!enteredWorkflowBy(item, bounds.startIndex, stages.length, asOfDay)) continue
    if (enteredLastStageBy(item, bounds.doneIndex, asOfDay)) continue
    const stageIndex = activeStageIndex(item, asOf)
    if (stageIndex === undefined) continue
    const name = stages[stageIndex]?.name ?? ''
    if (EXCLUDED_STAGE_NAMES.has(name.trim().toLowerCase())) continue
    open.push(item)
  }
  return open
}

function enteredWorkflowBy(item: WorkItem, startIndex: number, stageCount: number, asOfDay: number): boolean {
  for (let index = startIndex; index < stageCount; index += 1) {
    const date = item.stageDates[index]
    if (date == null) continue
    if (calendarDayNumber(date) <= asOfDay) return true
  }
  return false
}

function enteredLastStageBy(item: WorkItem, doneIndex: number, asOfDay: number): boolean {
  const done = item.stageDates[doneIndex]
  return done != null && calendarDayNumber(done) <= asOfDay
}
