/**
 * The whole component contract: an element, an update, and a teardown. Components are dumb -
 * props in, events out (docs/03-client.md). No fetch, no Office.*, no pdfjs-dist below here.
 */
export interface Component<TProps> {
  readonly element: HTMLElement;
  update(props: TProps): void;
  destroy(): void;
}

export interface ElementOptions {
  readonly className?: string;
  /**
   * Set as textContent, never innerHTML. Names and messages originate from the provider and are
   * untrusted (NFR-SEC-02).
   */
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs !== undefined) {
    for (const [name, value] of Object.entries(options.attrs)) node.setAttribute(name, value);
  }
  return node;
}

/**
 * The update helpers below all no-op when the value is unchanged, which is what keeps
 * re-rendering the visible list from touching the DOM of rows that did not change
 * (NFR-PERF-03).
 */
export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
    return;
  }
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

export function toggleClass(node: Element, className: string, on: boolean): void {
  if (node.classList.contains(className) !== on) node.classList.toggle(className, on);
}

export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

export function setDisabled(node: HTMLButtonElement | HTMLInputElement, disabled: boolean): void {
  if (node.disabled !== disabled) node.disabled = disabled;
}
