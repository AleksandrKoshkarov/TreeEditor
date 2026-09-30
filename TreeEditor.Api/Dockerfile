FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY TreeEditor.Api/TreeEditor.Api.csproj TreeEditor.Api/
RUN dotnet restore TreeEditor.Api/TreeEditor.Api.csproj
COPY TreeEditor.Api/ TreeEditor.Api/
RUN dotnet publish TreeEditor.Api/TreeEditor.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
COPY db/02-seed.sql /app/db/02-seed.sql
EXPOSE 8080
ENTRYPOINT ["dotnet", "TreeEditor.Api.dll"]
