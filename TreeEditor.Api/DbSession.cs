using Dapper;
using Npgsql;

namespace TreeEditor.Api;

/// <summary>
/// Executes SQL on the connection and optional transaction owned by Database.
/// The session must only be used inside the operation supplied to Database.
/// </summary>
public sealed class DbSession
{
    private readonly NpgsqlConnection connection;
    private readonly NpgsqlTransaction? transaction;

    internal DbSession(NpgsqlConnection connection, NpgsqlTransaction? transaction = null)
    {
        this.connection = connection;
        this.transaction = transaction;
    }

    /// <summary>Executes SQL and returns the number of affected rows.</summary>
    /// <param name="sql">The SQL command.</param>
    /// <param name="parameters">The named SQL parameters, or null.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The number of affected rows.</returns>
    public Task<int> ExecuteAsync(string sql, object? parameters, CancellationToken ct) =>
        connection.ExecuteAsync(CreateCommand(sql, parameters, ct));

    /// <summary>Executes a query and materializes its rows as a list.</summary>
    /// <typeparam name="T">The row type.</typeparam>
    /// <param name="sql">The SQL query.</param>
    /// <param name="parameters">The named SQL parameters, or null.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The materialized query results.</returns>
    public async Task<List<T>> QueryAsync<T>(string sql, object? parameters, CancellationToken ct) =>
        (await connection.QueryAsync<T>(CreateCommand(sql, parameters, ct))).AsList();

    /// <summary>Retrieves one row, or null if absent; throws if multiple rows match.</summary>
    /// <typeparam name="T">The row type.</typeparam>
    /// <param name="sql">The SQL query.</param>
    /// <param name="parameters">The named SQL parameters, or null.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The matching row, or null.</returns>
    public Task<T?> QuerySingleOrDefaultAsync<T>(string sql, object? parameters, CancellationToken ct) where T : class =>
        connection.QuerySingleOrDefaultAsync<T>(CreateCommand(sql, parameters, ct));

    /// <summary>Retrieves the first column of the first result row.</summary>
    /// <typeparam name="T">The scalar result type.</typeparam>
    /// <param name="sql">The SQL query.</param>
    /// <param name="parameters">The named SQL parameters, or null.</param>
    /// <param name="ct">The cancellation token.</param>
    /// <returns>The scalar result, or its default value if absent.</returns>
    public Task<T?> ExecuteScalarAsync<T>(string sql, object? parameters, CancellationToken ct) =>
        connection.ExecuteScalarAsync<T>(CreateCommand(sql, parameters, ct));

    private CommandDefinition CreateCommand(string sql, object? parameters, CancellationToken ct) =>
        new(sql, parameters, transaction, cancellationToken: ct);
}
