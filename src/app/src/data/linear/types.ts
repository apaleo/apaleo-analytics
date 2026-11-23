/** Team row from the Linear `teams` connection, including a parent when the API sends one. */
export interface LinearTeam {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
}

export interface LinearWorkflowState {
  id: string
  name: string
  /** Linear workflow state type, such as `backlog`, `started`, or `canceled`. */
  type: string
  position: number
}

export interface LinearStateRef {
  id: string
  name: string
}

/** One issue history node that may record a state transition. */
export interface LinearHistoryEntry {
  createdAt: string
  fromState: LinearStateRef | null
  toState: LinearStateRef | null
}

export interface LinearIssue {
  id: string
  identifier: string
  url: string
  title: string
  createdAt: string
  updatedAt?: string | null
  startedAt: string | null
  completedAt: string | null
  canceledAt: string | null
  archivedAt?: string | null
  priorityLabel: string
  state: { id: string; name: string; type: string } | null
  assignee: { displayName: string } | null
  project: { name: string } | null
  labels: string[]
  team: { id: string; name: string } | null
  /** Linear parent issue id. Null when the issue has no parent or the field was not loaded. */
  parentId: string | null
  history: LinearHistoryEntry[]
}

/** One team, its workflow states, and the issues exported for that team id. */
export interface LinearTeamBundle {
  teamId: string
  teamName: string
  states: LinearWorkflowState[]
  issues: LinearIssue[]
}
