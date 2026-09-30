import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { CachedNode } from "@/domain/cache"

type Props = {
  node: CachedNode | null | undefined
  initialValue: string
  busy: boolean
  onSave: (value: string) => void
  onAdd: (value: string) => void
  onDelete: () => void
}

const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function NodeEditor({ node, initialValue, busy, onSave, onAdd, onDelete }: Props) {
  const [editValue, setEditValue] = useState(initialValue)
  const [childValue, setChildValue] = useState("")

  return (
    <div className="space-y-3 border-t p-4">
      {!node ? <p className="text-sm text-muted-foreground">Select a cached node to edit.</p> : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{node.value}</span>
            <span className="text-xs text-muted-foreground">{node.status}</span>
          </div>
          {node.status === "deleted" ? (
            <p className="text-sm text-destructive">This node is marked as deleted and cannot be edited.</p>
          ) : (
            <>
              <form onSubmit={(event) => { event.preventDefault(); onSave(editValue) }} className="flex gap-2">
                <input aria-label="Node value" className={inputClass} maxLength={200} value={editValue} onChange={(event) => setEditValue(event.target.value)} disabled={busy} />
                <Button type="submit" variant="secondary" disabled={busy}>Save</Button>
              </form>
              <form onSubmit={(event) => { event.preventDefault(); onAdd(childValue) }} className="flex gap-2">
                <input aria-label="New child value" className={inputClass} maxLength={200} placeholder="New child node" value={childValue} onChange={(event) => setChildValue(event.target.value)} disabled={busy} />
                <Button type="submit" variant="outline" disabled={busy}>Add</Button>
              </form>
              <Button variant="destructive" disabled={busy} onClick={onDelete}>Delete subtree</Button>
            </>
          )}
        </>
      )}
    </div>
  )
}
