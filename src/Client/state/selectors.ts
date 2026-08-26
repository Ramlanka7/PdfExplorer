import { folderLoadStateOf, type AppState, type ItemId, type LoadState, type TreeNode, type UserFacingError } from './types';

/** One row of the tree as the UI needs it — flattened, with its ARIA position precomputed. */
export interface VisibleRow {
  readonly node: TreeNode;
  readonly expanded: boolean;
  readonly loadState: LoadState;
  readonly error: UserFacingError | null;
  readonly selected: boolean;
  readonly setSize: number;
  readonly posInSet: number;
}

/**
 * Derives the visible node list by walking `rootIds` and descending only into `expandedFolders`.
 * Cost is O(visible rows), never O(total items) (NFR-PERF-01) — a collapsed folder's children are
 * skipped without being touched.
 */
export function selectVisibleRows(state: AppState): VisibleRow[] {
  const rows: VisibleRow[] = [];
  appendLevel(state, state.rootIds, rows);
  return rows;
}

function appendLevel(state: AppState, ids: readonly ItemId[], rows: VisibleRow[]): void {
  ids.forEach((id, index) => {
    const node = state.nodes.get(id);
    if (node === undefined) return;

    const expanded = state.expandedFolders.has(id);
    rows.push({
      node,
      expanded,
      loadState: folderLoadStateOf(state, id),
      error: state.folderErrors.get(id) ?? null,
      selected: state.selectedPdfId === id,
      setSize: ids.length,
      posInSet: index + 1,
    });

    if (node.type === 'folder' && expanded) {
      appendLevel(state, state.childIds.get(id) ?? [], rows);
    }
  });
}

/** The name shown while a PDF loads and in the viewer header (FR-PDF-08). */
export function selectSelectedPdfName(state: AppState): string | null {
  if (state.selectedPdfId === null) return null;
  return state.nodes.get(state.selectedPdfId)?.name ?? null;
}
