using System.Net;
using System.Net.Http.Json;

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
    Assert.NotEmpty(payload.Items);
    Assert.Contains(payload.Items, item => item.Type is "folder" or "pdf");
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
