using Server.Controllers;
using Server.Infrastructure;
using Server.Providers;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IFolderProvider, MockFolderProvider>();
builder.Services.AddSingleton<IPdfProvider, MockPdfProvider>();

var app = builder.Build();

app.UseMiddleware<ApiExceptionMiddleware>();

app.MapControllers();

app.MapFallback(() => Results.NotFound(new ErrorEnvelope(new ErrorBody(
	"INTERNAL",
	"This endpoint does not exist.",
	Guid.NewGuid().ToString("N")))));

app.Run();

public partial class Program;
