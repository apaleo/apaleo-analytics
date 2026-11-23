import type { WorkItem } from './types.ts'

/** A sub-issue is a work item with a non-empty parent id. Blank and missing parents stay issues. */
export function isSubIssue(item: Pick<WorkItem, 'parentId'>): boolean {
  return typeof item.parentId === 'string' && item.parentId.trim().length > 0
}

/**
 * Shared workflow population. Off (the default) drops sub-issues.
 * On returns the same rows, including sub-issues.
 */
export function applySubIssueFilter<T extends Pick<WorkItem, 'parentId'>>(
  items: readonly T[],
  includeSubIssues: boolean,
): T[] {
  if (includeSubIssues) return items.slice()
  return items.filter((item) => !isSubIssue(item))
}
