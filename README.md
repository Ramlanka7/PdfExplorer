# PdfExplorer

**The business problem:** analysts building a workbook in Excel routinely need to check the source
PDF behind a number — a contract, an invoice, a filing — and today that means alt-tabbing to a file
browser and a separate PDF reader, losing their place in the workbook every time.

PdfExplorer removes that context switch. It's an **Excel task-pane add-in** (Office.js + .NET 10 /
ASP.NET Core) for browsing a folder hierarchy and previewing PDFs without leaving Excel. Two panes:
a lazy-loading folder tree on the left, a PDF.js viewer on the right — running inside a real Excel
task pane, not a browser tab.

## What It Does

- **Pick a folder source.** The pane starts empty with a **Browse** button. Clicking it opens the
  native Windows folder picker (no path typing); the chosen folder becomes the tree root. A
  **Clear** button drops the source and returns to the empty state. Nothing is hard-coded — any
  folder on disk that the API process can read works.
- **Lazy folder tree.** Only the root loads up front. Expanding a folder fetches just that folder's
  children — no recursive walk, no speculative prefetch. Expanding the same folder twice reuses the
  cached result instead of re-fetching.
- **PDF preview.** Selecting a PDF streams its bytes through the API and renders it with PDF.js —
  page navigation (jump to page, next/previous), zoom in/out, and fit-to-width / fit-to-page.
- **Runs inside Excel.** Sideloaded as a task-pane add-in on Excel for Windows via
  `manifest/manifest.dev.xml`, served over HTTPS through the Vite dev server with `/api` proxied to
  the same-origin ASP.NET Core API.
- **Typed error handling.** Folder/PDF failures (not found, access denied, invalid source, provider
  unavailable) map to one error envelope end to end and surface as per-node or per-pane messages
  with retry — never a blank pane or a raw exception.

## Architecture At a Glance

- `src/Server` — ASP.NET Core API. `FoldersController` / `PdfsController` talk only to
  `IFolderProvider` / `IPdfProvider`. `SelectableStorageProvider` is the shipped implementation: it
  reads whatever folder `FolderSourceState` currently holds, resolves every path underneath that
  root (rejecting traversal), and streams PDF bytes back. `WindowsFolderBrowseService` drives the
  native picker. `MockFolderProvider` / `MockPdfProvider` exist for tests, not for the running app.
- `src/Client` — vanilla TypeScript + Vite. `state/` holds the store/reducer that drives lazy
  loading and caching; `components/` renders the tree and viewer from that state and never talks to
  storage directly; `services/` is the only layer that calls the API; `pdf/` isolates `pdfjs-dist`
  behind `IPdfDocumentService`; `office/` isolates `Office.*` — nothing else in the client imports it.
- Full detail: [docs/02-architecture.md](docs/02-architecture.md) (layers, API, provider seam) and
  [docs/03-client.md](docs/03-client.md) (client structure, rendering).

## Running Locally & Testing in Excel

Two terminals for the app, a third to sideload:

```bash
dotnet run --project src/Server        # API (Kestrel, https://localhost:7178)
npm --prefix src/Client run dev        # Vite dev server (https://localhost:3000)
```

Then sideload the dev manifest into Excel (`office-addin-debugging` must run from `src/Client`,
where its `package.json` is):

```powershell
cd src/Client
npx office-addin-debugging start ../../manifest/manifest.dev.xml --no-debug
```

Excel launches with the add-in registered — click **PDF Explorer** on the Home ribbon tab to open
the task pane, then **Browse** to pick a folder with some PDFs in it. To unregister:
`npx office-addin-debugging stop ../../manifest/manifest.dev.xml` (same directory).

The two commands above are the whole setup — the HTTPS dev certificate is generated and trusted
automatically the first time `npm run dev` runs (no separate cert command, no admin prompt). If the
pane shows an "ADD-IN ERROR / network connectivity" dialog, its own Retry button is unreliable —
close the task pane and click **PDF Explorer** again instead. WebView2, manifest validation, and
cache-clearing steps (needed only for actually sideloading into Excel, not for the browser check
above) are in the `office-addin-dev` skill.

## Testing

```bash
dotnet test                            # server: xUnit
npm --prefix src/Client test           # client: Vitest + jsdom
npm --prefix src/Client run lint       # eslint + tsc --noEmit
```

`tests/Client.Tests/architecture.test.ts` enforces the layer boundaries above (Office.js isolation,
PDF.js isolation) as an automated check, not just a convention.

## Read In This Order

- [docs/01-requirements.md](docs/01-requirements.md) — numbered source of truth
- [docs/02-architecture.md](docs/02-architecture.md) — layers, API, provider seam
- [docs/03-client.md](docs/03-client.md) — client structure and PDF rendering
- [docs/04-office.md](docs/04-office.md) — Excel task-pane constraints that kill naive designs
- [docs/06-delivery.md](docs/06-delivery.md) — phases, proof points, traceability
- [docs/decisions.md](docs/decisions.md) — why the current choices were made

Contributor-specific workflow, commands, and agent rules live in [CLAUDE.md](CLAUDE.md).

## Why The Design Is This Strict

Four constraints drive nearly every decision:

1. **The task pane is not a normal browser tab.** HTTPS, CSP, iframe hosting, and webview variance
   are first-order constraints.
2. **The client cannot load storage directly.** No filesystem access, no trusted local paths, and
   no client-side credentials — the client only ever talks to the API.
3. **The tree cannot scale if it loads recursively.** Large hierarchies force one-level, on-demand
   loading and caching.
4. **Swapping the storage backend must not touch the client.** `SelectableStorageProvider` reads a
   real Windows folder today; replacing it with SharePoint, Blob, or a DMS is a server-side change
   behind the same two interfaces (see the `add-storage-provider` skill).

## Contributor Notes

The repository is set up for agent-assisted development. If you are extending this add-in, start
with [CLAUDE.md](CLAUDE.md) for the non-negotiable rules, commands, and contributor workflow.
