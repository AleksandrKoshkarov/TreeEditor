export type DbNode = {
  id: string
  parentId: string | null
  value: string
  hasChildren: boolean
}

export type NodePage = {
  items: DbNode[]
  nextCursor: string | null
}

export type LoadedNode = {
  id: string
  parentId: string | null
  value: string
  ancestorIds: string[]
}

export type ApplyRequest = {
  creates: { id: string; parentId: string; value: string }[]
  updates: { id: string; value: string }[]
  deletes: string[]
}

async function check(response: Response): Promise<Response> {
  if (response.ok) return response
  const problem = await response.json().catch(() => null)
  throw new Error(problem?.detail ?? `HTTP ${response.status}`)
}

export async function getChildren(parentId: string | null, after?: string | null): Promise<NodePage> {
  const params = new URLSearchParams()
  if (parentId) params.set("parentId", parentId)
  if (after) params.set("after", after)
  const response = await check(await fetch(`/api/nodes?${params}`))
  return response.json()
}

export async function getNode(id: string): Promise<LoadedNode> {
  const response = await check(await fetch(`/api/nodes/${id}`))
  return response.json()
}

export async function applyChanges(payload: ApplyRequest): Promise<void> {
  await check(await fetch("/api/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
}

export async function resetTree(): Promise<void> {
  await check(await fetch("/api/reset", { method: "POST" }))
}
