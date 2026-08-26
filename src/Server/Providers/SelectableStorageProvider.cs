using System.Text;
using Server.Infrastructure;
using Server.Models;

namespace Server.Providers;

public sealed class SelectableStorageProvider(
  FolderSourceState sourceState) : IFolderProvider, IPdfProvider
{
  private const string LocalPrefix = "l:";

  public Task<FolderPage> GetRootItemsAsync(ItemQuery query, CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();

    var rootPath = sourceState.GetRootPath();
    if (string.IsNullOrWhiteSpace(rootPath))
    {
      return Task.FromResult(new FolderPage([], null));
    }

    return Task.FromResult(new FolderPage(ReadChildren(rootPath, parentRelativePath: null), null));
  }

  public Task<FolderPage> GetChildrenAsync(string folderId, ItemQuery query, CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();

    var rootPath = sourceState.GetRootPath();
    if (string.IsNullOrWhiteSpace(rootPath))
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }

    var relativePath = DecodeLocalId(folderId);
    var folderPath = ResolveUnderRoot(rootPath, relativePath);
    if (!Directory.Exists(folderPath))
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }

    return Task.FromResult(new FolderPage(ReadChildren(rootPath, relativePath), null));
  }

  public async Task<PdfContent> OpenPdfAsync(string pdfId, CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();

    var rootPath = sourceState.GetRootPath();
    if (string.IsNullOrWhiteSpace(rootPath))
    {
      throw new ItemNotFoundException("PDF_NOT_FOUND");
    }

    var relativePath = DecodeLocalId(pdfId);
    var filePath = ResolveUnderRoot(rootPath, relativePath);
    if (!File.Exists(filePath) || !filePath.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
    {
      throw new ItemNotFoundException("PDF_NOT_FOUND");
    }

    try
    {
      var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
      return new PdfContent(stream, Path.GetFileName(filePath));
    }
    catch (UnauthorizedAccessException)
    {
      throw new ItemAccessDeniedException();
    }
    catch (IOException)
    {
      throw new ProviderUnavailableException();
    }
  }

  public static string NormalizeAndValidateRootPath(string candidate)
  {
    if (string.IsNullOrWhiteSpace(candidate))
    {
      throw new InvalidSourceException();
    }

    var fullPath = Path.GetFullPath(candidate.Trim());
    if (!Directory.Exists(fullPath))
    {
      throw new InvalidSourceException();
    }

    return fullPath;
  }

  private static IReadOnlyList<ExplorerItem> ReadChildren(string rootPath, string? parentRelativePath)
  {
    var folderPath = parentRelativePath is null
      ? rootPath
      : ResolveUnderRoot(rootPath, parentRelativePath);

    try
    {
      var entries = new List<ExplorerItem>();

      foreach (var directory in Directory.EnumerateDirectories(folderPath))
      {
        var relative = Path.GetRelativePath(rootPath, directory);
        var normalizedRelative = NormalizeRelative(relative);
        var hasChildren = Directory.EnumerateDirectories(directory).Any() ||
                          Directory.EnumerateFiles(directory, "*.pdf").Any();

        entries.Add(new ExplorerItem(
          EncodeLocalId(normalizedRelative),
          Path.GetFileName(directory),
          "folder",
          hasChildren,
          parentRelativePath is null ? null : EncodeLocalId(parentRelativePath)));
      }

      foreach (var file in Directory.EnumerateFiles(folderPath, "*.pdf"))
      {
        var relative = NormalizeRelative(Path.GetRelativePath(rootPath, file));
        entries.Add(new ExplorerItem(
          EncodeLocalId(relative),
          Path.GetFileName(file),
          "pdf",
          false,
          parentRelativePath is null ? null : EncodeLocalId(parentRelativePath)));
      }

      return entries
        .OrderBy(item => item.Type == "pdf")
        .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
        .ToList();
    }
    catch (UnauthorizedAccessException)
    {
      throw new ItemAccessDeniedException();
    }
    catch (IOException)
    {
      throw new ProviderUnavailableException();
    }
  }

  private static string ResolveUnderRoot(string rootPath, string relativePath)
  {
    var local = relativePath.Replace('/', Path.DirectorySeparatorChar);
    if (Path.IsPathRooted(local))
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }

    var rootFull = EnsureTrailingSeparator(Path.GetFullPath(rootPath));
    var combined = Path.GetFullPath(Path.Combine(rootFull, local));

    if (!combined.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }

    return combined;
  }

  private static string EnsureTrailingSeparator(string path)
  {
    return path.EndsWith(Path.DirectorySeparatorChar)
      ? path
      : path + Path.DirectorySeparatorChar;
  }

  private static string NormalizeRelative(string value)
  {
    return value.Replace(Path.DirectorySeparatorChar, '/');
  }

  private static string EncodeLocalId(string relativePath)
  {
    return LocalPrefix + Convert.ToBase64String(Encoding.UTF8.GetBytes(relativePath));
  }

  private static string DecodeLocalId(string id)
  {
    if (!id.StartsWith(LocalPrefix, StringComparison.Ordinal))
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }

    var encoded = id[LocalPrefix.Length..];
    try
    {
      var bytes = Convert.FromBase64String(encoded);
      var relative = Encoding.UTF8.GetString(bytes);
      if (string.IsNullOrWhiteSpace(relative))
      {
        throw new ItemNotFoundException("FOLDER_NOT_FOUND");
      }

      return relative;
    }
    catch (FormatException)
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }
  }
}
