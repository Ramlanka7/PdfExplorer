import type { VisibleRow } from '../state/selectors';
import type { ItemId } from '../state/types';
import { el, setAttr, setText, toggleClass } from './dom';

/**
 * Shared shape and layout for every row in the tree. FolderNode, PdfNode, and the retry row are
 * different components (FR-UI-01) but they are the same kind of thing structurally, and the
 * indent/name/title handling is written once (NFR-CODE-05).
 */
export interface TreeRowProps {
  readonly row: VisibleRow;
  /** Roving tabindex: exactly one row in the tree is tabbable at a time (FR-EXP-11). */
  readonly focused: boolean;
}

export interface TreeRowCallbacks {
  readonly onToggleFolder: (folderId: ItemId) => void;
  readonly onSelectPdf: (pdfId: ItemId) => void;
  readonly onRetryFolder: (folderId: ItemId) => void;
}

export interface TreeRowParts {
  readonly element: HTMLDivElement;
  readonly lead: HTMLSpanElement;
  readonly name: HTMLSpanElement;
  readonly hint: HTMLSpanElement;
}

const INDENT_BASE_PX = 6;
const INDENT_STEP_PX = 14;

export function createTreeRowElement(modifier: string): TreeRowParts {
  const element = el('div', {
    className: `tree-row tree-row--${modifier}`,
    attrs: { role: 'treeitem', tabindex: '-1' },
  });

  const lead = el('span', { className: 'tree-row__lead' });
  const name = el('span', { className: 'tree-row__name' });
  const hint = el('span', { className: 'tree-row__hint' });
  element.append(lead, name, hint);

  return { element, lead, name, hint };
}

/**
 * Applies everything that is identical for every row: depth indentation, ARIA position, the
 * roving tabindex, and the truncated-but-fully-readable name (FR-UI-08).
 *
 * `indentLevel` is separate from the node's own depth so a folder's retry row can sit at its
 * children's level.
 */
export function applyTreeRow(
  parts: TreeRowParts,
  props: TreeRowProps,
  indentLevel: number,
): void {
  const { element } = parts;
  const indent = `${INDENT_BASE_PX + indentLevel * INDENT_STEP_PX}px`;
  if (element.style.paddingInlineStart !== indent) element.style.paddingInlineStart = indent;

  setAttr(element, 'aria-level', String(indentLevel + 1));
  setAttr(element, 'aria-setsize', String(props.row.setSize));
  setAttr(element, 'aria-posinset', String(props.row.posInSet));
  setAttr(element, 'tabindex', props.focused ? '0' : '-1');
  toggleClass(element, 'is-focused', props.focused);
}

/** Names come from the provider and are untrusted: text only, plus a title for the full value. */
export function applyRowName(parts: TreeRowParts, name: string): void {
  setText(parts.name, name);
  setAttr(parts.name, 'title', name);
}
