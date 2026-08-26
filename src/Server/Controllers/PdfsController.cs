using Microsoft.AspNetCore.Mvc;
using Server.Infrastructure;
using Server.Providers;

namespace Server.Controllers;

[ApiController]
[Route("api/pdfs")]
public sealed class PdfsController(IPdfProvider provider) : ControllerBase
{
  [HttpGet("{pdfId}/content")]
  public async Task<IActionResult> GetContentAsync(string pdfId, CancellationToken cancellationToken)
  {
    if (IdGuards.IsTraversalShaped(pdfId))
    {
      throw new ItemNotFoundException("PDF_NOT_FOUND");
    }

    var content = await provider.OpenPdfAsync(pdfId, cancellationToken);
    Response.Headers.CacheControl = "private, max-age=60";
    Response.Headers["X-Content-Type-Options"] = "nosniff";
    return File(content.Content, "application/pdf", content.FileName, enableRangeProcessing: true);
  }
}
