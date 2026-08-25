namespace Server.Infrastructure;

public class ItemNotFoundException(string code = "FOLDER_NOT_FOUND") : Exception
{
  public string Code { get; } = code;
}

public class ItemAccessDeniedException : Exception;

public class ProviderUnavailableException : Exception;

public class InvalidPdfException : Exception;

public class InvalidSourceException : Exception;
