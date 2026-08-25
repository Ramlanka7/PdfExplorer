import type { PageSize, PdfDocument } from '../pdf/types';
import type { UserFacingError } from '../state/types';
import { el, setHidden, setText, type Component } from './dom';
import { createPageCanvas, type PageCanvas } from './pageCanvas';
import { createViewerToolbar, type FitMode } from './viewerToolbar';

export interface PdfViewerProps {
  readonly fileName: string | null;
  readonly loading: boolean;
  readonly error: UserFacingError | null;
  readonly document: PdfDocument | null;
}

export interface PdfViewerCallbacks {
  readonly onRetry: () => void;
}

/** Discrete steps, no free-form input in v1 (FR-PDF-05, FR-UI-10). */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_ZOOM_INDEX = 2;
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

/** Layout constants are applied to the DOM from here so the scroll maths cannot drift from CSS. */
const PAGE_GAP_PX = 12;
const SURFACE_PADDING_PX = 16;

/** How many pages either side of the viewport stay rendered (NFR-PERF-05). */
const RENDER_NEIGHBOURS = 1;

/** US Letter at 72dpi - only used until the real page size arrives. */
const FALLBACK_PAGE_SIZE: PageSize = { width: 612, height: 792 };

/**
 * The right pane. It receives a PdfDocument and renders it; it knows nothing about folders,
 * parents, or traversal, and never imports the tree (FR-UI-02).
 *
 * It scrolls independently of the tree (FR-PDF-07) and renders pages on demand rather than
 * rasterising the whole document (NFR-PERF-05).
 */
export function createPdfViewer(callbacks: PdfViewerCallbacks): Component<PdfViewerProps> {
  const element = el('div', { className: 'pane pane--viewer' });

  const toolbar = createViewerToolbar({
    onGoToPage: (pageNumber) => scrollToPage(pageNumber),
    onZoomIn: () => zoomBy(1),
    onZoomOut: () => zoomBy(-1),
    onSetFitMode: (mode) => setFitMode(mode),
  });

  const surface = el('div', {
    className: 'viewer__surface',
    attrs: { tabindex: '0', role: 'region', 'aria-label': 'PDF preview' },
  });

  const message = el('div', { className: 'viewer__message', attrs: { role: 'status' } });
  const messageText = el('p', { className: 'viewer__message-text' });
  const messageRetry = el('button', {
    className: 'button button--retry',
    text: 'Retry',
    attrs: { type: 'button' },
  });
  messageRetry.addEventListener('click', () => callbacks.onRetry());
  message.append(messageText, messageRetry);

  const pagesElement = el('div', { className: 'viewer__pages' });
  pagesElement.style.gap = `${PAGE_GAP_PX}px`;
  pagesElement.style.padding = `${SURFACE_PADDING_PX}px`;

  surface.append(message, pagesElement);
  element.append(toolbar.element, surface);

  let openDocument: PdfDocument | null = null;
  let pages: PageCanvas[] = [];
  let pageSizes: (PageSize | null)[] = [];
  let pageOffsets: number[] = [];
  const renderedPages = new Set<number>();

  let defaultPageSize: PageSize = FALLBACK_PAGE_SIZE;
  let fitMode: FitMode = 'width';
  let zoomIndex = DEFAULT_ZOOM_INDEX;
  let currentPage = 1;
  let scrollFrame = 0;

  // FR-PDF-06: fit modes survive a pane resize. The task pane is resized far more often than a
  // browser window, so this is not a nicety.
  const resizeObserver = new ResizeObserver(() => {
    if (fitMode === 'manual') return;
    refresh();
  });
  resizeObserver.observe(surface);

  surface.addEventListener('scroll', () => {
    if (scrollFrame !== 0) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      // FR-PDF-04: the page indicator follows the scroll position.
      currentPage = pageAtScrollPosition();
      renderWindow();
      updateToolbar();
    });
  });

  function sizeOf(pageNumber: number): PageSize {
    return pageSizes[pageNumber - 1] ?? defaultPageSize;
  }

  function effectiveScale(): number {
    if (fitMode === 'manual') return ZOOM_STEPS[zoomIndex] ?? 1;

    const size = sizeOf(currentPage);
    const availableWidth = surface.clientWidth - SURFACE_PADDING_PX * 2;
    // Before first layout - and under jsdom - the surface reports no size; scale 1 is the only
    // honest answer, and the ResizeObserver corrects it the moment there is a real box.
    if (availableWidth <= 0) return 1;

    const widthScale = availableWidth / size.width;
    if (fitMode === 'width') return clampScale(widthScale);

    const availableHeight = surface.clientHeight - SURFACE_PADDING_PX * 2;
    if (availableHeight <= 0) return clampScale(widthScale);
    return clampScale(Math.min(widthScale, availableHeight / size.height));
  }

  function layout(): void {
    const scale = effectiveScale();
    let top = SURFACE_PADDING_PX;
    pageOffsets = pages.map((page, index) => {
      const size = sizeOf(index + 1);
      const height = size.height * scale;
      page.setBox(size.width * scale, height);
      const offset = top;
      top += height + PAGE_GAP_PX;
      return offset;
    });
  }

  function pageAtScrollPosition(): number {
    if (pageOffsets.length === 0) return 1;
    const anchor = surface.scrollTop + Math.max(surface.clientHeight * 0.3, 1);
    let page = 1;
    for (let index = 0; index < pageOffsets.length; index += 1) {
      const offset = pageOffsets[index];
      if (offset === undefined || offset > anchor) break;
      page = index + 1;
    }
    return page;
  }

  function visibleRange(): { first: number; last: number } {
    if (pages.length === 0) return { first: 1, last: 0 };

    const scale = effectiveScale();
    const top = surface.scrollTop;
    const bottom = top + surface.clientHeight;

    let first = pages.length;
    let last = 1;
    for (let index = 0; index < pages.length; index += 1) {
      const offset = pageOffsets[index] ?? 0;
      const height = sizeOf(index + 1).height * scale;
      if (offset + height >= top && offset <= bottom) {
        first = Math.min(first, index + 1);
        last = Math.max(last, index + 1);
      }
    }
    if (first > last) {
      first = currentPage;
      last = currentPage;
    }
    return {
      first: Math.max(1, first - RENDER_NEIGHBOURS),
      last: Math.min(pages.length, last + RENDER_NEIGHBOURS),
    };
  }

  function renderWindow(): void {
    const openDoc = openDocument;
    if (openDoc === null) return;

    const scale = effectiveScale();
    const { first, last } = visibleRange();

    // NFR-PERF-05: everything outside the window gives its bitmap back.
    for (const pageNumber of [...renderedPages]) {
      if (pageNumber >= first && pageNumber <= last) continue;
      pages[pageNumber - 1]?.release(openDoc);
      renderedPages.delete(pageNumber);
    }

    for (let pageNumber = first; pageNumber <= last; pageNumber += 1) {
      const page = pages[pageNumber - 1];
      if (page === undefined) continue;
      renderedPages.add(pageNumber);
      void page.render(openDoc, scale).catch(() => {
        // A page that will not rasterise must not take the pane down with it (NFR-ERR-02); the
        // placeholder stays, and the document remains navigable.
        renderedPages.delete(pageNumber);
      });
      learnPageSize(openDoc, pageNumber);
    }
  }

  /**
   * Placeholders start at page 1's size. Real sizes arrive as pages come into view, which keeps
   * startup O(1) instead of asking a 500-page document for 500 viewports up front.
   */
  function learnPageSize(openDoc: PdfDocument, pageNumber: number): void {
    if (pageSizes[pageNumber - 1] !== undefined && pageSizes[pageNumber - 1] !== null) return;
    pageSizes[pageNumber - 1] = defaultPageSize;
    void openDoc
      .getPageSize(pageNumber)
      .then((size) => {
        if (openDocument !== openDoc) return;
        const known = pageSizes[pageNumber - 1];
        if (known !== null && known !== undefined && known.height === size.height) return;
        pageSizes[pageNumber - 1] = size;
        layout();
        updateToolbar();
      })
      .catch(() => undefined);
  }

  function refresh(): void {
    layout();
    renderWindow();
    updateToolbar();
  }

  function scrollToPage(pageNumber: number): void {
    const target = Math.min(Math.max(pageNumber, 1), Math.max(pages.length, 1));
    const offset = pageOffsets[target - 1];
    if (offset !== undefined) surface.scrollTop = Math.max(offset - SURFACE_PADDING_PX, 0);
    // Setting scrollTop does not always produce a scroll event synchronously, and the indicator
    // must not lag the click.
    currentPage = target;
    renderWindow();
    updateToolbar();
  }

  function zoomBy(delta: number): void {
    const from = fitMode === 'manual' ? zoomIndex : nearestZoomIndex(effectiveScale());
    zoomIndex = Math.min(Math.max(from + delta, 0), ZOOM_STEPS.length - 1);
    fitMode = 'manual';
    refresh();
  }

  function setFitMode(mode: FitMode): void {
    // Pressing the active fit button again returns to a plain zoom, which is what the pressed
    // state promises.
    if (fitMode === mode) {
      zoomIndex = nearestZoomIndex(effectiveScale());
      fitMode = 'manual';
    } else {
      fitMode = mode;
    }
    refresh();
  }

  function updateToolbar(): void {
    const hasDocument = openDocument !== null && pages.length > 0;
    toolbar.update({
      enabled: hasDocument,
      pageCount: pages.length,
      currentPage,
      zoomPercent: Math.round(effectiveScale() * 100),
      fitMode,
      canZoomIn: fitMode !== 'manual' || zoomIndex < ZOOM_STEPS.length - 1,
      canZoomOut: fitMode !== 'manual' || zoomIndex > 0,
    });
  }

  function teardownPages(previous: PdfDocument | null): void {
    for (const pageNumber of renderedPages) pages[pageNumber - 1]?.release(previous);
    renderedPages.clear();
    for (const page of pages) page.destroy();
    pages = [];
    pageSizes = [];
    pageOffsets = [];
    currentPage = 1;
    defaultPageSize = FALLBACK_PAGE_SIZE;
  }

  async function openPages(openDoc: PdfDocument): Promise<void> {
    const size = await openDoc.getPageSize(1).catch(() => FALLBACK_PAGE_SIZE);
    // The selection may have changed while we were waiting (FR-PDF-10).
    if (openDocument !== openDoc) return;

    defaultPageSize = size;
    pageSizes = new Array<PageSize | null>(openDoc.pageCount).fill(null);
    pageSizes[0] = size;
    pages = Array.from({ length: openDoc.pageCount }, (_unused, index) =>
      createPageCanvas(index + 1),
    );
    for (const page of pages) pagesElement.appendChild(page.element);

    surface.scrollTop = 0;
    currentPage = 1;
    refresh();
  }

  function applyStatus(props: PdfViewerProps): void {
    const hasDocument = props.document !== null;
    setHidden(pagesElement, !hasDocument);
    setHidden(message, hasDocument);
    if (hasDocument) return;

    if (props.error !== null) {
      // Already a safe message from services/errors.ts (NFR-ERR-06).
      setText(messageText, props.error.message);
      setHidden(messageRetry, !props.error.retryable);
      return;
    }

    setHidden(messageRetry, true);
    if (props.loading) {
      setText(
        messageText,
        props.fileName === null ? 'Loading...' : `Loading ${props.fileName}...`,
      );
      return;
    }
    setText(messageText, 'Select a PDF to preview.');
  }

  return {
    element,

    update(props) {
      if (props.document !== openDocument) {
        const previous = openDocument;
        openDocument = props.document;
        teardownPages(previous);
        if (props.document !== null) void openPages(props.document);
      }
      applyStatus(props);
      updateToolbar();
    },

    destroy() {
      resizeObserver.disconnect();
      if (scrollFrame !== 0) cancelAnimationFrame(scrollFrame);
      teardownPages(openDocument);
      openDocument = null;
      toolbar.destroy();
      element.remove();
    },
  };
}

function clampScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

function nearestZoomIndex(scale: number): number {
  let best = DEFAULT_ZOOM_INDEX;
  let bestDistance = Number.POSITIVE_INFINITY;
  ZOOM_STEPS.forEach((step, index) => {
    const distance = Math.abs(step - scale);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
