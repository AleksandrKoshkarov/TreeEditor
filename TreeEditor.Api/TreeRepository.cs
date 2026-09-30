namespace TreeEditor.Api;

public sealed class TreeRepository(Database database)
{
    private const int PageSize = 50;

    /// <summary>
    /// Retrieves up to 50 active direct children ordered by ID, without loading their subtrees.
    /// </summary>
    /// <param name="parentId">The parent ID, or null to retrieve root nodes.</param>
    /// <param name="after">The last ID from the previous page, or null for the first page.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>A page of nodes and a cursor when more children are available.</returns>
    public async Task<TreePage> GetChildrenAsync(Guid? parentId, Guid? after, CancellationToken ct)
    {
        var where = parentId is null ? "n.parent_id IS NULL" : "n.parent_id = @ParentId";
        if (after is not null) where += " AND n.id > @After";

        var sql = $"""
            SELECT n.id AS Id, n.parent_id AS ParentId, n.value AS Value,
                   EXISTS (SELECT 1 FROM tree_nodes c WHERE c.parent_id = n.id AND c.deleted_at IS NULL) AS HasChildren
            FROM tree_nodes n
            WHERE n.deleted_at IS NULL AND {where}
            ORDER BY n.id
            LIMIT {PageSize + 1}
            """;

        var rows = await database.ExecuteAsync(session => session.QueryAsync<TreeNodeRow>(
            sql, new { ParentId = parentId, After = after }, ct), ct);
        var hasMore = rows.Count > PageSize;
        if (hasMore) rows.RemoveAt(PageSize);
        return new TreePage(rows, hasMore ? rows[^1].Id : null);
    }

    /// <summary>
    /// Retrieves an active node and its ancestor IDs for placement in the local cache.
    /// </summary>
    /// <param name="id">The node ID.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The node with ancestor IDs ordered from root to parent, or null if unavailable.</returns>
    public async Task<LoadedNode?> GetNodeAsync(Guid id, CancellationToken ct)
    {
        return await database.ExecuteAsync<LoadedNode?>(async session =>
        {
            var node = await session.QuerySingleOrDefaultAsync<TreeNodeRow>(
                "SELECT id AS Id, parent_id AS ParentId, value AS Value FROM tree_nodes WHERE id = @Id AND deleted_at IS NULL",
                new { Id = id }, ct);
            if (node is null) return null;

            const string ancestorsSql = """
                WITH RECURSIVE ancestors AS (
                    SELECT id, parent_id, 0 AS depth FROM tree_nodes WHERE id = @Id
                    UNION ALL
                    SELECT p.id, p.parent_id, a.depth + 1
                    FROM tree_nodes p JOIN ancestors a ON p.id = a.parent_id
                )
                SELECT id FROM ancestors WHERE depth > 0 ORDER BY depth DESC
                """;
            var ancestors = await session.QueryAsync<Guid>(ancestorsSql, new { Id = id }, ct);
            return new LoadedNode(node.Id, node.ParentId, node.Value, ancestors);
        }, ct);
    }

    /// <summary>
    /// Applies subtree deletions, value updates, and parent-first insertions in one transaction.
    /// Descendants are soft-deleted inside PostgreSQL without loading the tree into memory.
    /// </summary>
    /// <param name="request">The change set containing creates, updates, and deletion root IDs.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>A task that completes when all changes have been committed.</returns>
    /// <exception cref="TreeValidationException">The change set is invalid or new nodes contain a parent cycle.</exception>
    /// <exception cref="TreeConflictException">A target node or an existing parent is unavailable.</exception>
    public async Task ApplyAsync(ApplyRequest request, CancellationToken ct)
    {
        ValidateRequest(request);
        await database.ExecuteInTransactionAsync(async session =>
        {
            await DeleteSubtreesAsync(session, request.Deletes, ct);
            await UpdateNodesAsync(session, request.Updates, ct);
            await CreateNodesAsync(session, request.Creates, ct);
        }, ct);
    }

    /// <summary>
    /// Replaces all tree nodes with the supplied seed data in one transaction.
    /// </summary>
    /// <param name="seedPath">The path to the SQL seed file.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>A task that completes when the seed data has been committed.</returns>
    public async Task ResetAsync(string seedPath, CancellationToken ct)
    {
        var seed = await File.ReadAllTextAsync(seedPath, ct);
        await database.ExecuteInTransactionAsync(async session =>
        {
            await session.ExecuteAsync("TRUNCATE TABLE tree_nodes", null, ct);
            await session.ExecuteAsync(seed, null, ct);
        }, ct);
    }

    private static async Task DeleteSubtreesAsync(
        DbSession session, IReadOnlyList<Guid> deletes, CancellationToken ct)
    {
        if (deletes.Count == 0) return;

        const string deleteSql = """
            WITH RECURSIVE roots AS (
                SELECT id FROM tree_nodes WHERE id = ANY(@Ids) AND deleted_at IS NULL
            ), descendants AS (
                SELECT id FROM roots
                UNION
                SELECT child.id FROM tree_nodes child
                JOIN descendants d ON child.parent_id = d.id
                WHERE child.deleted_at IS NULL
            ), updated AS (
                UPDATE tree_nodes node
                SET deleted_at = @Now
                WHERE node.id IN (SELECT id FROM descendants) AND node.deleted_at IS NULL
                  AND (SELECT COUNT(*) FROM roots) = cardinality(@Ids)
                RETURNING node.id
            )
            SELECT COUNT(*) FROM updated WHERE id = ANY(@Ids)
            """;

        // UNION visits overlapping subtrees only once. Check every requested root,
        // rather than the total affected count, which also includes descendants.
        var deletedRoots = await session.ExecuteScalarAsync<long>(deleteSql,
            new { Ids = deletes.ToArray(), Now = DateTime.UtcNow }, ct);
        if (deletedRoots != deletes.Count)
            throw new TreeConflictException("One or more nodes are unavailable for deletion.");
    }

    private static async Task UpdateNodesAsync(
        DbSession session, IReadOnlyList<UpdateNode> updates, CancellationToken ct)
    {
        if (updates.Count == 0) return;

        const string updateSql = """
            UPDATE tree_nodes node SET value = changes.value
            FROM unnest(@Ids::uuid[], @Values::text[]) AS changes(id, value)
            WHERE node.id = changes.id AND node.deleted_at IS NULL
            """;
        var affected = await session.ExecuteAsync(updateSql, new
        {
            Ids = updates.Select(node => node.Id).ToArray(),
            Values = updates.Select(node => node.Value).ToArray(),
        }, ct);
        if (affected != updates.Count)
            throw new TreeConflictException("One or more nodes are unavailable for editing.");
    }

    private static async Task CreateNodesAsync(
        DbSession session, IReadOnlyList<CreateNode> creates, CancellationToken ct)
    {
        if (creates.Count == 0) return;

        var newNodeIds = creates.Select(n => n.Id).ToHashSet();
        var nodesToInsert = OrderNodesForInsertion(creates, newNodeIds);
        var existingParentIds = creates.Select(n => n.ParentId)
            .Where(id => !newNodeIds.Contains(id)).Distinct().ToArray();
        await ValidateParentsAsync(session, existingParentIds, ct);

        await session.ExecuteAsync(
            """
            INSERT INTO tree_nodes(id, parent_id, value)
            SELECT id, parent_id, value
            FROM unnest(@Ids::uuid[], @ParentIds::uuid[], @Values::text[])
                WITH ORDINALITY AS nodes(id, parent_id, value, position)
            ORDER BY position
            """, new
            {
                Ids = nodesToInsert.Select(node => node.Id).ToArray(),
                ParentIds = nodesToInsert.Select(node => node.ParentId).ToArray(),
                Values = nodesToInsert.Select(node => node.Value).ToArray(),
            }, ct);
    }

    private static List<CreateNode> OrderNodesForInsertion(
        IReadOnlyList<CreateNode> creates, HashSet<Guid> newNodeIds)
    {
        var childrenByParent = new Dictionary<Guid, List<CreateNode>>();
        var nodesReadyToInsert = new Queue<CreateNode>();

        foreach (var node in creates)
        {
            if (!newNodeIds.Contains(node.ParentId))
            {
                nodesReadyToInsert.Enqueue(node);
                continue;
            }

            if (!childrenByParent.TryGetValue(node.ParentId, out var children))
            {
                children = [];
                childrenByParent.Add(node.ParentId, children);
            }
            children.Add(node);
        }

        var nodesToInsert = new List<CreateNode>(creates.Count);
        while (nodesReadyToInsert.TryDequeue(out var node))
        {
            nodesToInsert.Add(node);
            if (childrenByParent.TryGetValue(node.Id, out var children))
                foreach (var child in children) nodesReadyToInsert.Enqueue(child);
        }

        if (nodesToInsert.Count != creates.Count)
            throw new TreeValidationException("New nodes contain a parent cycle.");

        return nodesToInsert;
    }

    private static async Task ValidateParentsAsync(
        DbSession session, Guid[] parentIds, CancellationToken ct)
    {
        if (parentIds.Length == 0) return;

        var parentsAreActive = await session.ExecuteScalarAsync<bool>(
            """
            SELECT COUNT(*) = cardinality(@ParentIds)
            FROM tree_nodes
            WHERE id = ANY(@ParentIds) AND deleted_at IS NULL
            """,
            new { ParentIds = parentIds }, ct);

        if (!parentsAreActive)
            throw new TreeConflictException("One or more parents are unavailable.");
    }

    private static void ValidateRequest(ApplyRequest request)
    {
        if (request.Creates is null || request.Updates is null || request.Deletes is null)
            throw new TreeValidationException("Apply lists are required.");

        var ids = new HashSet<Guid>();
        foreach (var node in request.Creates)
        {
            if (!ids.Add(node.Id) || node.Id == Guid.Empty || node.ParentId == Guid.Empty)
                throw new TreeValidationException("Create IDs must be unique and non-empty.");
            ValidateValue(node.Value);
        }
        foreach (var node in request.Updates)
        {
            if (!ids.Add(node.Id) || node.Id == Guid.Empty)
                throw new TreeValidationException("An ID appears in multiple operations.");
            ValidateValue(node.Value);
        }
        foreach (var id in request.Deletes)
        {
            if (!ids.Add(id) || id == Guid.Empty)
                throw new TreeValidationException("An ID appears in multiple operations.");
        }
    }

    private static void ValidateValue(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 200)
            throw new TreeValidationException("Node value must contain 1 to 200 characters.");
    }
}
