using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Server.Models;
using Server.Providers;

namespace Server.Tests;

public sealed class ApiTestFactory : WebApplicationFactory<Program>
{
  private readonly IFolderProvider? folderProviderOverride;
  private readonly IPdfProvider? pdfProviderOverride;
  private readonly IFolderBrowseService? browseServiceOverride;

  public ApiTestFactory(
    IFolderProvider? folderProviderOverride = null,
    IPdfProvider? pdfProviderOverride = null,
    IFolderBrowseService? browseServiceOverride = null)
  {
    this.folderProviderOverride = folderProviderOverride;
    this.pdfProviderOverride = pdfProviderOverride;
    this.browseServiceOverride = browseServiceOverride;
  }

  protected override void ConfigureWebHost(IWebHostBuilder builder)
  {
    builder.UseEnvironment("Testing");
    builder.ConfigureServices(services =>
    {
      if (folderProviderOverride is not null)
      {
        services.RemoveAll<IFolderProvider>();
        services.AddSingleton(folderProviderOverride);
      }

      if (pdfProviderOverride is not null)
      {
        services.RemoveAll<IPdfProvider>();
        services.AddSingleton(pdfProviderOverride);
      }

      if (browseServiceOverride is not null)
      {
        services.RemoveAll<IFolderBrowseService>();
        services.AddSingleton(browseServiceOverride);
      }
    });
  }
}

/// <summary>Stands in for the native dialog: never shows UI, just returns what the test wants.</summary>
public sealed class FakeFolderBrowseService(string? result) : IFolderBrowseService
{
  public Task<string?> BrowseForFolderAsync(CancellationToken cancellationToken) => Task.FromResult(result);
}

public sealed class CursorFolderProvider : IFolderProvider
{
  public Task<FolderPage> GetRootItemsAsync(ItemQuery query, CancellationToken cancellationToken)
  {
    var items = new[]
    {
      new ExplorerItem("f_cursor", "Cursor Folder", "folder", true, null),
    };
    return Task.FromResult(new FolderPage(items, "cursor-token-1"));
  }

  public Task<FolderPage> GetChildrenAsync(string folderId, ItemQuery query, CancellationToken cancellationToken)
  {
    return Task.FromResult(new FolderPage([], "cursor-token-2"));
  }
}
