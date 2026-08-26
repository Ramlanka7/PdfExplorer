namespace Server.Models;

public sealed record ItemQuery(string? Cursor = null, int? Limit = null);

public sealed record ExplorerItem(
  string Id,
  string Name,
  string Type,
  bool HasChildren,
  string? ParentId);

public sealed record FolderPage(IReadOnlyList<ExplorerItem> Items, string? NextCursor);

public sealed record PdfContent(Stream Content, string FileName);
