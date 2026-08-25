import type { ItemId } from '../state/types';
import { setAttr, toggleClass, type Component } from './dom';
import { pdfIcon } from './icons';
import {
  applyRowName,
  applyTreeRow,
  createTreeRowElement,
  type TreeRowCallbacks,
  type TreeRowProps,
} from './treeRow';

/**
 * One PDF row. Visually distinct from a folder and with no expand affordance (FR-EXP-08), and
 * the only row kind that can select a document (FR-EXP-09, FR-PDF-01).
 *
 * Selecting dispatches an id and nothing else - this component has no idea where bytes come
 * from, or that a viewer exists.
 */
export function createPdfNode(callbacks: TreeRowCallbacks): Component<TreeRowProps> {
  const parts = createTreeRowElement('pdf');
  const { element } = parts;

  const icon = pdfIcon();
  icon.classList.add('tree-row__icon');
  element.insertBefore(icon, parts.name);

  let pdfId: ItemId | null = null;
  element.addEventListener('click', () => {
    if (pdfId !== null) callbacks.onSelectPdf(pdfId);
  });

  return {
    element,

    update(props) {
      const { node, selected } = props.row;
      pdfId = node.id;
      setAttr(element, 'data-item-id', node.id);

      applyTreeRow(parts, props, node.depth);
      applyRowName(parts, node.name);
      // FR-PDF-01: the selection is visible in the tree, and announced.
      setAttr(element, 'aria-selected', String(selected));
      toggleClass(element, 'is-selected', selected);
    },

    destroy() {
      element.remove();
    },
  };
}
