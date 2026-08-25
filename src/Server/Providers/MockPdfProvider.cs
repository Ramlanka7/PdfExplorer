using System.Text;
using Server.Infrastructure;
using Server.Models;

namespace Server.Providers;

public sealed class MockPdfProvider : IPdfProvider
{
  private static readonly IReadOnlyDictionary<string, string> Documents = new Dictionary<string, string>
  {
    ["p_readme"] = "Readme.pdf",
    ["p_contract_a"] = "Contract A.pdf",
    ["p_q1"] = "Q1.pdf",
    ["p_deep"] = "Deep.pdf",
  };

  public Task<PdfContent> OpenPdfAsync(string pdfId, CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();

    if (!Documents.TryGetValue(pdfId, out var fileName))
    {
      throw new ItemNotFoundException("PDF_NOT_FOUND");
    }

    return Task.FromResult(new PdfContent(new MemoryStream(BuildMinimalPdfBytes()), fileName));
  }

  private static byte[] BuildMinimalPdfBytes()
  {
    const string minimalPdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
    return Encoding.ASCII.GetBytes(minimalPdf);
  }
}
