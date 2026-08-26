# Architecture — and why it's built this way

Every choice below traces back to one constraint: **the Excel task pane cannot touch storage
directly.** It's a sandboxed browser iframe — no filesystem access, no credentials allowed in it,
HTTPS-only, Excel's own CSP. A server sits in between, and the rest of the design is about making
that boundary earn its keep instead of just existing.

## The shape of it

```
        Excel host
            |
   +--------v---------------------------------+
   |  Task pane (browser iframe, HTTPS)        |
   |  components/  tree + viewer UI            |
   |  services/    the only layer that calls   |
   |               the API                     |
   |  office/      Office.js lives only here   |
   |  pdf/         PDF.js lives only here      |
   +-----|-------------------------------------+
         | HTTPS + JSON / application/pdf
   +-----v-------------------------------------+
   |  ASP.NET Core (.NET 10)                    |
   |  Controllers/  thin HTTP, no logic          |
   |  Providers/    IFolderProvider,             |
   |                IPdfProvider — the storage   |
   |                seam                         |
   +-----|--------------------------------------+
   A local folder today | SharePoint / Blob / a DMS tomorrow
```

The client owns the UI and what's currently expanded. The server owns storage, credentials, and
what an ID actually means. The client never sees a real file path — only an opaque ID the server
issued.

## Why a server sits in the middle

The pane can't reach a file share, SharePoint, or Blob storage on its own without either putting
credentials in the browser or fighting Excel's CORS/CSP rules. Doing it server-side solves both at
once: one place holds credentials, one place validates every ID before it touches a file.

## Why storage sits behind an interface, not built into the app

The UI only ever asks for three things: root items, a folder's immediate children, or a PDF's
bytes. It has no idea whether the answer comes from a local folder, SharePoint, or Blob storage —
that's `IFolderProvider` / `IPdfProvider`, detailed under **Provider abstractions** below. Today the
real implementation reads a Windows folder the user picks; swapping in another backend means
implementing those two interfaces and registering it — **zero UI changes**. That's the thing to
demo if someone asks "how would you add SharePoint here?"

## Why the tree loads one level at a time

Loading a whole folder tree up front doesn't scale — a real file share can have hundreds of
thousands of entries. So the client asks for root items only, then asks again for one folder's
children only when the user expands it, and caches what it already loaded. No recursive walk,
anywhere, ever.

## Why Office.js and PDF.js are each walled into their own folder

`office/` is the only place that imports `Office.*`; `pdf/` is the only place that imports
`pdfjs-dist`. Two reasons: the task-pane host has real quirks (see [04-office.md](04-office.md))
that shouldn't leak into ordinary UI code, and either library can now be swapped or mocked in tests
without touching anything else — which is why the test suite runs without Excel or a real PDF file.

---

## API contract

Base path `/api`. Three endpoints, one response shape:

| Endpoint | Returns |
| --- | --- |
| `GET /api/folders/root` | Root items only — never recursive |
| `GET /api/folders/{folderId}/children` | That folder's immediate children only |
| `GET /api/pdfs/{pdfId}/content` | The PDF bytes |

```json
{
  "items": [
    { "id": "p_contract_a", "name": "Contract A.pdf", "type": "pdf", "hasChildren": false, "parentId": "f_contracts" }
  ],
  "nextCursor": null
}
```

`id` is opaque — issued by the provider, meaningless to the client, never a real path. `name` is
untrusted display text, rendered with `textContent`, never `innerHTML`. Non-PDF files are filtered
out before the client ever sees them.

### Error envelope

Every failure — folder not found, PDF not found, an invalid folder source, storage unavailable —
comes back in the same shape, so the client has one place that handles errors instead of guessing
from a string:

```json
{ "error": { "code": "FOLDER_NOT_FOUND", "message": "That folder is no longer available.", "correlationId": "0HN7…" } }
```

The message is safe to show as-is; anything sensitive (a path, a stack trace) stays server-side
behind the `correlationId`. A closed set of typed exceptions maps to a closed set of codes — nothing
storage-specific ever reaches this layer:

| Code | Meaning | Retry? |
| --- | --- | --- |
| `SOURCE_INVALID` | The picked folder doesn't exist or isn't readable | No — pick another |
| `FOLDER_NOT_FOUND` / `PDF_NOT_FOUND` | Item is gone or the ID is unknown | No |
| `FORBIDDEN` | Not permitted — auth isn't built in v1, but this is where it plugs in | No |
| `UPSTREAM_UNAVAILABLE` | Storage is temporarily down | Yes |
| `INTERNAL` | Anything unexpected | Yes |

---

## Provider abstractions

The interfaces the rest of the app is built around:

```csharp
public interface IFolderProvider
{
    Task<FolderPage> GetRootItemsAsync(ItemQuery query, CancellationToken ct);
    Task<FolderPage> GetChildrenAsync(ExplorerItemId folderId, ItemQuery query, CancellationToken ct);
}

public interface IPdfProvider
{
    Task<PdfContent> OpenPdfAsync(ExplorerItemId pdfId, CancellationToken ct);
}
```

Two interfaces, not one and not three — folders and documents are the only two things the UI asks
for. `SelectableStorageProvider` implements both against a real Windows folder today: it turns
every ID back into a path, canonicalises it, and rejects anything that resolves outside the
configured root before touching disk. A mock implementation exists purely for tests, so the suite
never touches a real file.

Providers throw four exception types and never leak a storage-specific one past their own boundary:
`ItemNotFoundException`, `ItemAccessDeniedException`, `ProviderUnavailableException`,
`InvalidPdfException` (plus `InvalidSourceException` for an unusable picked folder). The service
layer maps these to the error envelope above.

**Adding a different backend** (SharePoint, Blob, a DMS): implement both interfaces, map its
failures to those exception types, register it. If that touches a single client file, the seam has
a hole — fix the seam, not the workaround. The `add-storage-provider` skill walks this end to end.

---

## Coding principles this design follows

Not a checklist added after the fact — each letter of SOLID maps to something already built here:

| Principle | Where it actually shows up |
| --- | --- |
| **S** — Single Responsibility | `FoldersController`/`PdfsController` do thin HTTP only, nothing else; `FolderTree` only renders a tree, `PdfViewer` only renders a document — neither knows the other's job. |
| **O** — Open/Closed | Adding a storage backend means writing a new class against `IFolderProvider`/`IPdfProvider` and registering it — no existing provider, controller, or client file changes. That's `FR-DATA-05` in practice, not just on paper. |
| **L** — Liskov Substitution | `SelectableStorageProvider` and the mock providers are drop-in replacements for each other behind the same two interfaces — callers can't tell which one they got, and nothing behaves differently in a way that would surprise them. |
| **I** — Interface Segregation | Two narrow interfaces, not one broad "storage" interface: `IFolderProvider` for tree structure, `IPdfProvider` for bytes. Nothing that only needs one is forced to depend on both. |
| **D** — Dependency Inversion | Controllers and the client depend on the two interfaces, never on a concrete provider; `Program.cs` is the one place a concrete implementation gets wired in. The client mirrors this: `PdfViewer` depends on `IPdfDocumentService`, never on `pdfjs-dist` directly. |

Two more that show up as much by what's **absent**: no duplicated logic between client and server
or across components (DRY), and no generic `IStorageService`, repository layer, or plugin system
that nothing here actually needs yet (YAGNI) — the two provider interfaces are the one abstraction
this size of app justifies, not a starting point for more of them.

---

## Risks this design accounts for

| Risk | How it's handled |
| --- | --- |
| Excel's CSP blocks the PDF.js worker | Served as a same-origin asset, never from a CDN |
| Excel on the web treats the pane as third-party — cookies unreliable | Same-origin API; any future auth token goes in a header, not a cookie |
| Excel requires HTTPS, even in dev | Dev certs via `office-addin-dev-certs` |
| Old Excel builds use a legacy IE-based webview | Modern JS baseline + a static fallback message for unsupported hosts |
| Large PDFs could exhaust task-pane memory | Pages render on demand; the previous document is destroyed on selection |
| Crafted IDs could walk outside the folder root | IDs are opaque tokens; every resolved path is canonicalised and root-checked |
| A folder could return huge numbers of children in one response | API is pagination-ready even though v1 doesn't need it yet |
| The task pane can be very narrow | Designed to stay usable down to ~320px |

---

## Where the deeper reasoning lives

This page is the short version of "why." For the full trade-off writeups — what was given up, what
was ruled out, and why — see [decisions.md](decisions.md). For the complete, numbered requirement
list these choices satisfy, see [01-requirements.md](01-requirements.md).
