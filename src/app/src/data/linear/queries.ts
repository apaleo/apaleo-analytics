/** Personal API keys call this endpoint directly. The browser is allowed by Linear's CORS policy. */
export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'

export const TEAMS_QUERY = `query LinearTeams($after: String) {
  teams(first: 50, after: $after) {
    nodes {
      id
      name
      parent { id name }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

/** Used when the API rejects `Team.parent` so a flat list still loads. */
export const TEAMS_FLAT_QUERY = `query LinearTeamsFlat($after: String) {
  teams(first: 50, after: $after) {
    nodes { id name }
    pageInfo { hasNextPage endCursor }
  }
}`

export const TEAM_STATES_QUERY = `query LinearTeamStates($id: String!, $after: String) {
  team(id: $id) {
    id
    name
    states(first: 50, after: $after) {
      nodes { id name type position }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const ISSUE_NODE_FIELDS = `id
        identifier
        url
        title
        createdAt
        updatedAt
        startedAt
        completedAt
        canceledAt
        archivedAt
        priorityLabel
        state { id name type }
        assignee { displayName }
        project { name }
        labels { nodes { name } }
        team { id name }`

function issueSelection(): string {
  return `pageInfo { hasNextPage endCursor }
      nodes {
        ${ISSUE_NODE_FIELDS}
        parent { id }
      }`
}

/**
 * First import, and the one refresh used when a snapshot has no `fetchedAt`.
 * Completed issues from local midnight of `$completedSince`, plus every issue
 * that is still open (`completedAt` null). Canceled issues usually have a null
 * `completedAt` and are dropped later.
 */
export const TEAM_ISSUES_QUERY = `query LinearTeamIssues($id: String!, $after: String, $completedSince: DateTimeOrDuration!) {
  team(id: $id) {
    id
    name
    issues(first: 25, after: $after, includeArchived: true, filter: { or: [ { completedAt: { gte: $completedSince } }, { completedAt: { null: true } } ] }) {
      ${issueSelection()}
    }
  }
}`

/**
 * Refresh after a successful sync. Issues changed after `$updatedSince`.
 * Archived and canceled instants are included so an auto-archive or cancel is
 * not missed when `updatedAt` stays put. This filter does not add every open issue.
 */
export const TEAM_ISSUES_UPDATED_QUERY = `query LinearTeamIssuesUpdated($id: String!, $after: String, $updatedSince: DateTimeOrDuration!) {
  team(id: $id) {
    id
    name
    issues(first: 25, after: $after, includeArchived: true, filter: { or: [ { updatedAt: { gt: $updatedSince } }, { archivedAt: { gt: $updatedSince } }, { canceledAt: { gt: $updatedSince } } ] }) {
      ${issueSelection()}
    }
  }
}`

/** Used when Linear rejects the `completedAt: { null: true }` predicate. The client then filters. */
export const TEAM_ISSUES_UNFILTERED_QUERY = `query LinearTeamIssues($id: String!, $after: String) {
  team(id: $id) {
    id
    name
    issues(first: 25, after: $after, includeArchived: true) {
      ${issueSelection()}
    }
  }
}`

/**
 * Parent links for issues already stored. A delta refresh does not return unchanged
 * issues, so this list is what writes `parentId` onto the saved rows.
 * `parent { identifier }` is the retry when Linear rejects `parent { id }`.
 */
export const ISSUE_PARENTS_QUERY = `query LinearIssueParents($id: String!, $after: String, $completedSince: DateTimeOrDuration!) {
  team(id: $id) {
    issues(first: 50, after: $after, includeArchived: true, filter: { or: [ { completedAt: { gte: $completedSince } }, { completedAt: { null: true } } ] }) {
      pageInfo { hasNextPage endCursor }
      nodes { identifier completedAt parent { id } }
    }
  }
}`

/** Used when Linear rejects the `completedAt: { null: true }` predicate. The client then filters. */
export const ISSUE_PARENTS_UNFILTERED_QUERY = `query LinearIssueParents($id: String!, $after: String) {
  team(id: $id) {
    issues(first: 50, after: $after, includeArchived: true) {
      pageInfo { hasNextPage endCursor }
      nodes { identifier completedAt parent { id } }
    }
  }
}`

export const ISSUE_HISTORY_QUERY = `query LinearIssueHistory($id: String!, $after: String) {
  issue(id: $id) {
    id
    history(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        fromState { id name }
        toState { id name }
      }
    }
  }
}`
