using Npgsql;
using TreeEditor.Api;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Tree")
    ?? throw new InvalidOperationException("ConnectionStrings:Tree is required.");

builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<Database>();
builder.Services.AddScoped<TreeRepository>();

var app = builder.Build();

app.MapTreeEndpoints();

app.Run();
