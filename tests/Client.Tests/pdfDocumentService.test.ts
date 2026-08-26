import { ResponseException } from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';

import { createPdfDocumentService, toPdfLoadError } from '../../src/Client/pdf/pdfDocumentService';
import { PdfLoadError } from '../../src/Client/pdf/types';
import { buildMinimalPdf, buildNonPdfBytes, toArrayBuffer } from './fixtures/minimalPdf';

/**
 * The one integration test that runs real pdf.js (docs/05-testing.md). Component tests fake
 * IPdfDocumentService, because jsdom cannot rasterise a canvas - but something has to prove the
 * seam is wired to a working library, and this is it.
 */
describe('pdfDocumentService', () => {
  it('opens a real PDF and reports its pages (FR-PDF-02, FR-PDF-03)', async () => {
    const service = createPdfDocumentService();

    const document = await service.load({
      kind: 'bytes',
      data: toArrayBuffer(buildMinimalPdf(3, 200, 300)),
    });

    try {
      expect(document.pageCount).toBe(3);
      await expect(document.getPageSize(2)).resolves.toEqual({ width: 200, height: 300 });
    } finally {
      document.destroy();
    }
  });

  it('reports bytes that are not a PDF as an invalid document (FR-PDF-11)', async () => {
    const service = createPdfDocumentService();

    const failure = await service
      .load({ kind: 'bytes', data: toArrayBuffer(buildNonPdfBytes()) })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(PdfLoadError);
    expect((failure as PdfLoadError).reason).toBe('invalid');
  });

  it('maps transport failures by type, never by message (FR-PDF-11, rule 14)', () => {
    expect(toPdfLoadError(new ResponseException('missing', 404, true)).reason).toBe('not-found');
    expect(toPdfLoadError(new ResponseException('forbidden', 403, false)).reason).toBe('forbidden');
    expect(toPdfLoadError(new ResponseException('down', 503, false)).reason).toBe('unavailable');
    expect(toPdfLoadError(new TypeError('Failed to fetch')).reason).toBe('network');
    expect(toPdfLoadError(new Error('something else')).reason).toBe('unknown');
  });
});
