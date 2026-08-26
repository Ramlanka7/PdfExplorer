/**
 * A handful of inline SVG glyphs, built with createElementNS so nothing is ever assigned through
 * innerHTML (NFR-SEC-02). Fluent-adjacent shapes so the pane does not look foreign inside Excel;
 * a component library would be bundle weight and a decision record for three icons (FR-UI-10).
 *
 * All icons are decorative: the row's accessible name comes from its text, so they are
 * aria-hidden.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(pathData: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/** Points right when collapsed; CSS rotates it when the row is expanded (FR-EXP-06). */
export function chevronIcon(): SVGSVGElement {
  return icon('M6.2 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 1 1-1.4-1.4L9.5 8 6.2 4.7a1 1 0 0 1 0-1.4z', 'icon icon--chevron');
}

export function folderIcon(): SVGSVGElement {
  return icon('M2 4a1.5 1.5 0 0 1 1.5-1.5h2.3c.4 0 .78.16 1.06.44l1 1H12.5A1.5 1.5 0 0 1 14 5.44V12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4z', 'icon icon--folder');
}

export function pdfIcon(): SVGSVGElement {
  return icon('M4 1.5h5.1c.4 0 .78.16 1.06.44l2.9 2.9c.28.28.44.66.44 1.06V14a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V3A1.5 1.5 0 0 1 4 1.5zm5.5 1.7V5a.5.5 0 0 0 .5.5h1.8L9.5 3.2zM5 9.5h6a.5.5 0 0 0 0-1H5a.5.5 0 0 0 0 1zm0 2.5h6a.5.5 0 0 0 0-1H5a.5.5 0 0 0 0 1z', 'icon icon--pdf');
}

export function warningIcon(): SVGSVGElement {
  return icon('M8 1.8c.4 0 .77.21.96.55l5.8 10.2c.4.7-.1 1.55-.96 1.55H2.2c-.86 0-1.36-.85-.96-1.55l5.8-10.2c.19-.34.56-.55.96-.55zM7.3 6v3.4a.7.7 0 0 0 1.4 0V6a.7.7 0 1 0-1.4 0zM8 12.2a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z', 'icon icon--warning');
}
