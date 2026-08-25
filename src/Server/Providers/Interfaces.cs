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
