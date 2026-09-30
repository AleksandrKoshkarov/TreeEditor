using Npgsql;

namespace TreeEditor.Api;

public sealed class Database(NpgsqlDataSource dataSource)
{
    /// <summary>Runs an operation using one connection and releases it afterward.</summary>
    /// <typeparam name="T">The operation result type.</typeparam>
    /// <param name="operation">The operation to execute within the session's lifetime.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The operation result.</returns>
    public async Task<T> ExecuteAsync<T>(Func<DbSession, Task<T>> operation, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        return await operation(new DbSession(connection));
    }

    /// <summary>
    /// Runs an operation in one transaction and commits on success.
    /// Disposal rolls back an uncommitted transaction if the operation fails.
    /// </summary>
    /// <param name="operation">The operation to execute within the session's lifetime.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>A task that completes when the transaction has been committed.</returns>
    public async Task ExecuteInTransactionAsync(Func<DbSession, Task> operation, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await operation(new DbSession(connection, transaction));
        await transaction.CommitAsync(ct);
    }
}
