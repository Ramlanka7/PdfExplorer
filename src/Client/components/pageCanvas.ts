import { PdfRenderCancelledError, type PdfDocument } from '../pdf/types';
import { el } from './dom';

/**
 * One page of the open document. It owns a placeholder box that is correctly sized before
 * anything is rasterised, so the scroll height of a 500-page document is right from the start
 * without rendering 500 pages (NFR-PERF-05).
 *
 * It talks to PdfDocument, which is an interface in pdf/types - never to pdfjs-dist (rule 6).
 */
export interface PageCanvas {
  readonly element: HTMLElement;
  readonly pageNumber: number;
  /** Placeholder size in CSS pixels at the current scale. */
  setBox(width: number, height: number): void;
  render(openDoc: PdfDocument, scale: number): Promise<void>;
  /** Drops the rasterised bitmap and lets the document release the page. */
  release(openDoc: PdfDocument | null): void;
  destroy(): void;
}

export function createPageCanvas(pageNumber: number): PageCanvas {
  const element = el('div', {
    className: 'page',
    attrs: { 'data-page-number': String(pageNumber), 'aria-label': `Page ${pageNumber}` },
  });
  const canvas = el('canvas', { className: 'page__canvas' });
  element.appendChild(canvas);

  let renderedDocument: PdfDocument | null = null;
  let renderedScale = 0;
  let renderToken = 0;

  return {
    element,
    pageNumber,

    setBox(width, height) {
      const w = `${Math.round(width)}px`;
      const h = `${Math.round(height)}px`;
      if (element.style.width !== w) element.style.width = w;
      if (element.style.height !== h) element.style.height = h;
    },

    async render(openDoc, scale) {
      if (renderedDocument === openDoc && renderedScale === scale) return;

      const token = ++renderToken;
      try {
        await openDoc.renderPage(pageNumber, canvas, scale);
        if (token !== renderToken) return;
        renderedDocument = openDoc;
        renderedScale = scale;
        element.classList.add('is-rendered');
      } catch (error) {
        // A superseded render is the expected outcome of zooming or scrolling quickly.
        if (error instanceof PdfRenderCancelledError) return;
        throw error;
      }
    },

    release(openDoc) {
      renderToken += 1;
      renderedDocument = null;
      renderedScale = 0;
      element.classList.remove('is-rendered');
      canvas.width = 0;
      canvas.height = 0;
      canvas.removeAttribute('style');
      openDoc?.releasePage(pageNumber);
    },

    destroy() {
      renderToken += 1;
      element.remove();
    },
  };
}
