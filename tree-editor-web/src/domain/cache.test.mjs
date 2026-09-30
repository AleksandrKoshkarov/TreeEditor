import assert from "node:assert/strict"
import test from "node:test"
import { cacheReducer, flattenCache, getPending } from "./cache.ts"

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const loaded = (n, parent, ancestors = []) => ({
  id: id(n), parentId: parent === null ? null : id(parent), value: `Node ${n}`,
  ancestorIds: ancestors.map(id),
})
const act = (cache, action) => cacheReducer(cache, action)

test("child loaded before parent attaches when parent arrives", () => {
  let cache = act(new Map(), { type: "load", node: loaded(3, 2, [1, 2]) })
  assert.deepEqual(flattenCache(cache).map((row) => [row.kind, row.depth]),
    [["placeholder", 0], ["placeholder", 1], ["node", 2]])
  cache = act(cache, { type: "load", node: loaded(2, 1, [1]) })
  assert.deepEqual(flattenCache(cache).map((row) => [row.kind, row.kind === "node" ? row.node.id : row.id, row.depth]),
    [["placeholder", id(1), 0], ["node", id(2), 1], ["node", id(3), 2]])
})

test("gaps preserve hierarchy in either load order without adding pending changes", () => {
  for (const nodes of [[loaded(1, null), loaded(4, 3, [1, 2, 3])],
    [loaded(4, 3, [1, 2, 3]), loaded(1, null)]]) {
    let cache = nodes.reduce((current, node) => act(current, { type: "load", node }), new Map())
    assert.deepEqual(flattenCache(cache).map((row) => [row.kind, row.depth]),
      [["node", 0], ["placeholder", 1], ["placeholder", 2], ["node", 3]])
    assert.equal(cache.size, 2)
    assert.deepEqual(getPending(cache), { creates: [], updates: [], deletes: [] })
    cache = act(cache, { type: "load", node: loaded(3, 2, [1, 2]) })
    cache = act(cache, { type: "load", node: loaded(2, 1, [1]) })
    assert.deepEqual(flattenCache(cache).map((row) => [row.kind, row.node?.id, row.depth]),
      [["node", id(1), 0], ["node", id(2), 1], ["node", id(3), 2], ["node", id(4), 3]])
  }
})

test("siblings share unloaded ancestors and placeholders disappear after deletion", () => {
  let cache = act(new Map(), { type: "load", node: loaded(3, 2, [1, 2]) })
  cache = act(cache, { type: "load", node: loaded(4, 2, [1, 2]) })
  assert.deepEqual(flattenCache(cache).map((row) => [row.kind, row.depth]),
    [["placeholder", 0], ["placeholder", 1], ["node", 2], ["node", 2]])
  cache = act(cache, { type: "delete", id: id(3) })
  cache = act(cache, { type: "delete", id: id(4) })
  cache = act(cache, { type: "applied" })
  assert.deepEqual(flattenCache(cache), [])
})

test("delete marks a cached descendant across an unloaded parent", () => {
  let cache = act(new Map(), { type: "load", node: loaded(1, null) })
  cache = act(cache, { type: "load", node: loaded(3, 2, [1, 2]) })
  cache = act(cache, { type: "delete", id: id(1) })
  assert.equal(cache.get(id(3)).status, "deleted")
  assert.deepEqual(getPending(cache).deletes, [id(1)])
  cache = act(cache, { type: "load", node: loaded(4, 3, [1, 2, 3]) })
  assert.equal(cache.get(id(4)).status, "deleted")
})

test("pending edits survive repeated loads and deleting a new subtree sends nothing", () => {
  let cache = act(new Map(), { type: "load", node: loaded(1, null) })
  cache = act(cache, { type: "edit", id: id(1), value: "Changed" })
  cache = act(cache, { type: "load", node: loaded(1, null) })
  assert.equal(cache.get(id(1)).value, "Changed")
  cache = act(cache, { type: "add", parentId: id(1), id: id(2), value: "New" })
  cache = act(cache, { type: "add", parentId: id(2), id: id(3), value: "Nested" })
  cache = act(cache, { type: "delete", id: id(2) })
  assert.equal(cache.has(id(2)), false)
  assert.equal(cache.has(id(3)), false)
  assert.deepEqual(getPending(cache), { creates: [], updates: [{ id: id(1), value: "Changed" }], deletes: [] })
})
