namespace TreeEditor.Api;

public sealed class TreeNodeRow
{
    public Guid Id { get; set; }
    public Guid? ParentId { get; set; }
    public string Value { get; set; } = "";
    public bool HasChildren { get; set; }
}

public sealed record TreePage(IReadOnlyList<TreeNodeRow> Items, Guid? NextCursor);

public sealed record LoadedNode(Guid Id, Guid? ParentId, string Value, IReadOnlyList<Guid> AncestorIds);

public sealed class ApplyRequest
{
    public List<CreateNode> Creates { get; set; } = [];
    public List<UpdateNode> Updates { get; set; } = [];
    public List<Guid> Deletes { get; set; } = [];
}

public sealed record CreateNode(Guid Id, Guid ParentId, string Value);
public sealed record UpdateNode(Guid Id, string Value);

public sealed class TreeValidationException(string message) : Exception(message);
public sealed class TreeConflictException(string message) : Exception(message);
