import { describe, expect, it } from 'vitest'
import { linearTeamTree } from './teamTree.ts'
import type { LinearTeam } from './types.ts'

function team(id: string, name: string, parentId: string | null = null, parentName: string | null = null): LinearTeam {
  return { id, name, parentId, parentName }
}

describe('linear team tree', () => {
  it('nests a child under its parent and sorts siblings by name', () => {
    const tree = linearTeamTree([
      team('child', 'Mobile', 'platform', 'Platform'),
      team('other', 'Billing'),
      team('platform', 'Platform'),
    ])

    expect(tree.map((node) => node.team.name)).toEqual(['Billing', 'Platform'])
    expect(tree[1]?.children.map((node) => node.team.name)).toEqual(['Mobile'])
    expect(tree[0]?.children).toEqual([])
  })

  it('keeps a team at the root when its parent is missing or the link cycles', () => {
    const missingParent = linearTeamTree([team('solo', 'Solo', 'gone', 'Gone')])
    expect(missingParent.map((node) => node.team.id)).toEqual(['solo'])

    const cycled = linearTeamTree([
      team('a', 'A', 'b', 'B'),
      team('b', 'B', 'a', 'A'),
      team('child', 'Child', 'a', 'A'),
    ])
    expect(cycled.map((node) => node.team.id).sort()).toEqual(['a', 'b'])
    expect(cycled.find((node) => node.team.id === 'a')?.children.map((node) => node.team.id)).toEqual(['child'])
    expect(cycled.find((node) => node.team.id === 'b')?.children).toEqual([])
  })
})
