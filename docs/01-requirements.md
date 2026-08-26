# Requirements

**Source of truth.** Every requirement has a permanent ID. Cite IDs in test names
(`Expanding_a_folder_loads_only_immediate_children_FR_LAZY_02`), commits, and PRs. Retire an ID by
prefixing its row `WITHDRAWN —`; never renumber or reuse one.

This is a prototype's requirement set, not a phased rollout plan — phase-by-phase status and
traceability are tracked separately in [06-delivery.md](06-delivery.md), not here.

## What we're building

Analysts in Excel consult source PDFs while building a workbook, and today they alt-tab to a file
browser and a PDF reader. This is a task-pane add-in with two panes: a lazy-loading folder tree on
the left, a PDF.js viewer on the right.

```
+----------------------+--------------------------------+
| v Contracts          |        Contract A.pdf          |
|   > 2026             |                                |
|   * Contract A.pdf   |        [ PDF CONTENT ]         |
| > Reports            |                                |
+----------------------+--------------------------------+
```

**In scope:** arbitrary-depth browsing one level per expand · multi-page PDF preview with
navigation, zoom, and fit modes · a storage-agnostic provider seam, shipping with a mock ·
explicit loading and error states.

**Out of scope (v1):** writing into the worksheet · editing, uploading, renaming, deleting ·
search, favourites, recents · real authentication (the architecture must *permit* it — `NFR-SEC-05`
— v1 does not implement it) · non-PDF file types, which are simply not surfaced.

**Primary risk:** the task pane is a sandboxed iframe with a strict CSP, HTTPS-only loading, and no
filesystem access. Any design that assumes "point an `<iframe>` at the file path" fails in Excel
even when it works in a browser tab. See [04-office.md](04-office.md).

---

## FR-EXP — Folder / file explorer (left pane)

| ID | Requirement |
| --- | --- |
| FR-EXP-01 | The left pane displays a hierarchical folder/file tree. |
| FR-EXP-02 | Initial state shows only root-level items, all folders collapsed. |
| FR-EXP-03 | Folders expand and collapse. Collapsing hides children without discarding them. |
| FR-EXP-04 | Expanding a folder displays that folder's **immediate** children only. |
| FR-EXP-05 | No subfolder expands automatically, at any time, including after a load completes. |
| FR-EXP-06 | A folder that has children shows an expand indicator (chevron); one that has none does not. |
| FR-EXP-07 | Clicking a folder row toggles expansion (row and chevron share the behaviour). |
| FR-EXP-08 | PDFs are visually distinct from folders (icon + affordance). |
| FR-EXP-09 | Only PDFs are selectable as documents; selecting a folder never triggers a PDF load. |
| FR-EXP-10 | The tree supports arbitrary depth with no hard-coded level limit. |
| FR-EXP-11 | The tree is keyboard navigable and exposes correct ARIA tree semantics. |

## FR-PDF — PDF selection and viewing (right pane)

| ID | Requirement |
| --- | --- |
| FR-PDF-01 | Clicking a PDF marks it selected; the selection is visible in the tree. |
| FR-PDF-02 | The right pane renders the selected PDF inside the add-in (no external app, no download). |
| FR-PDF-03 | Multi-page documents are viewable; the user can reach every page. |
| FR-PDF-04 | Page navigation: next / previous / jump to page, with current-page indication. |
| FR-PDF-05 | Zoom in / out with discrete, predictable steps. |
| FR-PDF-06 | Fit-to-width and fit-to-page modes, which survive pane resize. |
| FR-PDF-07 | The viewer scrolls independently of the tree. |
| FR-PDF-08 | A loading state is displayed while a PDF is being fetched or rendered. |
| FR-PDF-09 | Selecting a different PDF replaces the current one and releases the previous document. |
| FR-PDF-10 | A late response for a superseded selection must not overwrite the newer one (race safety). |
| FR-PDF-11 | Failure to retrieve or render a PDF shows a graceful, user-appropriate error with retry. |

## FR-DATA — Data source abstraction

| ID | Requirement |
| --- | --- |
| FR-DATA-01 | Folder structure is never hard-coded into UI components. |
| FR-DATA-02 | The server exposes a folder abstraction supporting "roots" and "children of folder X". |
| FR-DATA-03 | The server exposes a PDF abstraction returning document bytes/stream by ID. |
| FR-DATA-04 | A mock provider allows full development and test without a real document store. |
| FR-DATA-05 | Replacing the mock with local/network storage, SharePoint, OneDrive, Azure Blob, a DMS, or a REST API requires no client change. |
| FR-DATA-06 | Providers are registered via dependency injection and selectable by configuration. |
| FR-DATA-07 | Item IDs are opaque to the client — no filesystem path is exposed or interpreted client-side. |
| FR-DATA-08 | Provider interfaces are shaped so pagination can be added later without breaking callers. |

## FR-LAZY — Lazy loading and caching

| ID | Requirement |
| --- | --- |
| FR-LAZY-01 | The initial load fetches root items only. |
| FR-LAZY-02 | Children are requested only when their parent is expanded for the first time. |
| FR-LAZY-03 | Loaded folder contents are cached; collapse then re-expand issues no new request. |
| FR-LAZY-04 | Concurrent expands of the same folder result in a single in-flight request. |
| FR-LAZY-05 | Per-folder state distinguishes `NotLoaded`, `Loading`, `Loaded`, `Failed`. |
| FR-LAZY-06 | A failed folder load is retryable, and retry clears the failed state. |
| FR-LAZY-07 | The cache is invalidatable (per folder and wholesale) for future refresh support. |

## FR-UI — UI architecture and layout

| ID | Requirement |
| --- | --- |
| FR-UI-01 | The UI is composed of reusable components: `App`, `FolderTree`, `FolderNode`, `PdfNode`, `PdfViewer`. |
| FR-UI-02 | `FolderTree` contains no PDF-rendering detail; `PdfViewer` contains no tree-traversal detail. |
| FR-UI-03 | A shared, observable application state coordinates selection and load status. |
| FR-UI-04 | State shape covers at least: `selectedPdf`, `folderTree`, `expandedFolders`, `loadingFolders`, `folderErrors`, `pdfLoading`, `pdfError`. |
| FR-UI-05 | State management is hand-rolled and predictable; no large framework unless justified by a decision record. |
| FR-UI-06 | Two-pane layout: left pane has a minimum and configurable width, right pane takes the remainder. |
| FR-UI-07 | Each pane scrolls independently and handles overflow; the page itself never scrolls horizontally. |
| FR-UI-08 | A long folder or file name must not break the layout (truncate with ellipsis + accessible full name). |
| FR-UI-09 | The UI degrades gracefully at narrow task-pane widths (target: usable at 320 px). |
| FR-UI-10 | No decorative or speculative UI elements. Simple, professional, minimal. |

## FR-OFC — Office.js integration

| ID | Requirement |
| --- | --- |
| FR-OFC-01 | The add-in initialises through `Office.onReady` before application bootstrap. |
| FR-OFC-02 | Office.js is used only where Office integration is genuinely required. |
| FR-OFC-03 | Office APIs are confined to `src/Client/office/`; no other module imports `Office.*`. |
| FR-OFC-04 | The add-in functions correctly hosted in Excel's task pane (Windows desktop and Excel on the web). |
| FR-OFC-05 | The implementation respects task-pane restrictions: iframe execution, HTTPS, CSP, CORS, browser security, auth boundaries, PDF-rendering limits. |
| FR-OFC-06 | A valid, validated add-in manifest exists and sideloads. |

---

## NFR-ERR — Error handling

| ID | Requirement |
| --- | --- |
| NFR-ERR-01 | These failures are each handled explicitly: root folder load, subfolder load, PDF retrieval, PDF rendering, network failure, authentication failure, invalid/unsupported PDF, file no longer available. |
| NFR-ERR-02 | No failure crashes or blanks the application; the rest of the UI stays usable. |
| NFR-ERR-03 | Every user-facing error message is useful and actionable. |
| NFR-ERR-04 | Retry is offered wherever retry can plausibly succeed. |
| NFR-ERR-05 | Errors are logged server-side with correlation IDs, and client-side at an appropriate level. |
| NFR-ERR-06 | No stack trace, internal path, connection string, or provider detail reaches the end user. |

## NFR-PERF — Performance

| ID | Requirement |
| --- | --- |
| NFR-PERF-01 | The design holds for hierarchies of thousands-to-millions of files: no operation is O(total items). |
| NFR-PERF-02 | No redundant API requests (dedupe in-flight, serve from cache). |
| NFR-PERF-03 | Expanding a node re-renders that subtree only, not the whole tree. |
| NFR-PERF-04 | PDF content is fetched only on selection; nothing is preloaded or prefetched. |
| NFR-PERF-05 | PDF pages are rendered on demand; all pages of a large document are never held rasterised in memory at once. |
| NFR-PERF-06 | Superseded PDF documents are destroyed and their workers released. |

## NFR-SEC — Security

| ID | Requirement |
| --- | --- |
| NFR-SEC-01 | File names, folder names, URLs, and API responses are treated as untrusted input. |
| NFR-SEC-02 | Names are rendered as text only. No `innerHTML` with provider-derived content. |
| NFR-SEC-03 | URLs are constructed safely (`encodeURIComponent` / `URL`), never by string concatenation of raw IDs. |
| NFR-SEC-04 | No security control is weakened to make file access work — no disabled CSP, no `--disable-web-security`, no wildcard CORS in production, no unvalidated redirects. |
| NFR-SEC-05 | No secrets in client code or the bundle; credentials never cross into Office.js. Auth can be added server-side without client exposure. |
| NFR-SEC-06 | The server validates and canonicalises every incoming ID; path traversal (`..`, absolute paths, symlinks) is rejected by the local provider. |
| NFR-SEC-07 | PDF responses set correct content type and disposition and do not enable script execution. |

## NFR-CODE — Code quality and testability

| ID | Requirement |
| --- | --- |
| NFR-CODE-01 | Clean Architecture: dependencies point inward; no outward references from domain to infrastructure. |
| NFR-CODE-02 | Dependency injection on the server; no service location, no static provider access. |
| NFR-CODE-03 | `async`/`await` for all I/O, with `CancellationToken` propagated. |
| NFR-CODE-04 | Strong typing; `any` requires an inline justification; nullable reference types enabled. |
| NFR-CODE-05 | No duplicated logic between client and server, or across components. |
| NFR-CODE-06 | A newcomer can follow the first implementation quickly — no speculative abstraction. |
| NFR-CODE-07 | Office.js is mocked so the whole suite runs without Excel, network, or files outside the repo. |

> Test coverage is not a separate ID space. Each test is named after the requirement it proves, and
> a requirement is not done without one — see [05-testing.md](05-testing.md).

---

## Definition of Done

| ID | Criterion |
| --- | --- |
| DOD-01 | The project builds successfully (server and client). |
| DOD-02 | The Excel add-in starts successfully. |
| DOD-03 | The task pane loads inside Excel. |
| DOD-04 | The task pane contains two panes. |
| DOD-05 | The left pane displays folders and files. |
| DOD-06 | Folders expand and collapse. |
| DOD-07 | Subfolders are lazy-loaded. |
| DOD-08 | PDFs are displayed only when selected. |
| DOD-09 | The PDF viewer works inside the task pane. |
| DOD-10 | Loading and error states work. |
| DOD-11 | The UI handles narrow task-pane dimensions. |
| DOD-12 | The application never recursively loads the entire folder tree. |
| DOD-13 | Automated tests pass. |
| DOD-14 | No architectural dependency between the UI and the storage implementation. |
| DOD-15 | The mock provider can be replaced by a real enterprise document source without UI changes. |

`DOD-02`, `DOD-03`, `DOD-09`, `DOD-11` require **manual verification inside Excel**; the automated
suite cannot prove them. Record evidence in [06-delivery.md](06-delivery.md#manual-verification-log).
