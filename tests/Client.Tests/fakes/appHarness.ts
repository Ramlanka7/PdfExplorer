import { vi } from 'vitest';

import { bootstrap, type AppHandle } from '../../../src/Client/app/bootstrap';
import { createPdfService, type PdfService } from '../../../src/Client/services/pdfService';
import type { AppState } from '../../../src/Client/state/types';
import { createFakeFolderService, type FakeFolderService, type FakeItem } from './fakeFolderService';
import {
  createFakePdfDocumentService,
  type FakePdfDocumentService,
} from './fakePdfDocumentService';

export interface Harness {
  readonly container: HTMLElement;
  readonly folders: FakeFolderService;
  readonly pdfs: FakePdfDocumentService;
  readonly pdfSources: PdfService;
  readonly handle: AppHandle;
  state(): AppState;
  /** Every row currently in the tree, in visual order. */
  rows(): HTMLElement[];
  row(key: string): HTMLElement | null;
  nameOf(row: Element): string;
  click(key: string): Promise<void>;
  query<T extends Element>(selector: string): T | null;
  queryAll<T extends Element>(selector: string): T[];
}

/**
 * Mounts the real application - real store, real reducer, real components, real controller -
 * with fakes at the two seams that would otherwise need Excel or a network (NFR-CODE-07).
 * Tests then drive it the way a user does, through the DOM, and assert through the DOM and the
 * store (docs/05-testing.md).
 */
export function mountApp(items: readonly FakeItem[]): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const folders = createFakeFolderService(items);
  const pdfs = createFakePdfDocumentService();
  // The real PdfService: it only builds a URL, and a test should see the URL a user would get.
  const real = createPdfService();
  const pdfSources: PdfService = { getPdfSource: vi.fn(real.getPdfSource) };

  const handle = bootstrap(container, {
    folderService: folders,
    pdfService: pdfSources,
    pdfDocumentService: pdfs,
  });

  return {
    container,
    folders,
    pdfs,
    pdfSources,
    handle,
    state: () => handle.store.getState(),
    rows: () => [...container.querySelectorAll<HTMLElement>('.tree-row')],
    row: (key) => container.querySelector<HTMLElement>(`[data-row-key="${key}"]`),
    nameOf: (row) => row.querySelector('.tree-row__name')?.textContent ?? '',
    async click(key) {
      const target = container.querySelector<HTMLElement>(`[data-row-key="${key}"]`);
      if (target === null) throw new Error(`No row with key "${key}"`);
      target.click();
      await flush();
    },
    query: <T extends Element>(selector: string) => container.querySelector<T>(selector),
    queryAll: <T extends Element>(selector: string) => [...container.querySelectorAll<T>(selector)],
  };
}

/** Lets every pending microtask and timer callback run, then returns. */
export function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
