import { createApp } from '../components/app';
import { createPdfDocumentService } from '../pdf/pdfDocumentService';
import type { IPdfDocumentService } from '../pdf/types';
import { createFolderService, type FolderService } from '../services/folderService';
import { createPdfService, type PdfService } from '../services/pdfService';
import type { Action } from '../state/actions';
import { reducer } from '../state/reducer';
import { createStore, type Store } from '../state/store';
import { initialState, type AppState } from '../state/types';
import { createExplorerController, type ExplorerController } from './explorerController';

/**
 * The seams, passed in rather than imported by the things that use them. Production wiring is
 * createDefaultDependencies(); tests substitute fakes at exactly these four points, which is why
 * the whole client runs without Excel, a network, or a real PDF (NFR-CODE-07).
 */
export interface AppDependencies {
  readonly folderService: FolderService;
  readonly pdfService: PdfService;
  readonly pdfDocumentService: IPdfDocumentService;
}

export interface AppHandle {
  readonly store: Store<AppState, Action>;
  readonly controller: ExplorerController;
  dispose(): void;
}

export function createDefaultDependencies(): AppDependencies {
  return {
    folderService: createFolderService(),
    pdfService: createPdfService(),
    pdfDocumentService: createPdfDocumentService(),
  };
}

/**
 * Mounts the application into `root` and kicks off the only request made at startup: the root
 * items (FR-LAZY-01). No folder is expanded, and no PDF is fetched, until the user asks
 * (FR-EXP-02, NFR-PERF-04).
 */
export function bootstrap(root: HTMLElement, dependencies: AppDependencies): AppHandle {
  const store = createStore(reducer, initialState);
  const controller = createExplorerController({ store, ...dependencies });

  const app = createApp({
    onToggleFolder: (folderId) => void controller.toggleFolder(folderId),
    onSelectPdf: (pdfId) => void controller.selectPdf(pdfId),
    onRetryFolder: (folderId) => void controller.retryFolder(folderId),
    onRetryRoots: () => void controller.loadRoots(),
    onRetryPdf: () => void controller.retrySelectedPdf(),
  });

  root.appendChild(app.element);
  const unsubscribe = store.subscribe((state) => app.update(state));
  app.update(store.getState());

  void controller.loadRoots();

  return {
    store,
    controller,
    dispose() {
      unsubscribe();
      app.destroy();
      controller.dispose();
    },
  };
}
