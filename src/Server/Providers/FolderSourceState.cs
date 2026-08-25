namespace Server.Providers;

public sealed class FolderSourceState
{
  private readonly object _gate = new();
  private string? _rootPath;

  public string? GetRootPath()
  {
    lock (_gate)
    {
      return _rootPath;
    }
  }

  public void SetRootPath(string rootPath)
  {
    lock (_gate)
    {
      _rootPath = rootPath;
    }
  }

  public void ClearRootPath()
  {
    lock (_gate)
    {
      _rootPath = null;
    }
  }
}
