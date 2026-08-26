import type { VisibleRow } from '../state/selectors';
import type { ItemId, LoadState, UserFacingError } from '../state/types';
import { el, setAttr, setHidden, setText, type Component } from './dom';
import { createFolderErrorNode, createFolderNode } from './folderNode';
import { createPdfNode } from './pdfNode';
import type { TreeRowCallbacks, TreeRowProps } from './treeRow';

export interface FolderTreeProps {
  /** Already flattened by selectVisibleRows: only what is actually on screen. */
  readonly rows: readonly VisibleRow[];
  readonly rootLoadState: LoadState;
  readonly rootError: UserFacingError | null;
}

export interface FolderTreeCallbacks {
  readonly onBrowseSource: () => void;
  readonly onClearSource: () => void;
  readonly onToggleFolder: (folderId: ItemId) => void;
  readonly onSelectPdf: (pdfId: ItemId) => void;
  readonly onRetryFolder: (folderId: ItemId) => void;
  readonly onRetryRoots: () => void;
}

type RowKind = 'folder' | 'pdf' | 'error';

interface RowDescriptor {
  readonly key: string;
  readonly kind: RowKind;
  readonly row: VisibleRow;
}

interface RowEntry {
  readonly kind: RowKind;
  readonly component: Component<TreeRowProps>;
}

/**
 * The tree pane. It renders the flattened visible list and nothing else: it never imports from
 * pdf/, never learns what a PDF contains, and meets the viewer only through the store
 * (FR-UI-02).
 *
 * Reconciliation is keyed by row id (D1): expanding a folder inserts that folder's children and
 * leaves every other row's element untouched, so only the affected subtree re-renders
 * (NFR-PERF-03).
 */
export function createFolderTree(callbacks: FolderTreeCallbacks): Component<FolderTreeProps> {
  const element = el('div', { className: 'pane pane--tree' });

  const sourcePicker = el('div', { className: 'source-picker' });
  const sourceOpenButton = el('button', {
    className: 'button button--primary source-picker__button',
    text: 'Browse…',
    attrs: { type: 'button' },
  });
  sourceOpenButton.addEventListener('click', () => callbacks.onBrowseSource());
  const sourceClearButton = el('button', {
    className: 'button button--secondary source-picker__clear',
    text: 'Clear',
    attrs: { type: 'button' },
  });
  sourceClearButton.addEventListener('click', () => callbacks.onClearSource());
  sourcePicker.append(sourceOpenButton, sourceClearButton);

  const status = el('div', { className: 'pane__status', attrs: { role: 'status' } });
  const statusMessage = el('span', { className: 'pane__status-text' });
  const statusRetry = el('button', {
    className: 'button button--retry',
    text: 'Retry',
    attrs: { type: 'button' },
  });
  statusRetry.addEventListener('click', () => callbacks.onRetryRoots());
  status.append(statusMessage, statusRetry);

  const list = el('div', {
    className: 'tree',
    attrs: { role: 'tree', 'aria-label': 'Folders and PDF files' },
  });
  element.append(sourcePicker, status, list);

  const entries = new Map<string, RowEntry>();
  let descriptors: readonly RowDescriptor[] = [];
  let focusedKey: string | null = null;

  const rowCallbacks: TreeRowCallbacks = {
    onToggleFolder: callbacks.onToggleFolder,
    onSelectPdf: callbacks.onSelectPdf,
    onRetryFolder: callbacks.onRetryFolder,
  };

  function createComponent(kind: RowKind): Component<TreeRowProps> {
    switch (kind) {
      case 'folder':
        return createFolderNode(rowCallbacks);
      case 'pdf':
        return createPdfNode(rowCallbacks);
      case 'error':
        return createFolderErrorNode(rowCallbacks);
    }
  }

  function activeIndex(): number {
    if (focusedKey === null) return descriptors.length > 0 ? 0 : -1;
    const index = descriptors.findIndex((descriptor) => descriptor.key === focusedKey);
    return index === -1 && descriptors.length > 0 ? 0 : index;
  }

  /** Only the two rows whose tabindex actually changes touch the DOM (setAttr no-ops). */
  function applyFocus(): void {
    const index = activeIndex();
    descriptors.forEach((descriptor, position) => {
      const entry = entries.get(descriptor.key);
      if (entry === undefined) return;
      setAttr(entry.component.element, 'tabindex', position === index ? '0' : '-1');
    });
  }

  function focusRow(index: number): void {
    const descriptor = descriptors[index];
    if (descriptor === undefined) return;
    focusedKey = descriptor.key;
    applyFocus();
    entries.get(descriptor.key)?.component.element.focus();
  }

  function activate(descriptor: RowDescriptor): void {
    const { node } = descriptor.row;
    switch (descriptor.kind) {
      case 'folder':
        callbacks.onToggleFolder(node.id);
        return;
      case 'pdf':
        callbacks.onSelectPdf(node.id);
        return;
      case 'error':
        callbacks.onRetryFolder(node.id);
    }
  }

  function indexOfParent(index: number): number {
    const parentId = descriptors[index]?.row.node.parentId;
    if (parentId === undefined || parentId === null) return -1;
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      const other = descriptors[candidate];
      if (other !== undefined && other.kind !== 'error' && other.row.node.id === parentId) {
        return candidate;
      }
    }
    return -1;
  }

  // FR-EXP-11: standard tree keyboard model, over the flattened list.
  list.addEventListener('keydown', (event: KeyboardEvent) => {
    const index = activeIndex();
    const descriptor = descriptors[index];
    if (descriptor === undefined) return;

    switch (event.key) {
      case 'ArrowDown':
        focusRow(index + 1);
        break;
      case 'ArrowUp':
        focusRow(index - 1);
        break;
      case 'Home':
        focusRow(0);
        break;
      case 'End':
        focusRow(descriptors.length - 1);
        break;
      case 'ArrowRight':
        if (descriptor.kind === 'folder' && descriptor.row.node.hasChildren && !descriptor.row.expanded) {
          callbacks.onToggleFolder(descriptor.row.node.id);
        } else {
          focusRow(index + 1);
        }
        break;
      case 'ArrowLeft':
        if (descriptor.kind === 'folder' && descriptor.row.expanded) {
          callbacks.onToggleFolder(descriptor.row.node.id);
        } else {
          focusRow(indexOfParent(index));
        }
        break;
      case 'Enter':
      case ' ':
        activate(descriptor);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // Clicking a row focuses it; keep the roving tabindex in step with where focus actually is.
  list.addEventListener('focusin', (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const key = target.closest('[data-row-key]')?.getAttribute('data-row-key');
    if (key === null || key === undefined) return;
    focusedKey = key;
    applyFocus();
  });

  return {
    element,

    update(props) {
      descriptors = describeRows(props.rows);
      reconcile();
      applyStatus(props);
    },

    destroy() {
      for (const entry of entries.values()) entry.component.destroy();
      entries.clear();
      element.remove();
    },
  };

  function reconcile(): void {
    const index = activeIndex();
    const focusKey = descriptors[index]?.key ?? null;
    const live = new Set<string>();

    descriptors.forEach((descriptor, position) => {
      live.add(descriptor.key);

      let entry = entries.get(descriptor.key);
      if (entry === undefined || entry.kind !== descriptor.kind) {
        entry?.component.destroy();
        entry = { kind: descriptor.kind, component: createComponent(descriptor.kind) };
        entries.set(descriptor.key, entry);
        setAttr(entry.component.element, 'data-row-key', descriptor.key);
      }

      entry.component.update({ row: descriptor.row, focused: descriptor.key === focusKey });

      const occupant = list.childNodes[position];
      if (occupant !== entry.component.element) {
        list.insertBefore(entry.component.element, occupant ?? null);
      }
    });

    for (const [key, entry] of [...entries]) {
      if (live.has(key)) continue;
      entry.component.destroy();
      entries.delete(key);
    }
  }

  function applyStatus(props: FolderTreeProps): void {
    const failed = props.rootLoadState === 'failed';
    const loading = props.rootLoadState === 'loading';
    const empty = props.rootLoadState === 'loaded' && props.rows.length === 0;

    setAttr(list, 'aria-busy', loading ? 'true' : null);
    setHidden(list, failed);
    setHidden(status, !(failed || loading || empty));

    if (loading) setText(statusMessage, 'Loading folders...');
    else if (failed) setText(statusMessage, props.rootError?.message ?? 'Folders are unavailable.');
    else if (empty) setText(statusMessage, 'No folders or PDF files here.');
    // Loaded with rows: the bar is hidden, but clear the text anyway so nothing stale is left for
    // a screen reader or a later bug to surface.
    else setText(statusMessage, '');

    // NFR-ERR-04: retry is offered only where retrying can plausibly succeed.
    setHidden(statusRetry, !(failed && (props.rootError?.retryable ?? true)));
  }
}

/**
 * One descriptor per rendered row. A folder whose children failed to load contributes a second
 * row carrying the message and the retry affordance.
 */
function describeRows(rows: readonly VisibleRow[]): RowDescriptor[] {
  const descriptors: RowDescriptor[] = [];
  for (const row of rows) {
    descriptors.push({ key: row.node.id, kind: row.node.type, row });
    if (row.node.type === 'folder' && row.expanded && row.loadState === 'failed') {
      descriptors.push({ key: `${row.node.id}::error`, kind: 'error', row });
    }
  }
  return descriptors;
}
