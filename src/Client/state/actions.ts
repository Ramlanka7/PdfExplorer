import type { ItemId, TreeNode, UserFacingError } from './types';
import type { PdfDocument } from '../pdf/types';

/**
 * Every state change is a named action (docs/03-client.md). Components dispatch; they never
 * mutate. Async work lives in app/explorerController.ts — actions are data, not effects.
 */
export type Action =
  | { readonly type: 'roots/loading' }
  | { readonly type: 'roots/loaded'; readonly nodes: readonly TreeNode[] }
  | { readonly type: 'roots/failed'; readonly error: UserFacingError }
  | { readonly type: 'folder/expanded'; readonly folderId: ItemId }
  | { readonly type: 'folder/collapsed'; readonly folderId: ItemId }
  | { readonly type: 'folder/loading'; readonly folderId: ItemId }
  | {
      readonly type: 'folder/childrenLoaded';
      readonly folderId: ItemId;
      readonly nodes: readonly TreeNode[];
    }
  | { readonly type: 'folder/loadFailed'; readonly folderId: ItemId; readonly error: UserFacingError }
  | { readonly type: 'folder/invalidated'; readonly folderId: ItemId }
  | { readonly type: 'pdf/selected'; readonly pdfId: ItemId }
  | { readonly type: 'pdf/loaded'; readonly pdfId: ItemId; readonly document: PdfDocument }
  | { readonly type: 'pdf/failed'; readonly pdfId: ItemId; readonly error: UserFacingError };

export const rootsLoading = (): Action => ({ type: 'roots/loading' });
export const rootsLoaded = (nodes: readonly TreeNode[]): Action => ({ type: 'roots/loaded', nodes });
export const rootsFailed = (error: UserFacingError): Action => ({ type: 'roots/failed', error });

export const expandFolder = (folderId: ItemId): Action => ({ type: 'folder/expanded', folderId });
export const collapseFolder = (folderId: ItemId): Action => ({ type: 'folder/collapsed', folderId });
export const folderLoading = (folderId: ItemId): Action => ({ type: 'folder/loading', folderId });
export const childrenLoaded = (folderId: ItemId, nodes: readonly TreeNode[]): Action => ({
  type: 'folder/childrenLoaded',
  folderId,
  nodes,
});
export const folderLoadFailed = (folderId: ItemId, error: UserFacingError): Action => ({
  type: 'folder/loadFailed',
  folderId,
  error,
});
/** FR-LAZY-07: return a folder to `not-loaded` so a later refresh re-fetches it. */
export const invalidateFolder = (folderId: ItemId): Action => ({
  type: 'folder/invalidated',
  folderId,
});

export const selectPdf = (pdfId: ItemId): Action => ({ type: 'pdf/selected', pdfId });
export const pdfLoaded = (pdfId: ItemId, document: PdfDocument): Action => ({
  type: 'pdf/loaded',
  pdfId,
  document,
});
export const pdfFailed = (pdfId: ItemId, error: UserFacingError): Action => ({
  type: 'pdf/failed',
  pdfId,
  error,
});
