using Microsoft.AspNetCore.Mvc;

namespace Server.Infrastructure;

public sealed class ApiExceptionMiddleware(RequestDelegate next)
{
  public async Task Invoke(HttpContext context)
  {
    try
    {
      await next(context);
    }
    catch (Exception exception)
    {
      var (status, code, message) = Map(exception);
      context.Response.StatusCode = status;
      context.Response.ContentType = "application/json";
      var correlationId = context.TraceIdentifier;
      var envelope = new ErrorEnvelope(new ErrorBody(code, message, correlationId));
      await context.Response.WriteAsJsonAsync(envelope);
    }
  }

  private static (int Status, string Code, string Message) Map(Exception exception) => exception switch
  {
    ItemNotFoundException notFound => (StatusCodes.Status404NotFound, notFound.Code, "That folder is no longer available."),
    ItemAccessDeniedException => (StatusCodes.Status403Forbidden, "FORBIDDEN", "You don't have access to this item."),
    ProviderUnavailableException => (
      StatusCodes.Status503ServiceUnavailable,
      "UPSTREAM_UNAVAILABLE",
      "The document service is temporarily unavailable."),
    InvalidPdfException => (StatusCodes.Status415UnsupportedMediaType, "PDF_INVALID", "This file isn't a readable PDF."),
    _ => (StatusCodes.Status500InternalServerError, "INTERNAL", "Something went wrong opening this item.")
  };
}
