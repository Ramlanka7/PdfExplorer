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

afterEach(() => {
  document.body.replaceChildren();
});
