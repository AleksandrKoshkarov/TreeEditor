import type { ApplyRequest, LoadedNode } from "../api/treeApi.ts"

export type CacheStatus = "clean" | "modified" | "new" | "deleted"
export type CachedNode = LoadedNode & {
  originalValue: string
  status: CacheStatus
}
export type Cache = Map<string, CachedNode>

export type CacheAction =
  | { type: "load"; node: LoadedNode }
  | { type: "edit"; id: string; value: string }
  | { type: "add"; parentId: string; id: string; value: string }
  | { type: "delete"; id: string }
  | { type: "applied" }
  | { type: "reset" }

export function cacheReducer(cache: Cache, action: CacheAction): Cache {
  if (action.type === "reset") return new Map()

  if (action.type === "applied") {
    const next: Cache = new Map()
    for (const node of cache.values()) {
      if (node.status !== "deleted") {
        next.set(node.id, { ...node, status: "clean", originalValue: node.value })
      }
    }
    return next
  }

  const next = new Map(cache)

  if (action.type === "load") {
    if (next.has(action.node.id)) return cache
    const deletedAncestor = action.node.ancestorIds.some(
      (id) => next.get(id)?.status === "deleted",
    )
    next.set(action.node.id, {
      ...action.node,
      originalValue: action.node.value,
      status: deletedAncestor ? "deleted" : "clean",
    })
  }

  if (action.type === "edit") {
    const node = next.get(action.id)
    if (!node || node.status === "deleted") return cache
    next.set(action.id, {
      ...node,
      value: action.value,
      status: node.status === "new" ? "new" : action.value === node.originalValue ? "clean" : "modified",
    })
  }

  if (action.type === "add") {
    const parent = next.get(action.parentId)
    if (!parent || parent.status === "deleted" || next.has(action.id)) return cache
    next.set(action.id, {
      id: action.id,
      parentId: parent.id,
      ancestorIds: [...parent.ancestorIds, parent.id],
      value: action.value,
      originalValue: "",
      status: "new",
    })
  }

  if (action.type === "delete") {
    const target = next.get(action.id)
    if (!target || target.status === "deleted") return cache
    for (const node of next.values()) {
      if (node.id !== target.id && !node.ancestorIds.includes(target.id)) continue
      if (node.status === "new") next.delete(node.id)
      else next.set(node.id, { ...node, status: "deleted" })
    }
  }

  return next
}

export function getPending(cache: Cache): ApplyRequest {
  const creates: ApplyRequest["creates"] = []
  const updates: ApplyRequest["updates"] = []
  const deletes: ApplyRequest["deletes"] = []

  for (const node of cache.values()) {
    if (node.status === "new") {
      if (node.parentId) creates.push({ id: node.id, parentId: node.parentId, value: node.value })
    } else if (node.status === "modified") {
      updates.push({ id: node.id, value: node.value })
    } else if (node.status === "deleted" &&
      !node.ancestorIds.some((id) => cache.get(id)?.status === "deleted")) {
      deletes.push(node.id)
    }
  }

  return { creates, updates, deletes }
}

export function hasPending(cache: Cache): boolean {
  for (const node of cache.values()) if (node.status !== "clean") return true
  return false
}

export type CacheRow =
  | { kind: "node"; node: CachedNode; depth: number }
  | { kind: "placeholder"; id: string; depth: number }

export function flattenCache(cache: Cache): CacheRow[] {
  // Ancestor metadata supplies the missing links without loading their values.
  // These entries exist only in the view; they never become editable cache nodes.
  const parents = new Map<string, string | null>()
  for (const node of cache.values()) {
    let parentId: string | null = null
    for (const id of node.ancestorIds) {
      parents.set(id, parentId)
      parentId = id
    }
    parents.set(node.id, node.parentId)
  }

  const roots: string[] = []
  const children = new Map<string, string[]>()
  for (const [id, parentId] of parents) {
    if (parentId !== null && parents.has(parentId)) {
      const group = children.get(parentId) ?? []
      group.push(id)
      children.set(parentId, group)
    } else roots.push(id)
  }

  const rows: CacheRow[] = []
  const stack = roots.toReversed().map((id) => ({ id, depth: 0 }))
  while (stack.length) {
    const item = stack.pop()!
    const node = cache.get(item.id)
    rows.push(node
      ? { kind: "node", node, depth: item.depth }
      : { kind: "placeholder", id: item.id, depth: item.depth })
    const descendants = children.get(item.id) ?? []
    for (let i = descendants.length - 1; i >= 0; i--)
      stack.push({ id: descendants[i], depth: item.depth + 1 })
  }
  return rows
}
