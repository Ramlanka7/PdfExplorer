import type { PdfDocument } from '../pdf/types';

/**
 * Item identifiers are opaque, provider-issued tokens (FR-DATA-07). The brand exists to make
 * "I parsed a path out of an id" a compile error rather than a code-review question.
 */
export type ItemId = string & { readonly __brand: 'ItemId' };

/** The single sanctioned way to turn a server-issued string into an ItemId. */
export function asItemId(value: string): ItemId {
  return value as ItemId;
}

export type ItemType = 'folder' | 'pdf';

/** Per-folder load state (FR-LAZY-05). */
export type LoadState = 'not-loaded' | 'loading' | 'loaded' | 'failed';

export interface TreeNode {
  readonly id: ItemId;
  readonly name: string;
  readonly type: ItemType;
  readonly hasChildren: boolean;
  readonly parentId: ItemId | null;
  readonly depth: number;
}

/**
 * What the UI is allowed to say about a failure. Built by services/errors.ts from the error
 * envelope; never from an exception message, a status code, or a provider detail (NFR-ERR-06).
 * `retryable` decides whether a Retry affordance is offered at all (NFR-ERR-04).
 */
export interface UserFacingError {
  readonly message: string;
  readonly retryable: boolean;
  /** Echoed in server logs; safe to log client-side, never rendered. */
  readonly correlationId: string | null;
}

/**
 * The whole application state (FR-UI-04). Flat, id-keyed maps rather than a nested tree, so
 * expanding a deep node touches two small maps instead of cloning a spine of objects
 * (NFR-PERF-03).
 */
export interface AppState {
  readonly nodes: ReadonlyMap<ItemId, TreeNode>;
  readonly childIds: ReadonlyMap<ItemId, readonly ItemId[]>;
  readonly rootIds: readonly ItemId[];

  readonly rootLoadState: LoadState;
  readonly rootError: UserFacingError | null;

  readonly expandedFolders: ReadonlySet<ItemId>;
  readonly folderLoadState: ReadonlyMap<ItemId, LoadState>;
  readonly folderErrors: ReadonlyMap<ItemId, UserFacingError>;

  readonly selectedPdfId: ItemId | null;
  readonly pdfLoading: boolean;
  readonly pdfError: UserFacingError | null;
  /**
   * The document currently open in the viewer. Held here so the viewer stays a pure renderer;
   * its lifecycle (destroy the previous one, NFR-PERF-06) belongs to the controller, never to
   * the reducer, which must stay pure.
   */
  readonly pdfDocument: PdfDocument | null;
}

export const initialState: AppState = {
  nodes: new Map(),
  childIds: new Map(),
  rootIds: [],
  rootLoadState: 'not-loaded',
  rootError: null,
  expandedFolders: new Set(),
  folderLoadState: new Map(),
  folderErrors: new Map(),
  selectedPdfId: null,
  pdfLoading: false,
  pdfError: null,
  pdfDocument: null,
};

export function folderLoadStateOf(state: AppState, folderId: ItemId): LoadState {
  return state.folderLoadState.get(folderId) ?? 'not-loaded';
}
