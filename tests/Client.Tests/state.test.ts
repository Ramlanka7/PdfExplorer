import { describe, expect, it } from 'vitest';

import {
  childrenLoaded,
  collapseFolder,
  expandFolder,
  invalidateFolder,
  pdfLoaded,
  rootsLoaded,
  selectPdf,
} from '../../src/Client/state/actions';
import { reducer } from '../../src/Client/state/reducer';
import { selectVisibleRows } from '../../src/Client/state/selectors';
import { createStore } from '../../src/Client/state/store';
import {
  asItemId,
  initialState,
  type AppState,
  type ItemId,
  type TreeNode,
} from '../../src/Client/state/types';
import { createFakePdfDocument } from './fakes/fakePdfDocumentService';

const folder = (id: string, depth = 0, parentId: string | null = null): TreeNode => ({
  id: asItemId(id),
  name: id,
  type: 'folder',
  hasChildren: true,
  parentId: parentId === null ? null : asItemId(parentId),
  depth,
});

const pdf = (id: string, depth = 0, parentId: string | null = null): TreeNode => ({
  id: asItemId(id),
  name: id,
  type: 'pdf',
  hasChildren: false,
  parentId: parentId === null ? null : asItemId(parentId),
  depth,
});

const id = (value: string): ItemId => asItemId(value);

function loaded(): AppState {
  let state = reducer(initialState, rootsLoaded([folder('f_a'), folder('f_b')]));
  state = reducer(state, childrenLoaded(id('f_a'), [folder('f_a1', 1, 'f_a'), pdf('p_a', 1, 'f_a')]));
  return state;
}

describe('store', () => {
  it('notifies subscribers only when the state actually changes', () => {
    const store = createStore(reducer, initialState);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch(rootsLoaded([folder('f_a')]));
    store.dispatch(collapseFolder(id('f_a')));

    expect(notifications).toBe(1);
  });
});

describe('folder load state machine', () => {
  it('keeps cached children when a folder collapses (FR-EXP-03, FR-LAZY-03)', () => {
    let state = reducer(loaded(), expandFolder(id('f_a')));
    state = reducer(state, collapseFolder(id('f_a')));

    expect(state.expandedFolders.has(id('f_a'))).toBe(false);
    expect(state.childIds.get(id('f_a'))).toHaveLength(2);
    expect(state.folderLoadState.get(id('f_a'))).toBe('loaded');
  });

  it('expands nothing when children arrive (FR-EXP-05)', () => {
    const state = loaded();

    expect(state.expandedFolders.size).toBe(0);
  });

  it('returns a folder to not-loaded and drops its subtree on invalidate (FR-LAZY-07)', () => {
    let state = reducer(loaded(), expandFolder(id('f_a')));
    state = reducer(state, invalidateFolder(id('f_a')));

    expect(state.folderLoadState.get(id('f_a'))).toBe('not-loaded');
    expect(state.childIds.has(id('f_a'))).toBe(false);
    expect(state.nodes.has(id('p_a'))).toBe(false);
    // The folder itself survives; only what was cached below it is discarded.
    expect(state.nodes.has(id('f_a'))).toBe(true);
  });

  it('discards a document that belongs to a superseded selection (FR-PDF-10)', () => {
    const stale = createFakePdfDocument();
    let state = reducer(loaded(), selectPdf(id('p_a')));
    state = reducer(state, selectPdf(id('p_b')));

    state = reducer(state, pdfLoaded(id('p_a'), stale));

    expect(state.pdfDocument).toBeNull();
    expect(state.selectedPdfId).toBe(id('p_b'));
  });
});

describe('visible rows', () => {
  it('walks only expanded folders (FR-EXP-04, NFR-PERF-01)', () => {
    const collapsed = selectVisibleRows(loaded());
    expect(collapsed.map((row) => row.node.id)).toEqual([id('f_a'), id('f_b')]);

    const expanded = selectVisibleRows(reducer(loaded(), expandFolder(id('f_a'))));
    expect(expanded.map((row) => row.node.id)).toEqual([
      id('f_a'),
      id('f_a1'),
      id('p_a'),
      id('f_b'),
    ]);
  });

  it('carries the ARIA position of each row within its own level (FR-EXP-11)', () => {
    const rows = selectVisibleRows(reducer(loaded(), expandFolder(id('f_a'))));

    expect(rows[1]).toMatchObject({ setSize: 2, posInSet: 1 });
    expect(rows[3]).toMatchObject({ setSize: 2, posInSet: 2 });
  });
});
