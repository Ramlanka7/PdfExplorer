# Architecture, API, and providers

> **RATIFIED 2026-08-25.** Phase 1 closed. Changing anything below means a new entry in
> [decisions.md](decisions.md), not an edit in place.

## Layering

```
        Excel host
            |
   +--------v---------------------------------+
   |  Task pane (browser iframe, HTTPS)        |
   |  office/      Office.onReady, host info   |  <- only place Office.* appears
   |  app/         bootstrap, store, wiring    |
   |  components/  App, FolderTree, PdfViewer  |  <- no fetch, no Office, no pdfjs
   |  services/    FolderService, PdfService   |  <- HTTP boundary, DTO -> view model
   |  pdf/         PdfDocumentService (pdf.js) |  <- only place pdfjs-dist appears
   +-----|-------------------------------------+
         | HTTPS + JSON / application/pdf
   +-----v-------------------------------------+
   |  ASP.NET Core (.NET 10)                    |
   |  Controllers/  thin HTTP, no logic          |
   |  Services/     orchestration, validation,   |
   |                caching, mapping to DTOs     |
   |  Providers/    IFolderProvider,             |  <- the storage seam
   |                IPdfProvider (+ Mock, Local) |
   |  Models/       domain + DTOs                |
   +-----|--------------------------------------+
   Mock data | Local FS | SharePoint | OneDrive | Blob | DMS | REST
```

**Dependency rule (`NFR-CODE-01`):** arrows point inward and downward only. `Providers` may
reference `Models`; `Models` references nothing. A component may not reach past `services/` to
`fetch`. `services/` may not import from `components/`.

| Concern | Client | Server |
| --- | --- | --- |
| Tree structure and expansion state | ✅ owns | ❌ stateless |
| Which items exist under a folder | ❌ asks | ✅ owns |
| Caching loaded children | ✅ session cache (`FR-LAZY-03`) | optional provider-level cache |
| PDF bytes | ❌ never has a path | ✅ streams them |
| Storage credentials | ❌ never (`NFR-SEC-05`) | ✅ owns |
| ID meaning | ❌ opaque token (`FR-DATA-07`) | ✅ resolves it |
| Rendering | ✅ PDF.js | ❌ |
| Office host integration | ✅ `office/` only | ❌ |

The client cannot reach a file share, SharePoint, or Blob storage directly without either exposing
credentials to the browser or fighting CORS and CSP. A server mediator solves the security boundary
and the storage abstraction at once.

**The four seams** — storage (`IFolderProvider`/`IPdfProvider`), transport (`FolderService`/
`PdfService`), rendering (`IPdfDocumentService`), host (`OfficeHost`). These are the only interfaces
justified up front (`NFR-CODE-06`). Anything else needs a reason at the moment it is written.

## Data models

```csharp
public enum ExplorerItemType { Folder, Pdf }

public sealed record ExplorerItem(
    ExplorerItemId Id,       // opaque, provider-issued
    string Name,             // display name, untrusted
    ExplorerItemType Type,
    bool HasChildren,        // folders only; false for PDFs
    ExplorerItemId? ParentId);

public sealed record PdfContent(Stream Content, string FileName, long? Length, string ContentType);
```

```ts
type ItemId = string & { readonly __brand: 'ItemId' };
type LoadState = 'not-loaded' | 'loading' | 'loaded' | 'failed';   // FR-LAZY-05

interface TreeNode {
  readonly id: ItemId;
  readonly name: string;
  readonly type: 'folder' | 'pdf';
  readonly hasChildren: boolean;
  readonly parentId: ItemId | null;
  readonly depth: number;
}
```

The client's DTO type is defined once, in `services/`, and mapped to `TreeNode` at that boundary —
components never see a raw API shape.

## Project structure

```
PdfExplorer.sln
manifest/            manifest.xml (+ manifest.dev.xml for sideload)
src/Server/
  wwwroot/           built client bundle (production)
  Controllers/       FoldersController, PdfsController
  Services/          ExplorerService, PdfDeliveryService
  Providers/         IFolderProvider, IPdfProvider, Mock/, Local/
  Models/            domain records + Dtos/
  Infrastructure/    error envelope, logging, DI extensions
src/Client/          Vite project; builds into src/Server/wwwroot
  components/        App, FolderTree, FolderNode, PdfNode, PdfViewer, Toolbar
  services/          folderService, pdfService, http, dtos
  state/             store, actions, selectors, types
  office/            officeHost, officeReady
  pdf/               pdfDocumentService (pdfjs-dist), pageRenderer
  taskpane.html      module entry + nomodule unsupported-host fallback
tests/Server.Tests/  tests/Client.Tests/
```

One server project, one client project, two test projects. Splitting into Domain/Application/
Infrastructure assemblies is not justified at this size and can be done later.

---

## API contract

Base path `/api`. JSON in, JSON out, except PDF content. `async` end to end, honouring client
disconnect via `CancellationToken` (`NFR-CODE-03`).

| Endpoint | Returns | Requirements |
| --- | --- | --- |
| `GET /api/folders/root` | Root items. Never recursive. | `FR-LAZY-01`, `DOD-12` |
| `GET /api/folders/{folderId}/children` | Immediate children only. `404` if unknown or not visible. | `FR-EXP-04`, `FR-LAZY-02` |
| `GET /api/pdfs/{pdfId}/content` | The bytes. | `FR-DATA-03` |

Both folder endpoints return the same envelope, and accept `?cursor=&limit=` which **v1 providers
may ignore** — clients must tolerate a non-null `nextCursor` (`FR-DATA-08`):

```json
{
  "items": [
    { "id": "p_contract_a", "name": "Contract A.pdf", "type": "pdf",    "hasChildren": false, "parentId": "f_contracts" },
    { "id": "f_2026",       "name": "2026",           "type": "folder", "hasChildren": true,  "parentId": "f_contracts" }
  ],
  "nextCursor": null
}
```

| Field | Notes |
| --- | --- |
| `id` | Opaque, provider-issued, URL-safe. Client must not parse it (`FR-DATA-07`). |
| `name` | Display name. **Untrusted** — render as text (`NFR-SEC-02`). |
| `type` | `"folder"` \| `"pdf"`. Closed set; unknown values ignored by the client. |
| `hasChildren` | Drives the expand chevron (`FR-EXP-06`). `false` for PDFs. |
| `parentId` | `null` at root. |

Non-PDF files are filtered server-side and never appear. A response **never** contains
grandchildren.

PDF content sets `Content-Type: application/pdf`, `Content-Disposition: inline; filename="..."`
(RFC 6266 encoded), `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=60`, and
supports range requests where the provider can (`NFR-SEC-07`).

### Error envelope

Every non-2xx returns this shape. The message is **safe to display**; detail stays in the log
(`NFR-ERR-06`). `correlationId` is echoed in server logs (`NFR-ERR-05`) and encodes nothing
sensitive.

```json
{ "error": { "code": "FOLDER_NOT_FOUND", "message": "That folder is no longer available.", "correlationId": "0HN7…" } }
```

| Code | HTTP | Client behaviour |
| --- | --- | --- |
| `FOLDER_NOT_FOUND` | 404 | Mark node failed, offer refresh of parent |
| `PDF_NOT_FOUND` | 404 | "This file is no longer available." No retry. |
| `PDF_INVALID` | 415 | "This file isn't a readable PDF." No retry. |
| `UNAUTHORIZED` | 401 | Surface sign-in requirement (`NFR-ERR-01`) |
| `FORBIDDEN` | 403 | "You don't have access to this item." No retry. |
| `UPSTREAM_UNAVAILABLE` | 502/503 | Retry with backoff (`NFR-ERR-04`) |
| `INTERNAL` | 500 | Generic message + retry |

IDs are validated and canonicalised before touching a provider (`NFR-SEC-06`). An unmatched `/api`
route returns the envelope, not the task-pane HTML fallback. Endpoint shape changes are breaking —
update this doc and the client DTO in one change.

---

## Provider abstractions

The single seam that keeps the UI ignorant of storage (`FR-DATA-05`, `DOD-14`, `DOD-15`).

```csharp
public interface IFolderProvider
{
    Task<FolderPage> GetRootItemsAsync(ItemQuery query, CancellationToken cancellationToken);
    Task<FolderPage> GetChildrenAsync(ExplorerItemId folderId, ItemQuery query, CancellationToken cancellationToken);
}

public interface IPdfProvider
{
    Task<PdfContent> OpenPdfAsync(ExplorerItemId pdfId, CancellationToken cancellationToken);
}

// Pagination-ready from day one; v1 providers may ignore Cursor/Limit (FR-DATA-08).
public sealed record ItemQuery(string? Cursor = null, int? Limit = null);
public sealed record FolderPage(IReadOnlyList<ExplorerItem> Items, string? NextCursor);
```

Two interfaces, not one and not three: folders and documents are the only two things the UI asks
for. `OpenPdfAsync` returns a stream the caller disposes — providers must not buffer whole
documents in memory (`NFR-PERF-05`).

**Failure contract.** Providers throw these four and never leak storage-specific exception types
(`SharePointException`, `IOException`, …) past their own boundary; the service layer maps them to
the envelope above.

| Exception | Meaning |
| --- | --- |
| `ItemNotFoundException` | ID unknown, deleted, or not visible |
| `ItemAccessDeniedException` | Authenticated but not permitted |
| `ProviderUnavailableException` | Upstream down, timeout, transient |
| `InvalidPdfException` | Retrieved, but not a usable PDF |

**Implementations.** `MockFolderProvider`/`MockPdfProvider` (phase 2) — in-memory tree plus a small
embedded PDF, deterministic, no I/O (`FR-DATA-04`). `LocalFileSystem*` (phase 4) — real files under
a configured root; **this is where path-traversal defence lives** (`NFR-SEC-06`). SharePoint /
OneDrive / Blob / DMS / REST are not built in v1; the point is that adding one touches only
`Providers/` and DI registration.

Selection is by configuration (`FR-DATA-06`): `{ "Explorer": { "Provider": "Mock" } }` in
`appsettings.json`, resolved by one `services.AddExplorerProvider(configuration)` extension.

**ID discipline.** Provider IDs are opaque tokens (`FR-DATA-07`). A filesystem path, SharePoint
drive item path, or blob key must never reach the client verbatim. The provider issues the ID and
is the only component that can interpret it. The local provider maps ID → path through its own
table or a signed form, then canonicalises and verifies the result is inside the configured root
before any file access. An ID that fails validation is `ItemNotFoundException` — never an error
that reveals why.

**Adding a provider:** implement both interfaces without changing them, return immediate children
only, set `HasChildren` cheaply (prefer an optimistic `true` over an expensive probe, and document
the choice), map failures to the four exceptions, keep credentials server-side, add provider tests,
and change **zero** client files. If you can't, the seam is wrong — fix the seam. The
`add-storage-provider` skill walks this end to end.

---

## Technical risks

| # | Risk | Mitigation | Req |
| --- | --- | --- | --- |
| R1 | Task-pane CSP blocks the PDF.js worker or `blob:`/`data:` URLs | Vite emits the worker as a same-origin hashed asset via `new URL(..., import.meta.url)`. **Still verify in real Excel** | FR-OFC-05 |
| R2 | Excel on the web is a cross-origin iframe; cookies blocked as third-party | Same-origin API; any future token travels in an `Authorization` header, never a cookie | FR-OFC-05 |
| R3 | Office requires HTTPS, including in dev | Dev certs via `office-addin-dev-certs` (`office-addin-dev` skill) | FR-OFC-05 |
| R4 | Old Excel builds use the IE/Edge-legacy webview | ES2020 baseline; `type="module"` + a `nomodule` static unsupported-host message | FR-OFC-04 |
| R5 | Large PDFs rasterised page-by-page exhaust task-pane memory | Render on demand, destroy superseded documents | NFR-PERF-05/06 |
| R6 | Naive local provider allows path traversal via crafted IDs | Opaque IDs mapped server-side; canonicalise and root-check | NFR-SEC-06 |
| R7 | A folder with 100k children returned in one response | Pagination-ready signature from day one, even if unused | FR-DATA-08 |
| R8 | Narrow task pane (~320 px) makes two panes unusable | Design at the narrow width first; collapsible left pane if needed | FR-UI-09 |
