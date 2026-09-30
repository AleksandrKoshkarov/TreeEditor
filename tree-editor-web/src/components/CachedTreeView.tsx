import { memo } from "react"
import type { CacheRow } from "@/domain/cache"

type Props = {
  rows: CacheRow[]
  selectedId: string | null
  onSelect: (id: string, value: string) => void
}

export const CachedTreeView = memo(function CachedTreeView({ rows, selectedId, onSelect }: Props) {
  return (
    <div className="max-h-[390px] min-h-[220px] flex-1 overflow-auto p-2">
      {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">The cache is empty. Select a node on the left and load it.</p>}
      {rows.map((row) => {
        if (row.kind === "placeholder") return (
          <div key={row.id} title={row.id} style={{ paddingLeft: row.depth * 20 + 12 }}
            className="min-w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground">
            Node not loaded <span className="text-xs">({row.id})</span>
          </div>
        )
        const { node, depth } = row
        return (
          <button key={node.id} type="button" onClick={() => onSelect(node.id, node.value)} style={{ paddingLeft: depth * 20 + 12 }}
            className={`flex min-w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted/50 ${selectedId === node.id ? "bg-accent" : ""}`}>
            <span className={node.status === "deleted" ? "text-muted-foreground line-through" : ""}>{node.value}</span>
            {node.status !== "clean" && <span className={`rounded px-1.5 py-0.5 text-[10px] ${node.status === "deleted" ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}>{node.status}</span>}
          </button>
        )
      })}
    </div>
  )
})
