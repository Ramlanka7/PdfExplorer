import {
  AbortException,
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  RenderingCancelledException,
  ResponseException,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';

import {
  PdfLoadError,
  PdfRenderCancelledError,
  type IPdfDocumentService,
  type PageSize,
  type PdfDocument,
  type PdfLoadFailureReason,
  type PdfSource,
} from './types';

/**
 * The only module in the client that imports pdfjs-dist (rule 6).
 *
 * The worker is resolved through Vite so it ships as a hashed, same-origin asset. A CDN
 * workerSrc is the single most likely way to break this add-in inside Excel while it works
 * perfectly in a browser tab (risk R1).
 */
function configureWorker(): void {
  if (GlobalWorkerOptions.workerSrc) return;
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
}

/**
 * Character maps (CJK) and the standard 14 fonts, copied into the bundle by the pdfjs-assets
 * plugin in vite.config.ts. Same-origin, like everything else the pane loads (D3).
 */
function pdfjsAssetUrl(folder: string): string {
  return new URL(`./pdfjs/${folder}/`, document.baseURI).href;
}

/** Backing-store resolution cap: 2x is enough for a task pane and keeps canvases small. */
const MAX_DEVICE_PIXEL_RATIO = 2;

export function createPdfDocumentService(): IPdfDocumentService {
  return {
    async load(source: PdfSource, signal?: AbortSignal): Promise<PdfDocument> {
      configureWorker();

      const task = getDocument({
        ...(source.kind === 'url' ? { url: source.url } : { data: new Uint8Array(source.data) }),
        cMapUrl: pdfjsAssetUrl('cmaps'),
        cMapPacked: true,
        standardFontDataUrl: pdfjsAssetUrl('standard_fonts'),
        // pdf.js 5 loads WebAssembly and ICC profiles on demand for JPEG 2000 and colour
        // management. Same-origin like everything else; a CDN default would be blocked by the
        // task-pane CSP (risk R1).
        wasmUrl: pdfjsAssetUrl('wasm'),
        iccUrl: pdfjsAssetUrl('iccs'),
      });

      const abort = (): void => {
        void task.destroy();
      };
      signal?.addEventListener('abort', abort, { once: true });

      try {
        const proxy = await task.promise;
        return new PdfJsDocument(proxy);
      } catch (cause) {
        throw toPdfLoadError(cause);
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}

class PdfJsDocument implements PdfDocument {
  readonly pageCount: number;

  readonly #proxy: PDFDocumentProxy;
  readonly #pages = new Map<number, Promise<PDFPageProxy>>();
  readonly #renders = new Map<number, RenderTask>();
  #destroyed = false;

  constructor(proxy: PDFDocumentProxy) {
    this.#proxy = proxy;
    this.pageCount = proxy.numPages;
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    const page = await this.#page(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  async renderPage(pageNumber: number, target: HTMLCanvasElement, scale: number): Promise<void> {
    const page = await this.#page(pageNumber);
    if (this.#destroyed) throw new PdfRenderCancelledError();

    // Cancel an outstanding render for this page before starting another on the same canvas.
    this.#renders.get(pageNumber)?.cancel();
    this.#renders.delete(pageNumber);

    const ratio = Math.min(globalThis.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const viewport = page.getViewport({ scale: scale * ratio });

    target.width = Math.floor(viewport.width);
    target.height = Math.floor(viewport.height);
    target.style.width = `${Math.floor(viewport.width / ratio)}px`;
    target.style.height = `${Math.floor(viewport.height / ratio)}px`;

    const task = page.render({ canvas: target, viewport });
    this.#renders.set(pageNumber, task);

    try {
      await task.promise;
    } catch (cause) {
      if (cause instanceof RenderingCancelledException) throw new PdfRenderCancelledError();
      throw cause;
    } finally {
      if (this.#renders.get(pageNumber) === task) this.#renders.delete(pageNumber);
    }
  }

  releasePage(pageNumber: number): void {
    this.#renders.get(pageNumber)?.cancel();
    this.#renders.delete(pageNumber);

    const pending = this.#pages.get(pageNumber);
    this.#pages.delete(pageNumber);
    // NFR-PERF-05: a large document must never hold every page rasterised at once.
    void pending?.then((page) => page.cleanup()).catch(() => undefined);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const task of this.#renders.values()) task.cancel();
    this.#renders.clear();
    this.#pages.clear();
    // NFR-PERF-06: each document holds a worker; dropping the reference is not enough.
    void this.#proxy.destroy();
  }

  #page(pageNumber: number): Promise<PDFPageProxy> {
    const cached = this.#pages.get(pageNumber);
    if (cached !== undefined) return cached;
    const pending = this.#proxy.getPage(pageNumber);
    this.#pages.set(pageNumber, pending);
    return pending;
  }
}

/** Maps pdf.js exception types — never their messages — onto our typed failure reasons. */
export function toPdfLoadError(cause: unknown): PdfLoadError {
  if (cause instanceof PdfLoadError) return cause;
  if (cause instanceof InvalidPDFException) return new PdfLoadError('invalid', cause);
  if (cause instanceof AbortException) return new PdfLoadError('unknown', cause);

  if (cause instanceof ResponseException) {
    const status = typeof cause.status === 'number' ? cause.status : 0;
    return new PdfLoadError(reasonForStatus(status, cause.missing === true), cause);
  }

  // fetch() rejects with a TypeError when the request never reached the server.
  if (cause instanceof TypeError) return new PdfLoadError('network', cause);
  return new PdfLoadError('unknown', cause);
}

function reasonForStatus(status: number, missing: boolean): PdfLoadFailureReason {
  if (missing || status === 404) return 'not-found';
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 415:
      return 'invalid';
    case 0:
      return 'network';
    default:
      return status >= 500 ? 'unavailable' : 'unknown';
  }
}
