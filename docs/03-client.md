# Client — and why it's built this way

## Component tree

```
App                     layout, store wiring, error boundary
├── FolderTree          renders the flattened visible node list
│   ├── FolderNode      chevron, name, load state, expand/collapse
│   └── PdfNode         icon, name, selection
└── PdfViewer           toolbar + rendering surface
    ├── ViewerToolbar   page nav, zoom, fit mode
    └── PageCanvas      one rendered page
```

**Why components are "dumb."** `FolderTree` never imports from `pdf/`; `PdfViewer` never imports
from the tree or knows an item has a parent. They meet only through the store, via
`selectedPdfId`. Components take props and emit events — no `fetch`, no `Office.*`, no
`pdfjs-dist` inside a component file. That's what makes them independently testable and lets the
tree and the viewer change without ever touching each other.

## Why a hand-rolled store instead of a framework

The whole client is two components with one interaction between them, and the state fits in a
handful of fields. A framework's runtime is bundle weight and CSP/supply-chain surface for a
problem this small doesn't have (see [decisions.md](decisions.md) D1 for the trade-off accepted).
So it's one plain object plus a subscribe/notify pair — nodes and their children in flat, ID-keyed
maps rather than a nested tree, so expanding a deep folder touches two small maps instead of
cloning a spine of nested objects. The exact shape lives in `state/types.ts`; nothing here should
duplicate it and risk drifting from the real thing.

## Why each folder tracks a four-state machine

```
NotLoaded ──expand──> Loading ──success──> Loaded
    ^                    │
    │                  failure
    └────retry────────  Failed
```

This is what makes the lazy-loading requirement true rather than aspirational: expanding a
`Loaded` folder makes no request, expanding a `Loading` one joins the in-flight promise instead of
firing a second, and collapsing only hides children — it never discards the cache. The cache **is**
the children map; there's no second cache to keep in sync with it.

## Rendering approach

Direct DOM, no virtual DOM — each store notification re-renders only the affected subtree, matched
by node ID. Two panes, CSS Grid, each scrolling independently; the page itself never scrolls
horizontally, and long names truncate with an accessible full name behind them. If profiling ever
shows this insufficient at very large folder sizes, virtualising the visible list is a decision to
make from a profile, not a guess made now.

---

## Why PDF.js, and why it's walled off

The task pane has no PDF plugin, and pointing an `<iframe>` at a PDF varies by webview with no
zoom API, no page API, and no reliable error signal. PDF.js renders to a canvas this app controls,
so page navigation, zoom, and fit modes are actually implementable, and a load failure is a typed
error instead of a blank frame.

`pdf/` is the only place `pdfjs-dist` is imported. `PdfViewer` depends on a small
`IPdfDocumentService` seam, not on PDF.js types — so the renderer, or the source it reads from, can
change without touching the viewer.

**Two details that only bite you inside Excel, never in a browser tab:**

- The PDF.js worker must be a same-origin asset (`new URL(..., import.meta.url)`, resolved by
  Vite) — pointed at a CDN, it's silently blocked by Excel's CSP.
- The client never has a file path. A PDF's bytes always come from
  `/api/pdfs/{id}/content`, fetched only after the user selects it — nothing is ever preloaded.

**Memory.** Pages render on demand, never the whole document at once. The previous document is
destroyed before the next loads, since PDF.js holds a worker per open document. Selecting a second
PDF before the first finishes loading is handled with a request token, so a slow first response
can't overwrite a faster second selection.

## Viewer states

| State | UI |
| --- | --- |
| No selection | "Select a PDF to preview." |
| Loading | Spinner + file name; toolbar disabled, not hidden — no layout jump |
| Rendered | Pages + toolbar (nav, zoom, fit) |
| Failed — not found / invalid PDF | A plain message, no retry offered |
| Failed — network/server | A message with **Retry** |

Whether retry appears comes from the error envelope's code
([02-architecture.md](02-architecture.md#error-envelope)), never from matching an exception
message.
