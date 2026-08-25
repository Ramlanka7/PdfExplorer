import type {
  IPdfDocumentService,
  PageSize,
  PdfDocument,
  PdfSource,
} from '../../../src/Client/pdf/types';

/**
 * jsdom cannot rasterise a canvas, so component tests fake the rendering seam
 * (docs/05-testing.md). The fake records the lifecycle facts the requirements are about:
 * whether a document was destroyed, which pages were rendered, and which were released.
 */
export interface FakePdfDocument extends PdfDocument {
  readonly destroyed: boolean;
  readonly rendered: readonly { pageNumber: number; scale: number }[];
  readonly released: readonly number[];
}

export function createFakePdfDocument(
  pageCount = 1,
  size: PageSize = { width: 200, height: 300 },
): FakePdfDocument {
  const rendered: { pageNumber: number; scale: number }[] = [];
  const released: number[] = [];

  const fake = {
    pageCount,
    destroyed: false,
    rendered,
    released,

    getPageSize(): Promise<PageSize> {
      return Promise.resolve(size);
    },

    renderPage(pageNumber: number, _target: HTMLCanvasElement, scale: number): Promise<void> {
      rendered.push({ pageNumber, scale });
      return Promise.resolve();
    },

    releasePage(pageNumber: number): void {
      released.push(pageNumber);
    },

    destroy(): void {
      fake.destroyed = true;
    },
  };

  return fake;
}

export interface PdfLoadCall {
  readonly source: PdfSource;
  readonly signal: AbortSignal | undefined;
}

export interface FakePdfDocumentService extends IPdfDocumentService {
  readonly calls: readonly PdfLoadCall[];
  /** Documents this service has handed out, in order. */
  readonly documents: readonly FakePdfDocument[];
  /** When true, load() hangs until resolveCall/rejectCall - needed to stage a race. */
  manual: boolean;
  pageCount: number;
  resolveCall(index: number): FakePdfDocument;
  rejectCall(index: number, error: unknown): void;
}

export function createFakePdfDocumentService(): FakePdfDocumentService {
  const calls: PdfLoadCall[] = [];
  const documents: FakePdfDocument[] = [];
  const settlers: {
    resolve: (document: FakePdfDocument) => void;
    reject: (error: unknown) => void;
  }[] = [];

  const service: FakePdfDocumentService = {
    calls,
    documents,
    manual: false,
    pageCount: 1,

    load(source, signal) {
      const index = calls.length;
      calls.push({ source, signal });
      return new Promise<PdfDocument>((resolve, reject) => {
        settlers[index] = { resolve, reject };
        if (!service.manual) {
          queueMicrotask(() => service.resolveCall(index));
        }
      });
    },

    resolveCall(index) {
      const settler = settlers[index];
      if (settler === undefined) throw new Error(`No pending PDF load at index ${index}`);
      const already = documents[index];
      if (already !== undefined) return already;
      const created = createFakePdfDocument(service.pageCount);
      documents[index] = created;
      settler.resolve(created);
      return created;
    },

    rejectCall(index, error) {
      const settler = settlers[index];
      if (settler === undefined) throw new Error(`No pending PDF load at index ${index}`);
      settler.reject(error);
    },
  };

  return service;
}
