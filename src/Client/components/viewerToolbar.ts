import { el, setAttr, setDisabled, setText, toggleClass, type Component } from './dom';

/** How the scale is decided. 'manual' means one of the discrete zoom steps (FR-PDF-05). */
export type FitMode = 'manual' | 'width' | 'page';

export interface ViewerToolbarProps {
  /** Disabled, not hidden, while there is nothing to navigate - no layout jump (FR-PDF-08). */
  readonly enabled: boolean;
  readonly pageCount: number;
  readonly currentPage: number;
  readonly zoomPercent: number;
  readonly fitMode: FitMode;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
}

export interface ViewerToolbarCallbacks {
  readonly onGoToPage: (pageNumber: number) => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onSetFitMode: (mode: FitMode) => void;
}

/**
 * Page navigation, zoom, and fit mode (FR-PDF-04, FR-PDF-05, FR-PDF-06). Nothing decorative:
 * every control here is a requirement (FR-UI-10).
 */
export function createViewerToolbar(
  callbacks: ViewerToolbarCallbacks,
): Component<ViewerToolbarProps> {
  const element = el('div', {
    className: 'toolbar',
    attrs: { role: 'toolbar', 'aria-label': 'Document controls' },
  });

  const previous = button('Previous page', 'M10 3.3 5.3 8l4.7 4.7');
  const pageInput = el('input', {
    className: 'toolbar__page-input',
    attrs: {
      type: 'number',
      min: '1',
      step: '1',
      'aria-label': 'Page number',
      inputmode: 'numeric',
    },
  });
  const pageTotal = el('span', { className: 'toolbar__page-total' });
  const next = button('Next page', 'M6 3.3 10.7 8 6 12.7');

  const zoomOut = button('Zoom out', 'M3 8h10');
  const zoomLabel = el('span', {
    className: 'toolbar__zoom-label',
    attrs: { 'aria-live': 'polite' },
  });
  const zoomIn = button('Zoom in', 'M8 3v10M3 8h10');

  const fitWidth = el('button', {
    className: 'button button--toggle',
    text: 'Width',
    attrs: { type: 'button', 'aria-pressed': 'false' },
  });
  const fitPage = el('button', {
    className: 'button button--toggle',
    text: 'Page',
    attrs: { type: 'button', 'aria-pressed': 'false' },
  });

  element.append(
    group(previous, pageInput, pageTotal, next),
    group(zoomOut, zoomLabel, zoomIn),
    group(fitWidth, fitPage),
  );

  let currentPage = 1;
  let pageCount = 0;

  previous.addEventListener('click', () => callbacks.onGoToPage(currentPage - 1));
  next.addEventListener('click', () => callbacks.onGoToPage(currentPage + 1));
  zoomOut.addEventListener('click', () => callbacks.onZoomOut());
  zoomIn.addEventListener('click', () => callbacks.onZoomIn());
  fitWidth.addEventListener('click', () => callbacks.onSetFitMode('width'));
  fitPage.addEventListener('click', () => callbacks.onSetFitMode('page'));

  // FR-PDF-04: jump to page. Commit on Enter or blur, not on every keystroke, so typing "12"
  // does not first jump to page 1.
  const commitPage = (): void => {
    const requested = Number.parseInt(pageInput.value, 10);
    if (!Number.isFinite(requested)) {
      pageInput.value = String(currentPage);
      return;
    }
    callbacks.onGoToPage(Math.min(Math.max(requested, 1), Math.max(pageCount, 1)));
  };
  pageInput.addEventListener('change', commitPage);
  pageInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitPage();
  });

  return {
    element,

    update(props) {
      currentPage = props.currentPage;
      pageCount = props.pageCount;

      if (document.activeElement !== pageInput) {
        const value = props.pageCount === 0 ? '' : String(props.currentPage);
        if (pageInput.value !== value) pageInput.value = value;
      }
      setAttr(pageInput, 'max', String(Math.max(props.pageCount, 1)));
      setText(pageTotal, props.pageCount === 0 ? '' : `of ${props.pageCount}`);
      setText(zoomLabel, `${props.zoomPercent}%`);

      setDisabled(pageInput, !props.enabled);
      setDisabled(previous, !props.enabled || props.currentPage <= 1);
      setDisabled(next, !props.enabled || props.currentPage >= props.pageCount);
      setDisabled(zoomOut, !props.enabled || !props.canZoomOut);
      setDisabled(zoomIn, !props.enabled || !props.canZoomIn);
      setDisabled(fitWidth, !props.enabled);
      setDisabled(fitPage, !props.enabled);

      setAttr(fitWidth, 'aria-pressed', String(props.fitMode === 'width'));
      setAttr(fitPage, 'aria-pressed', String(props.fitMode === 'page'));
      toggleClass(fitWidth, 'is-active', props.fitMode === 'width');
      toggleClass(fitPage, 'is-active', props.fitMode === 'page');
    },

    destroy() {
      element.remove();
    },
  };
}

function group(...children: readonly HTMLElement[]): HTMLElement {
  const wrapper = el('div', { className: 'toolbar__group' });
  wrapper.append(...children);
  return wrapper;
}

/** Icon-only buttons carry their label in aria-label; the glyph is decorative. */
function button(label: string, pathData: string): HTMLButtonElement {
  const node = el('button', {
    className: 'button button--icon',
    attrs: { type: 'button', 'aria-label': label, title: label },
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);

  node.appendChild(svg);
  return node;
}
