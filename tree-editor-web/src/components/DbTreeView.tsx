import { memo } from "react"
import { Button } from "@/components/ui/button"
import type { DbNode } from "@/api/treeApi"
import { branchKey, type DbRow } from "@/domain/dbTree"

type Props = {
  rows: DbRow[]
  expanded: Set<string>
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onToggle: (node: DbNode) => void
  onLoadMore: (parentId: string | null) => void
}

export const DbTreeView = memo(function DbTreeView({ rows, expanded, selectedId, loading, onSelect, onToggle, onLoadMore }: Props) {
  return (
    <div className="max-h-[520px] min-h-[280px] flex-1 overflow-auto p-2">
      {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">{loading ? "Loading…" : "No active nodes"}</p>}
      {rows.map((row) => row.kind === "more" ? (
        <div key={`more-${branchKey(row.parentId)}`} style={{ paddingLeft: row.depth * 20 + 8 }} className="py-1">
          <Button size="sm" variant="ghost" disabled={row.loading} onClick={() => onLoadMore(row.parentId)}>
            {row.loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : (
        <div key={row.node.id} style={{ paddingLeft: row.depth * 20 }} className="flex min-w-max items-center rounded-md hover:bg-muted/50">
          <Button size="icon-xs" variant="ghost" aria-label={expanded.has(row.node.id) ? "Collapse" : "Expand"} disabled={!row.node.hasChildren} onClick={() => onToggle(row.node)}>
            {row.node.hasChildren ? expanded.has(row.node.id) ? "▾" : "▸" : "·"}
          </Button>
          <button type="button" onClick={() => onSelect(row.node.id)} className={`min-w-0 flex-1 rounded px-2 py-1.5 text-left text-sm ${selectedId === row.node.id ? "bg-accent font-medium" : ""}`}>
            {row.node.value}
          </button>
        </div>
      ))}
    </div>
  )
})
