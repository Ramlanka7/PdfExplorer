using Server.Models;

namespace Server.Providers;

public interface IFolderProvider
{
  Task<FolderPage> GetRootItemsAsync(ItemQuery query, CancellationToken cancellationToken);

  Task<FolderPage> GetChildrenAsync(string folderId, ItemQuery query, CancellationToken cancellationToken);
}

public interface IPdfProvider
{
  Task<PdfContent> OpenPdfAsync(string pdfId, CancellationToken cancellationToken);
}

/// <summary>
/// Shows the OS folder picker so the user can select a source without typing a path. Only makes
/// sense for a provider reading the local filesystem - a remote provider (SharePoint, Blob) would
/// need its own picker UI, not this one (see the add-storage-provider skill).
/// </summary>
public interface IFolderBrowseService
{
  /// <summary>Null means the user closed the dialog without picking anything - not a failure.</summary>
  Task<string?> BrowseForFolderAsync(CancellationToken cancellationToken);
}
