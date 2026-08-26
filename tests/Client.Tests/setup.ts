import { afterEach } from 'vitest';

/**
 * jsdom has no ResizeObserver. The viewer uses one to recompute fit-to-width and fit-to-page
 * when the task pane is resized (FR-PDF-06); a stub keeps that wiring intact without pretending
 * jsdom can lay anything out.
 */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = ResizeObserverStub;
}

/**
 * pdf.js touches the canvas geometry types when its display module is first evaluated, and jsdom
 * ships neither. The integration test only opens documents and reads page sizes - it never
 * rasterises - so a nominal stand-in is enough to let the real library load.
 */
class DOMMatrixStub {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
}

class Path2DStub {
  addPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
}

const shims: Record<string, unknown> = {
  DOMMatrix: DOMMatrixStub,
  Path2D: Path2DStub,
};

for (const [name, value] of Object.entries(shims)) {
  if (!(name in globalThis)) {
    (globalThis as unknown as Record<string, unknown>)[name] = value;
  }
}

/**
 * pdf.js computes document fingerprints with Uint8Array.prototype.toHex(), a TC39 addition
 * newer than this Node.js version. WebView2 (the real host, per D5) already ships it; only the
 * test runtime needs a stand-in.
 */
type Uint8ArrayWithHex = Uint8Array & { toHex?: () => string };

if (typeof (Uint8Array.prototype as Uint8ArrayWithHex).toHex !== 'function') {
  (Uint8Array.prototype as Uint8ArrayWithHex).toHex = function (this: Uint8Array): string {
    return Array.from(this, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
}

afterEach(() => {
  document.body.replaceChildren();
});
