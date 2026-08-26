/**
 * A real, structurally valid PDF, built in code so the repository carries no binary fixture and
 * the page count and page size are parameters of the test rather than properties of a blob.
 *
 * It exists to prove the pdf.js wiring end to end: our service really does open a document and
 * report what is in it (FR-PDF-02, FR-PDF-03).
 */
export function buildMinimalPdf(pageCount = 2, width = 200, height = 300): Uint8Array {
  const objects: string[] = [];

  const pageIds = Array.from({ length: pageCount }, (_unused, index) => index + 3);

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  for (const _pageId of pageIds) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> >>`);
  }

  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const startXref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets) {
    body += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

/** Bytes that are definitely not a PDF, for the invalid-document path (FR-PDF-11). */
export function buildNonPdfBytes(): Uint8Array {
  return new TextEncoder().encode('This is a spreadsheet, not a PDF.');
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}
