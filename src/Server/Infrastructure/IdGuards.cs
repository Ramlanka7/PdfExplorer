namespace Server.Infrastructure;

public static class IdGuards
{
  public static bool IsTraversalShaped(string id)
  {
    if (string.IsNullOrWhiteSpace(id)) return true;

    var lowered = id.ToLowerInvariant();

    return lowered.Contains("../", StringComparison.Ordinal)
      || lowered.Contains("..\\", StringComparison.Ordinal)
      || lowered.Contains("%2f", StringComparison.Ordinal)
      || lowered.Contains("%5c", StringComparison.Ordinal)
      || lowered.StartsWith("/", StringComparison.Ordinal)
      || lowered.StartsWith("\\", StringComparison.Ordinal)
      || lowered.Contains(":/", StringComparison.Ordinal)
      || lowered.Contains(":\\", StringComparison.Ordinal);
  }
}
