# Client architecture and PDF rendering

## Components (`FR-UI-01`)

```
App                     layout, store wiring, error boundary
├── FolderTree          renders the flattened visible node list
│   ├── FolderNode      chevron, name, load state, expand/collapse
│   └── PdfNode         icon, name, selection
└── PdfViewer           toolbar + rendering surface
    ├── ViewerToolbar   page nav, zoom, fit mode
    └── PageCanvas      one rendered page
```

**Boundaries (`FR-UI-02`):** `FolderTree` never imports from `pdf/`. `PdfViewer` never imports from
the tree or knows an item has a parent. They meet only in the store, through `selectedPdfId`.
Components are dumb — props in, events out. No `fetch`, no `Office.*`, no `pdfjs-dist` inside a
component file; lint rules enforce this (`FR-OFC-03`).

## State (`FR-UI-03`, `FR-UI-04`)

One hand-rolled store — a plain object plus a subscribe/notify pair. No Redux, MobX, or signals
library; introducing one needs a decision record (`FR-UI-05`).

```ts
interface AppState {
  readonly nodes: ReadonlyMap<ItemId, TreeNode>;        // flat, id-keyed
  readonly childIds: ReadonlyMap<ItemId, ItemId[]>;     // parent -> ordered children
  readonly rootIds: readonly ItemId[];

  readonly expandedFolders: ReadonlySet<ItemId>;
  readonly folderLoadState: ReadonlyMap<ItemId, LoadState>;  // FR-LAZY-05
  readonly folderErrors: ReadonlyMap<ItemId, string>;

  readonly selectedPdfId: ItemId | null;
  readonly pdfLoading: boolean;
  readonly pdfError: string | null;
}
```

Flat maps, not a nested tree: expanding a deep node mutates two small maps instead of cloning a
spine of nested objects (`NFR-PERF-03`). The visible list is derived by a selector that walks
`rootIds` and descends only into `expandedFolders`. State changes go through named actions —
`expandFolder`, `collapseFolder`, `childrenLoaded`, `folderLoadFailed`, `selectPdf`, `pdfLoaded`,
`pdfFailed`. Components dispatch; they never mutate.

## Folder load state machine (`FR-LAZY-05`)

```
        NotLoaded ──expand──> Loading ──success──> Loaded
            ^                    │
            │                  failure
            └────retry────────  Failed
```

- Expanding a `Loaded` folder makes no request (`FR-LAZY-03`).
- Expanding a `Loading` folder joins the in-flight promise (`FR-LAZY-04`).
- Collapsing keeps cached children — it changes `expandedFolders` only, never `childIds`.
- A leaf with `hasChildren: false` never enters the machine (`FR-EXP-06`).
- `invalidate(folderId)` returns a node to `NotLoaded` for future refresh (`FR-LAZY-07`).

The cache **is** the `childIds` map. A second cache would be duplicated state.

## Services

```ts
interface FolderService {
  getRootItems(signal?: AbortSignal): Promise<TreeNode[]>;
  getChildren(folderId: ItemId, signal?: AbortSignal): Promise<TreeNode[]>;
}

interface PdfService {
  getPdfSource(pdfId: ItemId): PdfSource;
}
```

Services own the HTTP boundary: build URLs with `encodeURIComponent` (`NFR-SEC-03`), parse the
error envelope, map DTO → `TreeNode`, and translate error codes into user-safe messages. Components
receive messages, never HTTP status codes. In-flight de-duplication lives here — a
`Map<ItemId, Promise<TreeNode[]>>` keyed by folder (`FR-LAZY-04`, `NFR-PERF-02`).

## Rendering approach and layout

Direct DOM, no virtual DOM. Each store notification re-renders only the affected subtree; the tree
reconciles by node ID against the derived visible list. If profiling shows this is insufficient at
large folder sizes, virtualise the visible list — that is a decision, not an improvisation.

- CSS Grid: `grid-template-columns: minmax(180px, var(--tree-width, 240px)) 1fr` (`FR-UI-06`).
- Both panes `overflow: auto`; the body never scrolls horizontally (`FR-UI-07`).
- Names truncate with `text-overflow: ellipsis` plus a `title` attribute (`FR-UI-08`).
- Below ~420 px the panes stack or the tree collapses to a toggle (`FR-UI-09`) — decide with a real
  measurement in Excel, not in a resized browser window.
- Fluent-adjacent visual language so it doesn't look foreign in Excel. No component library
  without a decision justifying the bundle cost.

---

## PDF.js

The task pane has no PDF plugin, and `<iframe src="...pdf">` varies by webview with no zoom API, no
page API, and no reliable error signal (`FR-PDF-04`–`FR-PDF-06`, `FR-PDF-11`). PDF.js renders to a
canvas we control, reports load failure as a typed error, and streams large files by range.

```ts
// src/Client/pdf/ — the ONLY place importing pdfjs-dist
export interface PdfDocument {
  readonly pageCount: number;
  renderPage(pageNumber: number, target: HTMLCanvasElement, scale: number): Promise<void>;
  destroy(): void;
}

export interface IPdfDocumentService {
  load(source: PdfSource, signal?: AbortSignal): Promise<PdfDocument>;
}

export type PdfSource =
  | { kind: 'url'; url: string }               // API streams the bytes
  | { kind: 'bytes'; data: ArrayBuffer };      // tests, embedded mock
```

`PdfViewer` depends on `IPdfDocumentService` only. Swapping the renderer, or the source from URL to
bytes, does not touch the viewer (`FR-PDF-02`).

**Getting the bytes.** The client never has a file path. `PdfService.getPdfSource(id)` returns
`{ kind: 'url', url: '/api/pdfs/<encoded-id>/content' }`. The only sanctioned path from storage to
screen is `provider bytes -> API stream -> PDF.js -> canvas`, triggered by selection and nothing
else (`NFR-PERF-04`).

**Worker.** Resolve through Vite so it is emitted as a hashed, same-origin asset:

```ts
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
```

**Never** point `workerSrc` at a CDN — a CSP-blocked worker is risk R1, and it fails only inside
Excel, after working perfectly in a browser tab.

**Memory and lifecycle.** Render the visible page and a small neighbourhood, never the whole
document (`NFR-PERF-05`). `destroy()` the previous `PdfDocument` before loading the next — PDF.js
holds a worker per document (`NFR-PERF-06`, `FR-PDF-09`). Abort the in-flight load when the
selection changes (`FR-PDF-10`), and cancel a `RenderTask` before starting another on the same
canvas.

## Selection flow (`FR-PDF-09`, `FR-PDF-10`)

```
click PdfNode -> selectPdf(id)
   -> pdfLoading = true, pdfError = null
   -> destroy previous document (NFR-PERF-06)
   -> pdfDocumentService.load(source, { requestId })
   -> on resolve: if requestId is still current -> render; else discard
   -> on reject:  if requestId is still current -> pdfError = safe message
```

A monotonically increasing request token guards against a slow first selection landing after a fast
second one.

## Viewer states (`FR-PDF-08`, `FR-PDF-11`)

| State | UI |
| --- | --- |
| No selection | "Select a PDF to preview." |
| Loading | Spinner + file name; toolbar disabled, not hidden — no layout jump |
| Rendered | Pages + toolbar (nav, zoom, fit) |
| Failed — not found | "This file is no longer available." No retry. |
| Failed — invalid PDF | "This file isn't a readable PDF." No retry. |
| Failed — network/server | Message + **Retry** (`NFR-ERR-04`) |

Retryable vs permanent comes from the error envelope ([02-architecture.md](02-architecture.md#error-envelope)),
never from string-matching an exception message.

**Toolbar:** discrete zoom steps (50/75/100/125/150/200 %), no free-form input in v1 (`FR-UI-10`).
Fit-to-width / fit-to-page recompute on pane resize via `ResizeObserver` (`FR-PDF-06`). Page nav
reflects scroll position, and scrolling updates the indicator (`FR-PDF-04`).
