import { selectSelectedPdfName, selectVisibleRows } from '../state/selectors';
import type { AppState, ItemId } from '../state/types';
import { el, setHidden, type Component } from './dom';
import { createFolderTree } from './folderTree';
import { createPdfViewer } from './pdfViewer';

export interface AppCallbacks {
  readonly onBrowseSource: () => void;
  readonly onClearSource: () => void;
  readonly onToggleFolder: (folderId: ItemId) => void;
  readonly onSelectPdf: (pdfId: ItemId) => void;
  readonly onRetryFolder: (folderId: ItemId) => void;
  readonly onRetryRoots: () => void;
  readonly onRetryPdf: () => void;
}

/**
 * The two-pane layout (FR-UI-06) and the wiring between the store and the two panes. The panes
 * never talk to each other; they meet here and in the store, through selectedPdfId (FR-UI-02).
 */
export function createApp(callbacks: AppCallbacks): Component<AppState> {
  const element = el('div', { className: 'app' });

  const tree = createFolderTree({
    onBrowseSource: callbacks.onBrowseSource,
    onClearSource: callbacks.onClearSource,
    onToggleFolder: callbacks.onToggleFolder,
    onSelectPdf: callbacks.onSelectPdf,
    onRetryFolder: callbacks.onRetryFolder,
    onRetryRoots: callbacks.onRetryRoots,
  });
  const viewer = createPdfViewer({ onRetry: callbacks.onRetryPdf });

  // NFR-ERR-02: a render failure must not blank the add-in. If one ever escapes, the panes stay
  // on screen showing their last good state and this explains why nothing is updating.
  const crash = el('div', {
    className: 'app__crash',
    text: 'Something went wrong displaying this view. Close and reopen the pane to continue.',
    attrs: { role: 'alert' },
  });
  crash.hidden = true;

  element.append(tree.element, viewer.element, crash);

  return {
    element,

    update(state) {
      try {
        tree.update({
          rows: selectVisibleRows(state),
          rootLoadState: state.rootLoadState,
          rootError: state.rootError,
        });
        viewer.update({
          fileName: selectSelectedPdfName(state),
          loading: state.pdfLoading,
          error: state.pdfError,
          document: state.pdfDocument,
        });
        setHidden(crash, true);
      } catch (error) {
        setHidden(crash, false);
        // Diagnostic only, and only client-side: nothing here is shown to the user
        // (NFR-ERR-05, NFR-ERR-06).
        console.error('[PdfExplorer] render failed', error);
      }
    },

    destroy() {
      tree.destroy();
      viewer.destroy();
      element.remove();
    },
  };
}
