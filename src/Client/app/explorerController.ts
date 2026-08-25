import type { FolderService } from '../services/folderService';
import type { PdfService } from '../services/pdfService';
import { describeError, isAbortError } from '../services/errors';
import type { IPdfDocumentService, PdfDocument } from '../pdf/types';
import type { Action } from '../state/actions';
import {
  childrenLoaded,
  collapseFolder,
  expandFolder,
  folderLoadFailed,
  folderLoading,
  pdfFailed,
  pdfLoaded,
  rootsFailed,
  rootsLoaded,
  rootsLoading,
  selectPdf,
} from '../state/actions';
import type { Store } from '../state/store';
import { folderLoadStateOf, type AppState, type ItemId, type TreeNode } from '../state/types';

/**
 * Everything asynchronous in the client lives here: requests, the folder load state machine, and
 * the PDF document lifecycle. Components dispatch nothing themselves - they call these methods
 * and re-render from the store.
 */
export interface ExplorerController {
  loadRoots(): Promise<void>;
  /** FR-EXP-07: one behaviour shared by the row and the chevron. */
  toggleFolder(folderId: ItemId): Promise<void>;
  /** FR-LAZY-06: retry clears the failed state and re-requests. */
  retryFolder(folderId: ItemId): Promise<void>;
  selectPdf(pdfId: ItemId): Promise<void>;
  retrySelectedPdf(): Promise<void>;
  dispose(): void;
}

export interface ExplorerControllerDeps {
  readonly store: Store<AppState, Action>;
  readonly folderService: FolderService;
  readonly pdfService: PdfService;
  readonly pdfDocumentService: IPdfDocumentService;
}

export function createExplorerController(deps: ExplorerControllerDeps): ExplorerController {
  const { store, folderService, pdfService, pdfDocumentService } = deps;

  /**
   * Monotonic request token. A slow first selection that resolves after a fast second one must
   * not overwrite it (FR-PDF-10); comparing tokens is what makes "still current" decidable.
   */
  let pdfRequestToken = 0;
  let pdfAbort: AbortController | null = null;
  let openDocument: PdfDocument | null = null;

  async function loadChildren(folder: TreeNode): Promise<void> {
    // The state machine from docs/03-client.md: expanding a Loaded folder makes no request
    // (FR-LAZY-03), and expanding one that is already Loading joins the load in flight rather
    // than starting a second (FR-LAZY-04). Only NotLoaded and Failed reach the service.
    const loadState = folderLoadStateOf(store.getState(), folder.id);
    if (loadState === 'loaded' || loadState === 'loading') return;

    store.dispatch(folderLoading(folder.id));
    try {
      const children = await folderService.getChildren(folder.id, folder.depth);
      store.dispatch(childrenLoaded(folder.id, children));
    } catch (error) {
      store.dispatch(folderLoadFailed(folder.id, describeError(error)));
    }
  }

  function folderNode(folderId: ItemId): TreeNode | null {
    const node = store.getState().nodes.get(folderId);
    // FR-EXP-09: a folder id can never take the PDF path, and vice versa.
    return node !== undefined && node.type === 'folder' ? node : null;
  }

  function releaseOpenDocument(): void {
    // NFR-PERF-06: each document holds a pdf.js worker. Dropping the reference is not enough.
    openDocument?.destroy();
    openDocument = null;
  }

  async function openPdf(pdf: TreeNode): Promise<void> {
    const token = ++pdfRequestToken;

    // FR-PDF-09: the previous document goes away before the next one arrives, so two documents
    // are never resident at once.
    pdfAbort?.abort();
    releaseOpenDocument();

    const abort = new AbortController();
    pdfAbort = abort;
    store.dispatch(selectPdf(pdf.id));

    try {
      // NFR-PERF-04: this is the only place PDF bytes are ever requested, and it is reached
      // only from an explicit selection.
      const source = pdfService.getPdfSource(pdf.id);
      const loaded = await pdfDocumentService.load(source, abort.signal);

      if (token !== pdfRequestToken) {
        // A newer selection won while this one was in flight. Discard, do not render.
        loaded.destroy();
        return;
      }
      openDocument = loaded;
      store.dispatch(pdfLoaded(pdf.id, loaded));
    } catch (error) {
      if (token !== pdfRequestToken || isAbortError(error)) return;
      store.dispatch(pdfFailed(pdf.id, describeError(error)));
    }
  }

  return {
    async loadRoots() {
      // FR-LAZY-01: the initial load fetches root items only. Nothing else runs at startup, and
      // no PDF is touched until the user selects one (NFR-PERF-04).
      store.dispatch(rootsLoading());
      try {
        store.dispatch(rootsLoaded(await folderService.getRootItems()));
      } catch (error) {
        store.dispatch(rootsFailed(describeError(error)));
      }
    },

    async toggleFolder(folderId) {
      const folder = folderNode(folderId);
      if (folder === null) return;

      if (store.getState().expandedFolders.has(folderId)) {
        // Collapsing hides children without discarding them (FR-EXP-03).
        store.dispatch(collapseFolder(folderId));
        return;
      }

      store.dispatch(expandFolder(folderId));
      // FR-EXP-06: a folder with no children never enters the load state machine.
      if (!folder.hasChildren) return;
      await loadChildren(folder);
    },

    async retryFolder(folderId) {
      const folder = folderNode(folderId);
      if (folder === null) return;
      await loadChildren(folder);
    },

    async selectPdf(pdfId) {
      const state = store.getState();
      const node = state.nodes.get(pdfId);
      if (node === undefined || node.type !== 'pdf') return;

      // Re-clicking the document already on screen is not a reason to re-fetch it.
      const alreadyOpen =
        state.selectedPdfId === pdfId && state.pdfError === null && !state.pdfLoading;
      if (alreadyOpen) return;

      await openPdf(node);
    },

    async retrySelectedPdf() {
      const state = store.getState();
      if (state.selectedPdfId === null) return;
      const node = state.nodes.get(state.selectedPdfId);
      if (node === undefined || node.type !== 'pdf') return;
      await openPdf(node);
    },

    dispose() {
      pdfRequestToken += 1;
      pdfAbort?.abort();
      pdfAbort = null;
      releaseOpenDocument();
    },
  };
}
