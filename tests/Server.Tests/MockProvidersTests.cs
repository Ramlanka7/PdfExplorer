using Server.Infrastructure;
using Server.Models;
using Server.Providers;

namespace Server.Tests;

public sealed class MockProvidersTests
{
  [Fact]
  public async Task GetRootItemsAsync_And_GetChildrenAsync_return_known_items_directly_FR_DATA_04()
  {
    var provider = new MockFolderProvider();

    var roots = await provider.GetRootItemsAsync(new ItemQuery(), CancellationToken.None);
    var children = await provider.GetChildrenAsync("f_contracts", new ItemQuery(), CancellationToken.None);

    Assert.Contains(roots.Items, item => item.Id == "f_contracts" && item.Type == "folder");
    Assert.Contains(roots.Items, item => item.Id == "p_readme" && item.Type == "pdf");
    Assert.Contains(children.Items, item => item.ParentId == "f_contracts");
  }

  [Fact]
  public async Task OpenPdfAsync_known_id_returns_stream_and_unknown_throws_ItemNotFoundException_FR_DATA_03()
  {
    var provider = new MockPdfProvider();

    var known = await provider.OpenPdfAsync("p_readme", CancellationToken.None);
    using var stream = known.Content;

    Assert.True(stream.CanRead);
    Assert.Equal("Readme.pdf", known.FileName);

    await Assert.ThrowsAsync<ItemNotFoundException>(() =>
      provider.OpenPdfAsync("missing_pdf", CancellationToken.None));
  }
}
