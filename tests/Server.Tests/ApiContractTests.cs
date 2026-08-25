using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace Server.Tests;

public sealed class ApiContractTests
{
  [Fact]
  public async Task GetRoot_returns_documented_shape_and_status_FR_DATA_02()
  {
    await using var factory = new ApiTestFactory();
    using var client = factory.CreateClient();

    var response = await client.GetAsync("/api/folders/root");
    var payload = await response.Content.ReadFromJsonAsync<FolderPageResponse>();

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.NotNull(payload);
    Assert.NotNull(payload!.Items);
    Assert.Empty(payload.Items);
  }

  [Theory]
  [InlineData("../secrets")]
  [InlineData("/absolute/path")]
  [InlineData("..%2F..%2Fpayroll")]
  public async Task GetChildren_traversal_shaped_ids_are_not_found_NFR_SEC_06(string rawId)
  {
    await using var factory = new ApiTestFactory();
    using var client = factory.CreateClient();

    var response = await client.GetAsync($"/api/folders/{Uri.EscapeDataString(rawId)}/children");
    var payload = await response.Content.ReadFromJsonAsync<ErrorResponse>();

    Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    Assert.NotNull(payload);
    Assert.Equal("FOLDER_NOT_FOUND", payload!.Error.Code);
    Assert.False(string.IsNullOrWhiteSpace(payload.Error.CorrelationId));
  }

  [Fact]
  public async Task FolderPage_next_cursor_flows_through_unchanged_FR_DATA_08()
  {
    await using var factory = new ApiTestFactory(new CursorFolderProvider());
    using var client = factory.CreateClient();

    var response = await client.GetAsync("/api/folders/root?cursor=from-client&limit=10");
    var payload = await response.Content.ReadFromJsonAsync<FolderPageResponse>();

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.NotNull(payload);
    Assert.Equal("cursor-token-1", payload!.NextCursor);
  }

  [Fact]
  public async Task SetSource_then_root_lists_items_from_selected_folder()
  {
    var tempRoot = Path.Combine(Path.GetTempPath(), $"PdfExplorer_{Guid.NewGuid():N}");
    Directory.CreateDirectory(tempRoot);
    Directory.CreateDirectory(Path.Combine(tempRoot, "Invoices"));
    await File.WriteAllBytesAsync(Path.Combine(tempRoot, "Readme.pdf"), Encoding.ASCII.GetBytes("%PDF-1.4\n%%EOF"));

    try
    {
      await using var factory = new ApiTestFactory();
      using var client = factory.CreateClient();

      var setResponse = await client.PutAsJsonAsync("/api/folders/source", new { path = tempRoot });
      var rootResponse = await client.GetAsync("/api/folders/root");
      var payload = await rootResponse.Content.ReadFromJsonAsync<FolderPageResponse>();

      Assert.Equal(HttpStatusCode.NoContent, setResponse.StatusCode);
      Assert.Equal(HttpStatusCode.OK, rootResponse.StatusCode);
      Assert.NotNull(payload);
      Assert.Contains(payload!.Items, item => item.Name == "Invoices" && item.Type == "folder");
      Assert.Contains(payload.Items, item => item.Name == "Readme.pdf" && item.Type == "pdf");
    }
    finally
    {
      if (Directory.Exists(tempRoot))
      {
        Directory.Delete(tempRoot, recursive: true);
      }
    }
  }

  [Fact]
  public async Task SetSource_with_missing_folder_returns_SOURCE_INVALID()
  {
    await using var factory = new ApiTestFactory();
    using var client = factory.CreateClient();

    var missing = Path.Combine(Path.GetTempPath(), $"PdfExplorer_missing_{Guid.NewGuid():N}");
    var response = await client.PutAsJsonAsync("/api/folders/source", new { path = missing });
    var payload = await response.Content.ReadFromJsonAsync<ErrorResponse>();

    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.NotNull(payload);
    Assert.Equal("SOURCE_INVALID", payload!.Error.Code);
  }

  [Fact]
  public async Task BrowseSource_with_a_selection_sets_source_and_returns_it()
  {
    var tempRoot = Path.Combine(Path.GetTempPath(), $"PdfExplorer_{Guid.NewGuid():N}");
    Directory.CreateDirectory(tempRoot);
    await File.WriteAllBytesAsync(Path.Combine(tempRoot, "Readme.pdf"), Encoding.ASCII.GetBytes("%PDF-1.4\n%%EOF"));

    try
    {
      await using var factory = new ApiTestFactory(browseServiceOverride: new FakeFolderBrowseService(tempRoot));
      using var client = factory.CreateClient();

      var browseResponse = await client.PostAsync("/api/folders/source/browse", content: null);
      var browsePayload = await browseResponse.Content.ReadFromJsonAsync<FolderSourceResponse>();
      var rootResponse = await client.GetAsync("/api/folders/root");
      var rootPayload = await rootResponse.Content.ReadFromJsonAsync<FolderPageResponse>();

      Assert.Equal(HttpStatusCode.OK, browseResponse.StatusCode);
      Assert.NotNull(browsePayload);
      Assert.Equal(Path.GetFullPath(tempRoot), browsePayload!.Path);
      Assert.Contains(rootPayload!.Items, item => item.Name == "Readme.pdf" && item.Type == "pdf");
    }
    finally
    {
      if (Directory.Exists(tempRoot))
      {
        Directory.Delete(tempRoot, recursive: true);
      }
    }
  }

  [Fact]
  public async Task BrowseSource_canceled_leaves_the_current_source_unchanged()
  {
    await using var factory = new ApiTestFactory(browseServiceOverride: new FakeFolderBrowseService(null));
    using var client = factory.CreateClient();

    var beforeResponse = await client.GetAsync("/api/folders/root");
    var beforePayload = await beforeResponse.Content.ReadFromJsonAsync<FolderPageResponse>();

    var browseResponse = await client.PostAsync("/api/folders/source/browse", content: null);

    var afterResponse = await client.GetAsync("/api/folders/root");
    var afterPayload = await afterResponse.Content.ReadFromJsonAsync<FolderPageResponse>();

    Assert.Equal(HttpStatusCode.NoContent, browseResponse.StatusCode);
    Assert.Equal(beforePayload!.Items.Count, afterPayload!.Items.Count);
  }

  [Fact]
  public async Task ClearSource_removes_the_current_source_so_root_is_empty_again()
  {
    var tempRoot = Path.Combine(Path.GetTempPath(), $"PdfExplorer_{Guid.NewGuid():N}");
    Directory.CreateDirectory(tempRoot);
    await File.WriteAllBytesAsync(Path.Combine(tempRoot, "Readme.pdf"), Encoding.ASCII.GetBytes("%PDF-1.4\n%%EOF"));

    try
    {
      await using var factory = new ApiTestFactory();
      using var client = factory.CreateClient();

      await client.PutAsJsonAsync("/api/folders/source", new { path = tempRoot });
      var clearResponse = await client.DeleteAsync("/api/folders/source");
      var rootResponse = await client.GetAsync("/api/folders/root");
      var payload = await rootResponse.Content.ReadFromJsonAsync<FolderPageResponse>();

      Assert.Equal(HttpStatusCode.NoContent, clearResponse.StatusCode);
      Assert.Equal(HttpStatusCode.OK, rootResponse.StatusCode);
      Assert.NotNull(payload);
      Assert.Empty(payload!.Items);
    }
    finally
    {
      if (Directory.Exists(tempRoot))
      {
        Directory.Delete(tempRoot, recursive: true);
      }
    }
  }

  private sealed record FolderSourceResponse(string Path);

  private sealed record FolderPageResponse(IReadOnlyList<ExplorerItemResponse> Items, string? NextCursor);

  private sealed record ExplorerItemResponse(
    string Id,
    string Name,
    string Type,
    bool HasChildren,
    string? ParentId);

  private sealed record ErrorResponse(ErrorContent Error);

  private sealed record ErrorContent(string Code, string Message, string CorrelationId);
}
