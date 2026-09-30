using Npgsql;

namespace TreeEditor.Api;

public static class TreeEndpoints
{
    /// <summary>
    /// Registers the health check and tree endpoints for browsing, loading, applying changes, and resetting.
    /// </summary>
    /// <param name="endpoints">The route builder on which to register the endpoints.</param>
    /// <returns>The supplied route builder.</returns>
    public static IEndpointRouteBuilder MapTreeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/health", GetHealth);
        endpoints.MapGet("/api/nodes", GetChildrenAsync);
        endpoints.MapGet("/api/nodes/{id:guid}", GetNodeAsync);
        endpoints.MapPost("/api/apply", ApplyAsync);
        endpoints.MapPost("/api/reset", ResetAsync);

        return endpoints;
    }

    private static IResult GetHealth() => Results.Ok(new { status = "ok" });

    private static async Task<IResult> GetChildrenAsync(Guid? parentId, Guid? after, TreeRepository repo, CancellationToken ct) =>
        Results.Ok(await repo.GetChildrenAsync(parentId, after, ct));

    private static async Task<IResult> GetNodeAsync(Guid id, TreeRepository repo, CancellationToken ct)
    {
        var node = await repo.GetNodeAsync(id, ct);
        return node is null ? Results.NotFound() : Results.Ok(node);
    }

    private static async Task<IResult> ApplyAsync(ApplyRequest request, TreeRepository repo, CancellationToken ct)
    {
        try
        {
            await repo.ApplyAsync(request, ct);
            return Results.NoContent();
        }
        catch (TreeValidationException ex)
        {
            return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }
        catch (TreeConflictException ex)
        {
            return Results.Problem(ex.Message, statusCode: StatusCodes.Status409Conflict);
        }
        catch (PostgresException ex) when (ex.SqlState is PostgresErrorCodes.UniqueViolation or PostgresErrorCodes.ForeignKeyViolation)
        {
            return Results.Problem("A node ID already exists or a parent is unavailable.", statusCode: StatusCodes.Status409Conflict);
        }
    }

    private static async Task<IResult> ResetAsync(TreeRepository repo, IConfiguration configuration, CancellationToken ct)
    {
        var seedPath = configuration["SeedSqlPath"] ?? "../db/02-seed.sql";
        await repo.ResetAsync(seedPath, ct);
        return Results.NoContent();
    }
}
