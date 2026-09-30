import type { DbNode } from "../api/treeApi"

export type Branch = { ids: string[]; nextCursor: string | null; loading: boolean; loaded: boolean }
export type DbRow =
  | { kind: "node"; node: DbNode; depth: number }
  | { kind: "more"; parentId: string | null; depth: number; loading: boolean }

export const rootKey = "root"
export const branchKey = (id: string | null) => id ?? rootKey
export function flattenDb(nodes: Map<string, DbNode>, branches: Map<string, Branch>, expanded: Set<string>): DbRow[] {
  const rows: DbRow[] = []
  const stack: DbRow[] = []

  function pushBranch(parentId: string | null, depth: number) {
    const branch = branches.get(branchKey(parentId))
    if (!branch) return
    if (branch.nextCursor || branch.loading)
      stack.push({ kind: "more", parentId, depth, loading: branch.loading })
    for (let i = branch.ids.length - 1; i >= 0; i--) {
      const node = nodes.get(branch.ids[i])
      if (node) stack.push({ kind: "node", node, depth })
    }
  }

  pushBranch(null, 0)
  while (stack.length) {
    const row = stack.pop()!
    rows.push(row)
    if (row.kind === "node" && expanded.has(row.node.id))
      pushBranch(row.node.id, row.depth + 1)
  }
  return rows
}

