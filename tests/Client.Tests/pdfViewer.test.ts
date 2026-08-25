import { beforeEach, describe, expect, it } from 'vitest';

import { PdfLoadError } from '../../src/Client/pdf/types';
import { ApiError } from '../../src/Client/services/errors';
import { flush, mountApp, type Harness } from './fakes/appHarness';
import type { FakeItem } from './fakes/fakeFolderService';

const HIERARCHY: readonly FakeItem[] = [
  { id: 'p_contract a/b.pdf', name: 'Contract A.pdf', type: 'pdf' },
  { id: 'p_q1', name: 'Q1 Report.pdf', type: 'pdf' },
];

const SELECTED = 'p_contract a/b.pdf';

describe('pdf viewer', () => {
  let app: Harness;

  beforeEach(async () => {
    app = mountApp(HIERARCHY);
    await flush();
  });

  it('fetches nothing before a PDF is selected (NFR-PERF-04)', () => {
    expect(app.pdfs.calls).toHaveLength(0);
    expect(app.pdfSources.getPdfSource).not.toHaveBeenCalled();
    expect(app.query('.viewer__message-text')?.textContent).toBe('Select a PDF to preview.');
  });

  it('loads the selected PDF through the API and renders it in the pane (FR-PDF-01, FR-PDF-02)', async () => {
    app.pdfs.pageCount = 3;

    await app.click(SELECTED);

    expect(app.state().selectedPdfId).toBe(SELECTED);
    expect(app.row(SELECTED)?.getAttribute('aria-selected')).toBe('true');
    // FR-DATA-07 / NFR-SEC-03: an opaque id goes into the URL encoded, never concatenated raw.
    expect(app.pdfs.calls[0]?.source).toEqual({
      kind: 'url',
      url: '/api/pdfs/p_contract%20a%2Fb.pdf/content',
    });
    expect(app.queryAll('.page')).toHaveLength(3);
    expect(app.query<HTMLElement>('.viewer__message')?.hidden).toBe(true);
  });

  it('makes every page of a multi-page document reachable (FR-PDF-03, FR-PDF-04)', async () => {
    app.pdfs.pageCount = 3;
    await app.click(SELECTED);

    const pageInput = app.query<HTMLInputElement>('.toolbar__page-input');
    expect(pageInput?.value).toBe('1');
    expect(app.query('.toolbar__page-total')?.textContent).toBe('of 3');

    next(app).click();
    expect(pageInput?.value).toBe('2');

    jumpTo(app, 3);
    expect(pageInput?.value).toBe('3');
    expect(next(app).disabled).toBe(true);

    previous(app).click();
    expect(pageInput?.value).toBe('2');
  });

  it('zooms in discrete steps (FR-PDF-05)', async () => {
    await app.click(SELECTED);
    const zoom = (): string | null => app.query('.toolbar__zoom-label')?.textContent ?? null;

    expect(zoom()).toBe('100%');
    zoomIn(app).click();
    expect(zoom()).toBe('125%');
    zoomIn(app).click();
    expect(zoom()).toBe('150%');
    zoomOut(app).click();
    expect(zoom()).toBe('125%');
  });

  it('offers fit-to-width and fit-to-page as exclusive modes (FR-PDF-06)', async () => {
    await app.click(SELECTED);
    const [fitWidth, fitPage] = app.queryAll<HTMLButtonElement>('.button--toggle');

    expect(fitWidth?.getAttribute('aria-pressed')).toBe('true');

    fitPage?.click();
    expect(fitPage?.getAttribute('aria-pressed')).toBe('true');
    expect(fitWidth?.getAttribute('aria-pressed')).toBe('false');

    // Zooming leaves fit mode - the pressed state has to tell the truth.
    zoomIn(app).click();
    expect(fitPage?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders only the pages near the viewport (NFR-PERF-05)', async () => {
    app.pdfs.pageCount = 10;
    await app.click(SELECTED);

    const document = app.pdfs.documents[0];
    const renderedPages = new Set(document?.rendered.map((entry) => entry.pageNumber));
    expect(renderedPages.has(1)).toBe(true);
    expect(renderedPages.has(10)).toBe(false);
    expect(document?.rendered.length).toBeLessThan(10);
  });

  it('shows a loading state with the file name while a PDF is opening (FR-PDF-08)', async () => {
    app.pdfs.manual = true;

    await app.click(SELECTED);

    expect(app.state().pdfLoading).toBe(true);
    expect(app.query('.viewer__message-text')?.textContent).toBe('Loading Contract A.pdf...');
    // Disabled, not hidden: the toolbar must not appear and disappear (no layout jump).
    expect(app.query<HTMLElement>('.toolbar')?.hidden).toBe(false);
    expect(next(app).disabled).toBe(true);

    app.pdfs.resolveCall(0);
    await flush();

    expect(app.state().pdfLoading).toBe(false);
  });

  it('replaces the current document and releases the previous one (FR-PDF-09, NFR-PERF-06)', async () => {
    await app.click(SELECTED);
    await app.click('p_q1');

    expect(app.pdfs.documents[0]?.destroyed).toBe(true);
    expect(app.pdfs.documents[1]?.destroyed).toBe(false);
    expect(app.state().pdfDocument).toBe(app.pdfs.documents[1]);
  });

  it('discards a slow first load that resolves after a newer selection (FR-PDF-10)', async () => {
    app.pdfs.manual = true;

    await app.click(SELECTED);
    await app.click('p_q1');

    // The first request finally comes back - after the user has already moved on.
    app.pdfs.resolveCall(0);
    await flush();

    expect(app.state().selectedPdfId).toBe('p_q1');
    expect(app.state().pdfDocument).toBeNull();
    expect(app.pdfs.documents[0]?.destroyed).toBe(true);
    expect(app.state().pdfLoading).toBe(true);

    app.pdfs.resolveCall(1);
    await flush();

    expect(app.state().pdfDocument).toBe(app.pdfs.documents[1]);
    expect(app.state().pdfLoading).toBe(false);
  });

  it('shows a safe, actionable message and no retry for a permanent failure (FR-PDF-11)', async () => {
    app.pdfs.manual = true;
    await app.click(SELECTED);

    app.pdfs.rejectCall(0, new ApiError('PDF_NOT_FOUND'));
    await flush();

    expect(app.query('.viewer__message-text')?.textContent).toBe('This file is no longer available.');
    expect(app.query<HTMLElement>('.viewer__message .button--retry')?.hidden).toBe(true);
    // NFR-ERR-02: the tree is untouched and still usable.
    expect(app.rows()).toHaveLength(2);
  });

  it('offers retry for a transient failure and recovers (FR-PDF-11, NFR-ERR-04)', async () => {
    app.pdfs.manual = true;
    await app.click(SELECTED);

    app.pdfs.rejectCall(0, new PdfLoadError('unavailable'));
    await flush();

    const retry = app.query<HTMLButtonElement>('.viewer__message .button--retry');
    expect(app.query('.viewer__message-text')?.textContent).toBe(
      'The document service is temporarily unavailable.',
    );
    expect(retry?.hidden).toBe(false);

    retry?.click();
    await flush();
    app.pdfs.resolveCall(1);
    await flush();

    expect(app.state().pdfError).toBeNull();
    expect(app.queryAll('.page').length).toBeGreaterThan(0);
  });

  it('shows a safe non-retryable message when bytes are not a PDF (FR-PDF-11)', async () => {
    app.pdfs.manual = true;
    await app.click(SELECTED);

    app.pdfs.rejectCall(0, new PdfLoadError('invalid'));
    await flush();

    expect(app.query('.viewer__message-text')?.textContent).toBe("This file isn't a readable PDF.");
    expect(app.query<HTMLElement>('.viewer__message .button--retry')?.hidden).toBe(true);
    expect(app.state().pdfLoading).toBe(false);
    // A failed preview must not break navigation in the tree.
    expect(app.rows()).toHaveLength(2);
  });

  it('never puts a stack trace, path, or provider detail on screen (NFR-ERR-06)', async () => {
    app.pdfs.manual = true;
    await app.click(SELECTED);

    app.pdfs.rejectCall(
      0,
      new Error('SharePointException at /srv/documents/secret.pdf:42\n  at Provider.open()'),
    );
    await flush();

    const shown = app.query('.viewer__message-text')?.textContent ?? '';
    expect(shown).toBe('Something went wrong opening this item.');
    for (const leak of ['SharePoint', '/srv/', '.pdf:42', 'at Provider']) {
      expect(shown).not.toContain(leak);
    }
  });
});

const toolbarButton = (app: Harness, label: string): HTMLButtonElement => {
  const button = app.query<HTMLButtonElement>(`.toolbar [aria-label="${label}"]`);
  if (button === null) throw new Error(`No toolbar button labelled "${label}"`);
  return button;
};

const next = (app: Harness): HTMLButtonElement => toolbarButton(app, 'Next page');
const previous = (app: Harness): HTMLButtonElement => toolbarButton(app, 'Previous page');
const zoomIn = (app: Harness): HTMLButtonElement => toolbarButton(app, 'Zoom in');
const zoomOut = (app: Harness): HTMLButtonElement => toolbarButton(app, 'Zoom out');

function jumpTo(app: Harness, pageNumber: number): void {
  const input = app.query<HTMLInputElement>('.toolbar__page-input');
  if (input === null) throw new Error('No page input');
  input.value = String(pageNumber);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
