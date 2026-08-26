import type { ItemId } from '../state/types';
import type { PdfSource } from '../pdf/types';
import { apiUrl } from './http';

/**
 * D4: bytes always travel through the API. The client never holds a file path, a share name, or
 * a storage URL. Every provider the server can grow looks identical from here, which is what
 * DOD-15 asks for: swapping the document source changes no client file.
 */
export interface PdfService {
  getPdfSource(pdfId: ItemId): PdfSource;
}

export function createPdfService(): PdfService {
  return {
    getPdfSource(pdfId) {
      // Nothing is fetched here. The bytes are requested only when the viewer loads the source,
      // which happens only on selection (NFR-PERF-04).
      return { kind: 'url', url: apiUrl('pdfs', pdfId, 'content') };
    },
  };
}
