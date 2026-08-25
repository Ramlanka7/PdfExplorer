import type { Action } from './actions';
import { type AppState, type ItemId, type LoadState, type TreeNode, type UserFacingError } from './types';

/**
 * Pure. Every side effect — HTTP, PdfDocument.destroy(), aborting a request — lives in
 * app/explorerController.ts.
 *
 * Cost note (NFR-PERF-01): expand, collapse, and selection copy only the small maps they change,
 * so interaction is O(1) in tree size. Loading a folder's children copies `nodes` once, which is
 * O(items loaded so far) — bounded by what the user has actually expanded, never by the size of
 * the hierarchy.
 */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'roots/loading':
      return { ...state, rootLoadState: 'loading', rootError: null };

    case 'roots/loaded': {
      const nodes = new Map<ItemId, TreeNode>();
      for (const node of action.nodes) nodes.set(node.id, node);
      return {
        ...state,
        nodes,
        childIds: new Map(),
        rootIds: action.nodes.map((node) => node.id),
        rootLoadState: 'loaded',
        rootError: null,
        expandedFolders: new Set(),
        folderLoadState: new Map(),
        folderErrors: new Map(),
      };
    }

    case 'roots/failed':
      return { ...state, rootLoadState: 'failed', rootError: action.error };

    case 'folder/expanded': {
      if (state.expandedFolders.has(action.folderId)) return state;
      const expandedFolders = new Set(state.expandedFolders);
      expandedFolders.add(action.folderId);
      return { ...state, expandedFolders };
    }

    case 'folder/collapsed': {
      if (!state.expandedFolders.has(action.folderId)) return state;
      const expandedFolders = new Set(state.expandedFolders);
      expandedFolders.delete(action.folderId);
      // childIds is untouched: collapsing keeps the cache (FR-LAZY-03). The cache *is* the
      // childIds map; a second cache would be a second truth (NFR-CODE-05).
      return { ...state, expandedFolders };
    }

    case 'folder/loading':
      return withFolderLoadState(state, action.folderId, 'loading', null);

    case 'folder/childrenLoaded': {
      // Drop anything previously loaded under this folder so a refresh cannot leave orphans.
      const pruned = pruneSubtree(state, action.folderId);
      const nodes = new Map(pruned.nodes);
      for (const node of action.nodes) nodes.set(node.id, node);
      const childIds = new Map(pruned.childIds);
      childIds.set(
        action.folderId,
        action.nodes.map((node) => node.id),
      );
      // expandedFolders is deliberately not touched: nothing auto-expands, ever (FR-EXP-05).
      return withFolderLoadState({ ...pruned, nodes, childIds }, action.folderId, 'loaded', null);
    }

    case 'folder/loadFailed':
      return withFolderLoadState(state, action.folderId, 'failed', action.error);

    case 'folder/invalidated': {
      const pruned = pruneSubtree(state, action.folderId);
      const childIds = new Map(pruned.childIds);
      childIds.delete(action.folderId);
      return withFolderLoadState({ ...pruned, childIds }, action.folderId, 'not-loaded', null);
    }

    case 'pdf/selected': {
      if (state.selectedPdfId === action.pdfId && state.pdfLoading) return state;
      return {
        ...state,
        selectedPdfId: action.pdfId,
        pdfLoading: true,
        pdfError: null,
        pdfDocument: null,
      };
    }

    case 'pdf/loaded':
      // Second line of defence for FR-PDF-10: a result for a superseded selection is discarded
      // even if a caller forgets its request token.
      if (state.selectedPdfId !== action.pdfId) return state;
      return { ...state, pdfLoading: false, pdfError: null, pdfDocument: action.document };

    case 'pdf/failed':
      if (state.selectedPdfId !== action.pdfId) return state;
      return { ...state, pdfLoading: false, pdfError: action.error, pdfDocument: null };
  }
}

function withFolderLoadState(
  state: AppState,
  folderId: ItemId,
  loadState: LoadState,
  error: UserFacingError | null,
): AppState {
  const folderLoadState = new Map(state.folderLoadState);
  folderLoadState.set(folderId, loadState);

  const folderErrors = new Map(state.folderErrors);
  if (error === null) folderErrors.delete(folderId);
  else folderErrors.set(folderId, error);

  return { ...state, folderLoadState, folderErrors };
}

/** Removes everything below `folderId`, leaving the folder itself in place. */
function pruneSubtree(state: AppState, folderId: ItemId): AppState {
  const existing = state.childIds.get(folderId);
  if (existing === undefined || existing.length === 0) return state;

  const doomed = new Set<ItemId>();
  const queue: ItemId[] = [...existing];
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined || doomed.has(id)) continue;
    doomed.add(id);
    const grandchildren = state.childIds.get(id);
    if (grandchildren !== undefined) queue.push(...grandchildren);
  }

  const nodes = new Map(state.nodes);
  const childIds = new Map(state.childIds);
  const expandedFolders = new Set(state.expandedFolders);
  const folderLoadState = new Map(state.folderLoadState);
  const folderErrors = new Map(state.folderErrors);
  for (const id of doomed) {
    nodes.delete(id);
    childIds.delete(id);
    expandedFolders.delete(id);
    folderLoadState.delete(id);
    folderErrors.delete(id);
  }

  return { ...state, nodes, childIds, expandedFolders, folderLoadState, folderErrors };
}
