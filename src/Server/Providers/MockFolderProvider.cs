using Server.Infrastructure;
using Server.Models;

namespace Server.Providers;

public sealed class MockFolderProvider : IFolderProvider
{
  private static readonly ExplorerItem Contracts = new("f_contracts", "Contracts", "folder", true, null);
  private static readonly ExplorerItem Reports = new("f_reports", "Reports", "folder", true, null);
  private static readonly ExplorerItem Readme = new("p_readme", "Readme.pdf", "pdf", false, null);

  private static readonly Dictionary<string, IReadOnlyList<ExplorerItem>> Children = new()
  {
    ["f_contracts"] =
    [
      new ExplorerItem("f_2026", "2026", "folder", true, "f_contracts"),
      new ExplorerItem("p_contract_a", "Contract A.pdf", "pdf", false, "f_contracts"),
    ],
    ["f_2026"] =
    [
      new ExplorerItem("p_deep", "Deep.pdf", "pdf", false, "f_2026"),
    ],
    ["f_reports"] =
    [
      new ExplorerItem("p_q1", "Q1.pdf", "pdf", false, "f_reports"),
    ],
  };

  public Task<FolderPage> GetRootItemsAsync(ItemQuery query, CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    return Task.FromResult(new FolderPage([Contracts, Reports, Readme], null));
  }

  public Task<FolderPage> GetChildrenAsync(string folderId, ItemQuery query, CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    if (!Children.TryGetValue(folderId, out var children))
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }

    return Task.FromResult(new FolderPage(children, null));
  }
}
