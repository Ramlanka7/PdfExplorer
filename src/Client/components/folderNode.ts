import type { ItemId } from '../state/types';
import { setAttr, setText, toggleClass, type Component } from './dom';
import { chevronIcon, folderIcon, warningIcon } from './icons';
import {
  applyRowName,
  applyTreeRow,
  createTreeRowElement,
  type TreeRowCallbacks,
  type TreeRowProps,
} from './treeRow';

/**
 * One folder row: chevron, icon, name, and whatever the load state machine is currently saying
 * about it (FR-LAZY-05).
 */
export function createFolderNode(callbacks: TreeRowCallbacks): Component<TreeRowProps> {
  const parts = createTreeRowElement('folder');
  const { element, lead } = parts;

  const chevron = chevronIcon();
  const icon = folderIcon();
  icon.classList.add('tree-row__icon');
  element.insertBefore(icon, parts.name);

  let folderId: ItemId | null = null;
  let hasChevron = false;

  // FR-EXP-07: the row and the chevron share one behaviour, so one handler on the row does it.
  element.addEventListener('click', () => {
    if (folderId !== null) callbacks.onToggleFolder(folderId);
  });

  return {
    element,

    update(props) {
      const { node, expanded, loadState } = props.row;
      folderId = node.id;
      setAttr(element, 'data-item-id', node.id);

      // FR-EXP-06: only a folder that has children gets an expand affordance.
      if (node.hasChildren !== hasChevron) {
        hasChevron = node.hasChildren;
        if (hasChevron) lead.appendChild(chevron);
        else chevron.remove();
      }

      applyTreeRow(parts, props, node.depth);
      applyRowName(parts, node.name);
      setAttr(element, 'aria-expanded', node.hasChildren ? String(expanded) : null);
      setAttr(element, 'aria-busy', loadState === 'loading' ? 'true' : null);
      toggleClass(element, 'is-expanded', expanded);
      toggleClass(element, 'is-loading', loadState === 'loading');

      // A folder that failed keeps its own row neutral; the message and the retry affordance
      // are a separate row, so the failure reads as being about the contents (FR-LAZY-06).
      setText(parts.hint, loadState === 'loading' ? 'Loading...' : '');
    },

    destroy() {
      element.remove();
    },
  };
}

/**
 * The row that appears under a folder whose children could not be loaded. It is the retry
 * control itself rather than a button nested inside a treeitem, which keeps the tree's ARIA
 * valid while leaving retry one keystroke away (FR-LAZY-06, NFR-ERR-04).
 */
export function createFolderErrorNode(callbacks: TreeRowCallbacks): Component<TreeRowProps> {
  const parts = createTreeRowElement('error');
  const { element } = parts;

  const icon = warningIcon();
  icon.classList.add('tree-row__icon');
  element.insertBefore(icon, parts.name);

  let folderId: ItemId | null = null;
  element.addEventListener('click', () => {
    if (folderId !== null) callbacks.onRetryFolder(folderId);
  });

  return {
    element,

    update(props) {
      const { node, error } = props.row;
      folderId = node.id;
      setAttr(element, 'data-item-id', node.id);

      // The message is already user-safe: services/errors.ts produced it from a typed code,
      // never from an exception (NFR-ERR-06).
      const message = error?.message ?? 'This folder could not be loaded.';
      applyTreeRow(parts, props, node.depth + 1);
      applyRowName(parts, message);
      setText(parts.hint, 'Retry');
      setAttr(element, 'aria-label', `${message} Select to retry loading ${node.name}.`);
    },

    destroy() {
      element.remove();
    },
  };
}
