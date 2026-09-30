# Tree Editor

A tree editor with a lazy database view and a separate browser-local cache. Changes are sent to PostgreSQL only when **Apply** is clicked.

## Start

```sh
docker compose up --build
```

Open <http://localhost:8080>. Docker Compose starts PostgreSQL, the .NET API, and the React UI. To stop the application, run `docker compose down -v`.

The PostgreSQL image runs `db/01-schema.sql` and `db/02-seed.sql` only when its data volume is first created. The seed is a restaurant menu with 197 nodes, including 126 products, across five nesting levels: menu, category, subcategory, product group, and product. Its seven main categories are Beverages, Alcohol, Fast Food, Desserts, Hot Dishes, Salads, and Soups. **Reset** is an explicit exception: it replaces all rows with that original sample, including the same UUIDs.

For local development outside Docker, start PostgreSQL using the same schema and seed scripts, run `dotnet run --project TreeEditor.Api --launch-profile http`, then `npm install` and `npm run dev` in `tree-editor-web`. Development defaults in `TreeEditor.Api/appsettings.Development.json` use PostgreSQL at `localhost:5432` with database, username, and password `tree_editor`, and seed path `../db/02-seed.sql` relative to the API project directory. Override `ConnectionStrings__Tree` or `SeedSqlPath` if needed. Vite proxies `/api` to the API on port 5202.

## Data model and behavior

**Database schema.** PostgreSQL stores the tree as an adjacency list in `tree_nodes`: `id` is a UUID primary key; nullable `parent_id` references another row, with `NULL` identifying a root; `value` is text limited to 1–200 characters; nullable `deleted_at` records soft deletion. The API never changes the parent of an existing node. Reads exclude deleted rows, and a partial index on `(parent_id, id)` for active rows supports child lookup and pagination.

**Loading.** DBTreeView requests roots and expanded branches in pages of 50, using the last node ID as a cursor. Loading an element into the cache fetches that element plus its ancestor IDs, found by a recursive SQL query along its path to the root. Neither operation loads the entire tree.

**Local cache.** A browser-memory map keyed by UUID holds explicitly loaded and locally created nodes, their ancestor IDs, original values, and statuses (`clean`, `modified`, `new`, or `deleted`). CachedTreeView reconstructs the hierarchy from this metadata in any loading order; missing ancestors appear as non-editable placeholders until loaded. Editing, adding children, and deleting use only local state. Ancestor IDs let deletion mark cached descendants even across unloaded intermediate nodes and prevent further editing. New nodes receive UUIDs in the browser. Refreshing the page clears the cache.

**Rendering.** The database tree, cached tree, and editor are separate components. Tree components are memoized, and input drafts live in the editor, so typing does not rerender the trees. Lists still render all displayed rows; virtualization is a possible future improvement.

**Change set.** Apply sends only pending changes to `/api/apply`: `creates` contains `{ id, parentId, value }`, `updates` contains `{ id, value }`, and `deletes` contains the IDs of deleted subtree roots. Clean nodes and placeholders are omitted. Deleting a locally created node cancels its insertion; descendants of an already deleted ancestor need no separate deletion entry.

**Applying changes.** The API validates the change set and processes deletions, updates, and insertions in one transaction. A single recursive SQL query visits active descendants of all deletion roots, deduplicates overlapping subtrees, and sets their `deleted_at`, including descendants never loaded by the browser. Updates and inserts use array parameters to process each operation list in one SQL statement. Inserts are ordered parent-first within the change set and check that existing parents are active. The API does not fetch the affected subtrees or the full tree into memory. Any failure rolls back the transaction and preserves the pending cache changes. After success, deleted cache nodes are removed, remaining nodes become clean, and DBTreeView reloads its first root page.

**Reset.** Reset restores the seed in one transaction and clears the cache, asking for confirmation when changes are pending.

## Possible improvements

These are future improvements outside the current task scope.

**Soft-delete cleanup.** `deleted_at` preserves deletion history for auditing, but there is no periodic cleanup, so deleted rows accumulate indefinitely. A scheduled cleanup could remove rows after a retention period, for example 30 days:

```sql
DELETE FROM tree_nodes WHERE deleted_at < NOW() - INTERVAL '30 days';
```

Cleanup must respect the `parent_id` foreign key: a parent cannot be removed while retained children still reference it. The retention policy should account for this when purging deleted subtrees.

**Optimistic locking.** There is no conflict detection for concurrent edits: if two users edit the same node, the last successful update overwrites the earlier value. A future implementation could add a `version INT` or `updated_at` column, return it when loading a node, and require the expected version or timestamp in each update. The `UPDATE` would check that value and advance it on success; a mismatch would report a conflict so the user can reload and reconcile their changes.

## Checks

```sh
dotnet build TreeEditor.slnx
cd tree-editor-web
npm run build
npm test
```
