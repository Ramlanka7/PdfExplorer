/**
 * The rendering seam (rule 6). Nothing in this file imports pdfjs-dist, so components, state,
 * and services can depend on these types without pulling the library into their layer.
 */

/** Where the bytes come from. The client never holds a file path (rule 10, D4). */
export type PdfSource =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'bytes'; readonly data: ArrayBuffer };

/** Page dimensions in CSS pixels at scale 1. */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export interface PdfDocument {
  readonly pageCount: number;
  /** Intrinsic size of one page, needed for fit-to-width and fit-to-page (FR-PDF-06). */
  getPageSize(pageNumber: number): Promise<PageSize>;
  /**
   * Renders one page into `target`. Starting a render for a page that is already rendering
   * cancels the previous one; the superseded promise rejects with PdfRenderCancelledError.
   */
  renderPage(pageNumber: number, target: HTMLCanvasElement, scale: number): Promise<void>;
  /** Cancels any render for the page and releases its resources (NFR-PERF-05). */
  releasePage(pageNumber: number): void;
  /** Releases the document and its worker (NFR-PERF-06). */
  destroy(): void;
}

export interface IPdfDocumentService {
  load(source: PdfSource, signal?: AbortSignal): Promise<PdfDocument>;
}

/**
 * Why a document could not be opened, in terms the error mapper understands. Typed, so nothing
 * downstream has to match on an exception message (rule 14).
 */
export type PdfLoadFailureReason =
  | 'not-found'
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
  | 'unavailable'
  | 'network'
  | 'unknown';

export class PdfLoadError extends Error {
  readonly reason: PdfLoadFailureReason;

  constructor(reason: PdfLoadFailureReason, cause?: unknown) {
    super(`PDF load failed: ${reason}`, { cause });
    this.name = 'PdfLoadError';
    this.reason = reason;
  }
}

/** A render superseded by a newer one for the same page. Expected; not an error to report. */
export class PdfRenderCancelledError extends Error {
  constructor() {
    super('PDF page render cancelled');
    this.name = 'PdfRenderCancelledError';
  }
}
