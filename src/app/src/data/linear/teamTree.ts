import type { LinearTeam } from './types.ts'

export interface LinearTeamNode {
  team: LinearTeam
  children: LinearTeamNode[]
}

function resolvedParent(team: LinearTeam, byId: ReadonlyMap<string, LinearTeam>): string | null {
  if (team.parentId === null || team.parentId === team.id || !byId.has(team.parentId)) return null
  const seen = new Set<string>()
  let cursor: string | null = team.parentId
  while (cursor !== null) {
    if (cursor === team.id) return null
    if (seen.has(cursor)) break
    seen.add(cursor)
    const parent = byId.get(cursor)
    if (parent === undefined || parent.parentId === null || !byId.has(parent.parentId)) break
    cursor = parent.parentId
  }
  return team.parentId
}

/**
 * Nests teams under their parent. A parent that is not in the list, or a cycle back to the team,
 * leaves that team at the root. Siblings are ordered by name.
 */
export function linearTeamTree(teams: readonly LinearTeam[]): LinearTeamNode[] {
  const byId = new Map(teams.map((team) => [team.id, team]))
  const byParent = new Map<string | null, LinearTeam[]>()
  for (const team of teams) {
    const parentId = resolvedParent(team, byId)
    const list = byParent.get(parentId) ?? []
    list.push(team)
    byParent.set(parentId, list)
  }

  const byName = (left: LinearTeam, right: LinearTeam) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.id.localeCompare(right.id)

  const build = (parentId: string | null, ancestors: ReadonlySet<string>): LinearTeamNode[] => {
    const siblings = (byParent.get(parentId) ?? []).slice().sort(byName)
    const nodes: LinearTeamNode[] = []
    for (const team of siblings) {
      if (ancestors.has(team.id)) continue
      const next = new Set(ancestors)
      next.add(team.id)
      nodes.push({ team, children: build(team.id, next) })
    }
    return nodes
  }

  return build(null, new Set())
}
