import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '../../src/Client/services/errors';
import { flush, mountApp, type Harness } from './fakes/appHarness';
import { id, ROOT_REQUEST, type FakeItem } from './fakes/fakeFolderService';

/**
 * The hierarchy under test. Nothing here is hard-coded in a component: it reaches the tree only
 * through FolderService (FR-DATA-01).
 */
const HIERARCHY: readonly FakeItem[] = [
  {
    id: 'f_contracts',
    name: 'Contracts',
    type: 'folder',
    children: [
      {
        id: 'f_2026',
        name: '2026',
        type: 'folder',
        children: [{ id: 'p_deep', name: 'Deep.pdf', type: 'pdf' }],
      },
      { id: 'p_contract_a', name: 'Contract A.pdf', type: 'pdf' },
    ],
  },
  {
    id: 'f_reports',
    name: 'Reports',
    type: 'folder',
    children: [{ id: 'p_q1', name: 'Q1.pdf', type: 'pdf' }],
  },
  { id: 'f_archive', name: 'Archive', type: 'folder' },
  { id: 'p_readme', name: 'Readme.pdf', type: 'pdf' },
];

describe('folder tree', () => {
  let app: Harness;

  beforeEach(async () => {
    app = mountApp(HIERARCHY);
    await flush();
  });

  it('shows root items only, all collapsed, after one request (FR-EXP-01, FR-EXP-02, FR-LAZY-01)', () => {
    expect(app.rows().map(app.nameOf)).toEqual(['Contracts', 'Reports', 'Archive', 'Readme.pdf']);
    expect(app.folders.requests).toEqual([ROOT_REQUEST]);
    expect(app.state().expandedFolders.size).toBe(0);
    for (const row of app.rows()) {
      if (row.getAttribute('aria-expanded') !== null) {
        expect(row.getAttribute('aria-expanded')).toBe('false');
      }
    }
  });

  it('requests children only when a folder is expanded for the first time (FR-LAZY-02)', async () => {
    expect(app.folders.countOf('f_contracts')).toBe(0);

    await app.click('f_contracts');

    expect(app.folders.countOf('f_contracts')).toBe(1);
  });

  it('shows the immediate children of an expanded folder and nothing below them (FR-EXP-04)', async () => {
    await app.click('f_contracts');

    expect(app.rows().map(app.nameOf)).toEqual([
      'Contracts',
      '2026',
      'Contract A.pdf',
      'Reports',
      'Archive',
      'Readme.pdf',
    ]);
    // Deep.pdf lives under 2026, which is still collapsed - and was never requested.
    expect(app.folders.requests).toEqual([ROOT_REQUEST, 'f_contracts']);
  });

  it('expands nothing automatically when children arrive (FR-EXP-05)', async () => {
    await app.click('f_contracts');

    expect([...app.state().expandedFolders]).toEqual(['f_contracts']);
    expect(app.row('f_2026')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('hides children on collapse without discarding them (FR-EXP-03)', async () => {
    await app.click('f_contracts');
    await app.click('f_contracts');

    expect(app.rows().map(app.nameOf)).toEqual(['Contracts', 'Reports', 'Archive', 'Readme.pdf']);
    // The cache is the childIds map; collapsing must not touch it.
    expect(app.state().childIds.get(id('f_contracts'))).toHaveLength(2);
  });

  it('issues no second request when a folder is collapsed and expanded again (FR-LAZY-03)', async () => {
    await app.click('f_contracts');
    await app.click('f_contracts');
    await app.click('f_contracts');

    expect(app.folders.countOf('f_contracts')).toBe(1);
  });

  it('shares one request across expands that overlap in flight (FR-LAZY-04)', async () => {
    app.folders.hold('f_contracts');

    await app.click('f_contracts');
    await app.click('f_contracts');
    await app.click('f_contracts');
    app.folders.release('f_contracts');
    await flush();

    expect(app.folders.countOf('f_contracts')).toBe(1);
    expect(app.state().folderLoadState.get(id('f_contracts'))).toBe('loaded');
  });

  it('moves a folder through the four load states (FR-LAZY-05)', async () => {
    expect(app.state().folderLoadState.get(id('f_reports'))).toBeUndefined();

    app.folders.hold('f_reports');
    await app.click('f_reports');
    expect(app.state().folderLoadState.get(id('f_reports'))).toBe('loading');
    expect(app.row('f_reports')?.getAttribute('aria-busy')).toBe('true');

    app.folders.release('f_reports');
    await flush();
    expect(app.state().folderLoadState.get(id('f_reports'))).toBe('loaded');
  });

  it('reports a failed folder load and recovers on retry (FR-LAZY-06, NFR-ERR-04)', async () => {
    app.folders.failNext('f_reports', new ApiError('UPSTREAM_UNAVAILABLE'));

    await app.click('f_reports');

    expect(app.state().folderLoadState.get(id('f_reports'))).toBe('failed');
    const errorRow = app.row('f_reports::error');
    expect(errorRow).not.toBeNull();
    expect(app.nameOf(errorRow as Element)).toBe('The document service is temporarily unavailable.');

    await app.click('f_reports::error');

    expect(app.state().folderLoadState.get(id('f_reports'))).toBe('loaded');
    expect(app.row('f_reports::error')).toBeNull();
    expect(app.rows().map(app.nameOf)).toContain('Q1.pdf');
  });

  it('never asks the PDF service for anything when folders are clicked (FR-EXP-09)', async () => {
    await app.click('f_contracts');
    await app.click('f_reports');
    await app.click('f_archive');

    expect(app.pdfSources.getPdfSource).not.toHaveBeenCalled();
    expect(app.pdfs.calls).toHaveLength(0);
  });

  it('reaches two endpoints for root plus one expand, and never a recursive one (DOD-12)', async () => {
    await app.click('f_contracts');

    expect(app.folders.requests).toEqual([ROOT_REQUEST, 'f_contracts']);
    // Grandchildren are absent from the store entirely, not merely hidden.
    expect(app.state().nodes.has(id('p_deep'))).toBe(false);
  });

  it('shows an expand affordance only for folders that have children (FR-EXP-06)', () => {
    expect(app.row('f_contracts')?.querySelector('.icon--chevron')).not.toBeNull();
    expect(app.row('f_archive')?.querySelector('.icon--chevron')).toBeNull();
    expect(app.row('f_archive')?.getAttribute('aria-expanded')).toBeNull();
  });

  it('distinguishes PDFs from folders and marks only PDFs selectable (FR-EXP-08, FR-PDF-01)', () => {
    const pdfRow = app.row('p_readme');
    expect(pdfRow?.classList.contains('tree-row--pdf')).toBe(true);
    expect(pdfRow?.querySelector('.icon--pdf')).not.toBeNull();
    expect(pdfRow?.getAttribute('aria-selected')).toBe('false');

    const folderRow = app.row('f_contracts');
    expect(folderRow?.querySelector('.icon--folder')).not.toBeNull();
    expect(folderRow?.getAttribute('aria-selected')).toBeNull();
  });

  it('supports arbitrary depth with no level limit (FR-EXP-10)', async () => {
    const deep = mountApp([chain(6)]);
    await flush();

    for (let level = 0; level < 6; level += 1) {
      await deep.click(`f_${level}`);
    }

    expect(deep.row('f_5')?.getAttribute('aria-level')).toBe('6');
    expect(deep.rows()).toHaveLength(7);
    deep.handle.dispose();
  });

  it('renders untrusted names as text and keeps the full name available (NFR-SEC-02, FR-UI-08)', async () => {
    const hostile = '<img src=x onerror="alert(1)"> a very long folder name that will not fit';
    const tricky = mountApp([{ id: 'f_x', name: hostile, type: 'folder' }]);
    await flush();

    const row = tricky.row('f_x');
    expect(row?.querySelector('img')).toBeNull();
    expect(tricky.nameOf(row as Element)).toBe(hostile);
    expect(row?.querySelector('.tree-row__name')?.getAttribute('title')).toBe(hostile);
    tricky.handle.dispose();
  });

  it('re-renders only the affected subtree when a folder expands (NFR-PERF-03)', async () => {
    const untouched = app.row('f_reports');
    const alsoUntouched = app.row('p_readme');

    await app.click('f_contracts');

    expect(app.row('f_reports')).toBe(untouched);
    expect(app.row('p_readme')).toBe(alsoUntouched);
  });

  it('exposes tree semantics and keyboard navigation (FR-EXP-11)', async () => {
    const tree = app.query('[role="tree"]');
    expect(tree).not.toBeNull();

    const first = app.row('f_contracts') as HTMLElement;
    expect(first.getAttribute('role')).toBe('treeitem');
    expect(first.getAttribute('aria-level')).toBe('1');
    expect(first.getAttribute('aria-setsize')).toBe('4');
    expect(first.getAttribute('aria-posinset')).toBe('1');
    expect(first.getAttribute('tabindex')).toBe('0');

    first.focus();
    press(tree as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(app.row('f_reports'));
    expect(app.row('f_reports')?.getAttribute('tabindex')).toBe('0');
    expect(app.row('f_contracts')?.getAttribute('tabindex')).toBe('-1');

    press(tree as HTMLElement, 'ArrowRight');
    await flush();
    expect(app.state().expandedFolders.has(id('f_reports'))).toBe(true);

    press(tree as HTMLElement, 'ArrowLeft');
    await flush();
    expect(app.state().expandedFolders.has(id('f_reports'))).toBe(false);
  });

  it('re-requests root items after the folder picker returns a selection', async () => {
    const openButton = app.query<HTMLButtonElement>('.source-picker__button');
    expect(openButton).not.toBeNull();

    openButton!.click();
    await flush();

    expect(app.folders.browseCalls).toBe(1);
    expect(app.folders.requests).toEqual([ROOT_REQUEST, ROOT_REQUEST]);
  });

  it('clears the tree and drops the open source when Clear is clicked', async () => {
    await app.click('f_contracts');
    const clearButton = app.query<HTMLButtonElement>('.source-picker__clear');
    expect(clearButton).not.toBeNull();

    clearButton!.click();
    await flush();

    expect(app.folders.clearCalls).toBe(1);
    expect(app.rows()).toHaveLength(0);
    expect(app.state().rootLoadState).toBe('loaded');
    expect(app.state().expandedFolders.size).toBe(0);
  });

  it('leaves the tree untouched when the folder picker is canceled', async () => {
    app.folders.cancelNextBrowse();
    const openButton = app.query<HTMLButtonElement>('.source-picker__button');

    openButton!.click();
    await flush();

    expect(app.folders.browseCalls).toBe(1);
    // No reload was ever attempted - a cancel is not treated as a failure either.
    expect(app.folders.requests).toEqual([ROOT_REQUEST]);
    expect(app.state().rootLoadState).toBe('loaded');
    expect(app.rows().map(app.nameOf)).toEqual(['Contracts', 'Reports', 'Archive', 'Readme.pdf']);
  });

  it('keeps the rest of the UI usable when the root load fails (NFR-ERR-02, NFR-ERR-04)', async () => {
    const broken = mountApp(HIERARCHY);
    broken.folders.failNext(ROOT_REQUEST, new ApiError('NETWORK'));
    // The harness bootstraps immediately, so re-run the root load with the failure armed.
    await broken.handle.controller.loadRoots();
    await flush();

    expect(broken.query('.pane__status-text')?.textContent).toBe(
      "Can't reach the document service. Check your connection.",
    );
    expect(broken.query<HTMLElement>('.button--retry')?.hidden).toBe(false);
    expect(broken.query('.viewer__message-text')?.textContent).toBe('Select a PDF to preview.');
    broken.handle.dispose();
  });
});

function press(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

/** A single chain `levels` deep, ending in a PDF - for the no-hard-coded-depth requirement. */
function chain(levels: number): FakeItem {
  let node: FakeItem = { id: 'p_leaf', name: 'Leaf.pdf', type: 'pdf' };
  for (let level = levels - 1; level >= 0; level -= 1) {
    node = { id: `f_${level}`, name: `Level ${level}`, type: 'folder', children: [node] };
  }
  return node;
}
