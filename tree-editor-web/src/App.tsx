import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { applyChanges, getChildren, getNode, resetTree } from "@/api/treeApi"
import type { DbNode } from "@/api/treeApi"
import { cacheReducer, flattenCache, getPending } from "@/domain/cache"
import { branchKey, flattenDb, rootKey, type Branch } from "@/domain/dbTree"
import { DbTreeView } from "@/components/DbTreeView"
import { CachedTreeView } from "@/components/CachedTreeView"
import { NodeEditor } from "@/components/NodeEditor"

export default function App() {
  const [cache, dispatch] = useReducer(cacheReducer, new Map())
  const [dbNodes, setDbNodes] = useState<Map<string, DbNode>>(new Map())
  const [branches, setBranches] = useState<Map<string, Branch>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedDbId, setSelectedDbId] = useState<string | null>(null)
  const [selectedCacheId, setSelectedCacheId] = useState<string | null>(null)
  const [editorSelection, setEditorSelection] = useState({ value: "", revision: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadingKeys = useRef(new Set<string>())
  const epoch = useRef(0)

  const loadPage = useCallback(async (parentId: string | null, after: string | null = null) => {
    const key = branchKey(parentId)
    if (loadingKeys.current.has(key)) return
    loadingKeys.current.add(key)
    const requestEpoch = epoch.current
    setBranches((previous) => {
      const next = new Map(previous)
      const branch = next.get(key) ?? { ids: [], nextCursor: null, loaded: false, loading: false }
      next.set(key, { ...branch, loading: true })
      return next
    })
    try {
      const page = await getChildren(parentId, after)
      if (requestEpoch !== epoch.current) return
      setDbNodes((previous) => {
        const next = new Map(previous)
        for (const node of page.items) next.set(node.id, node)
        return next
      })
      setBranches((previous) => {
        const next = new Map(previous)
        const oldIds = after ? (next.get(key)?.ids ?? []) : []
        next.set(key, {
          ids: [...oldIds, ...page.items.map((node) => node.id)],
          nextCursor: page.nextCursor,
          loaded: true,
          loading: false,
        })
        return next
      })
    } catch (cause) {
      if (requestEpoch === epoch.current) {
        setError(cause instanceof Error ? cause.message : "Failed to load the tree")
        setBranches((previous) => {
          const next = new Map(previous)
          const branch = next.get(key)
          if (branch) next.set(key, { ...branch, loading: false })
          return next
        })
      }
    } finally {
      loadingKeys.current.delete(key)
    }
  }, [])

  const refreshDb = useCallback(async () => {
    epoch.current += 1
    loadingKeys.current.clear()
    setDbNodes(new Map())
    setBranches(new Map())
    setExpanded(new Set())
    setSelectedDbId(null)
    await loadPage(null)
  }, [loadPage])

  useEffect(() => { queueMicrotask(() => { void loadPage(null) }) }, [loadPage])

  const dbRows = useMemo(() => flattenDb(dbNodes, branches, expanded), [dbNodes, branches, expanded])
  const cacheRows = useMemo(() => flattenCache(cache), [cache])
  const selectedCache = selectedCacheId ? cache.get(selectedCacheId) : null
  const pendingCount = useMemo(() => [...cache.values()].filter((node) => node.status !== "clean").length, [cache])
  const pending = pendingCount > 0

  const selectCache = useCallback((id: string, value: string) => {
    setSelectedCacheId(id)
    setEditorSelection((previous) => ({ value, revision: previous.revision + 1 }))
  }, [])

  const toggleDb = useCallback((node: DbNode) => {
    if (!node.hasChildren) return
    const isExpanded = expanded.has(node.id)
    setExpanded((previous) => {
      const next = new Set(previous)
      if (isExpanded) next.delete(node.id)
      else next.add(node.id)
      return next
    })
    if (!isExpanded && !branches.get(node.id)?.loaded) void loadPage(node.id)
  }, [expanded, branches, loadPage])

  const loadMore = useCallback((parentId: string | null) => {
    void loadPage(parentId, branches.get(branchKey(parentId))?.nextCursor)
  }, [branches, loadPage])

  async function loadIntoCache() {
    if (!selectedDbId || busy) return
    if (cache.has(selectedDbId)) {
      selectCache(selectedDbId, cache.get(selectedDbId)!.value)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const node = await getNode(selectedDbId)
      if (node.value.length > 200) {
        throw new Error("Cannot load the node: its value exceeds 200 characters")
      }
      dispatch({ type: "load", node })
      selectCache(node.id, node.value)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load the node")
    } finally {
      setBusy(false)
    }
  }

  function saveEdit(editValue: string) {
    if (!selectedCache || selectedCache.status === "deleted") return
    const value = editValue.trim()
    if (!value || value.length > 200) {
      setError("The value must contain between 1 and 200 characters")
      return
    }
    setError(null)
    dispatch({ type: "edit", id: selectedCache.id, value })
  }

  function addChild(childValue: string) {
    if (!selectedCache || selectedCache.status === "deleted") return
    const value = childValue.trim()
    if (!value || value.length > 200) {
      setError("The value must contain between 1 and 200 characters")
      return
    }
    const id = crypto.randomUUID()
    dispatch({ type: "add", parentId: selectedCache.id, id, value })
    selectCache(id, value)
    setError(null)
  }

  function deleteSelected() {
    if (!selectedCache || busy) return
    dispatch({ type: "delete", id: selectedCache.id })
    setError(null)
  }

  async function apply() {
    if (!pending || busy) return
    setBusy(true)
    setError(null)
    try {
      await applyChanges(getPending(cache))
      dispatch({ type: "applied" })
      if (selectedCache?.status === "deleted") setSelectedCacheId(null)
      await refreshDb()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to apply changes")
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    if (busy || (pending && !window.confirm("Reset the database and discard unsaved changes?"))) return
    setBusy(true)
    setError(null)
    try {
      await resetTree()
      dispatch({ type: "reset" })
      setSelectedCacheId(null)
      await refreshDb()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to reset the tree")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-7xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tree Editor</h1>
          <p className="mt-1 text-sm text-muted-foreground">Database and local cache — two independent tree views</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs">Pending changes: {pendingCount}</span>
          <Button onClick={() => void apply()} disabled={!pending || busy}>Apply</Button>
          <Button variant="outline" onClick={() => void reset()} disabled={busy}>Reset</Button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid min-h-[620px] gap-5 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col rounded-xl border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">DBTreeView</h2>
            <p className="text-xs text-muted-foreground">Data from PostgreSQL. Expand a branch and select a node.</p>
          </div>
          <DbTreeView rows={dbRows} expanded={expanded} selectedId={selectedDbId}
            loading={branches.get(rootKey)?.loading ?? false} onSelect={setSelectedDbId}
            onToggle={toggleDb} onLoadMore={loadMore} />
          <div className="border-t p-4">
            <Button onClick={() => void loadIntoCache()} disabled={!selectedDbId || busy}>Load into cache</Button>
            {selectedDbId && <span className="ml-3 text-xs text-muted-foreground">{cache.has(selectedDbId) ? "Already cached" : "Selected node only"}</span>}
          </div>
        </section>

        <section className="flex min-w-0 flex-col rounded-xl border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">CachedTreeView</h2>
            <p className="text-xs text-muted-foreground">Local changes are saved to the database when you click Apply.</p>
          </div>
          <CachedTreeView rows={cacheRows} selectedId={selectedCacheId} onSelect={selectCache} />
          <NodeEditor key={editorSelection.revision} node={selectedCache} initialValue={editorSelection.value}
            busy={busy} onSave={saveEdit} onAdd={addChild} onDelete={deleteSelected} />
        </section>
      </div>
    </main>
  )
}
