---
name: add-storage-provider
description: Add or replace a folder/PDF storage backend for PdfExplorer — local or network storage, SharePoint, OneDrive, Azure Blob, a document management system, or a REST API — behind IFolderProvider and IPdfProvider without touching the client. Use when swapping the mock provider for a real source, adding a second backend, or checking whether a proposed backend fits the existing seam.
---

# Adding a storage provider

This is the seam the product's extensibility claim rests on (`FR-DATA-05`, `DOD-15`). The success
criterion is blunt: **`git diff --stat src/Client/` is empty when you are done.**

Contracts: [docs/02-architecture.md](../../../docs/02-architecture.md#provider-abstractions).
Do not change the interfaces to suit one backend.

## 1. Implement both interfaces

Under `src/Server/Providers/<Backend>/`:

```csharp
internal sealed class SharePointFolderProvider : IFolderProvider
{
    public Task<FolderPage> GetRootItemsAsync(ItemQuery query, CancellationToken ct);
    public Task<FolderPage> GetChildrenAsync(ExplorerItemId folderId, ItemQuery query, CancellationToken ct);
}

internal sealed class SharePointPdfProvider : IPdfProvider
{
    public Task<PdfContent> OpenPdfAsync(ExplorerItemId pdfId, CancellationToken ct);
}
```

Rules while you do:

- **Immediate children only.** No recursion, no "just prefetch one more level" (`DOD-12`, rule 11).
- **`async` throughout, `CancellationToken` honoured** to the outermost call (`NFR-CODE-03`).
- **Stream the PDF.** Never buffer a whole document into memory (`NFR-PERF-05`).
- **Filter to folders and PDFs.** Other file types never reach the client.
- **Set `HasChildren` cheaply.** If the backend cannot answer without a full listing, return `true`
  optimistically and let the expansion come back empty — and write down that choice.
- **Respect `ItemQuery.Cursor`/`Limit`** if the backend paginates, and return `NextCursor`
  (`FR-DATA-08`). If it doesn't, ignore them — but never invent an unbounded listing of a huge folder.

## 2. Get IDs right — this is the security-critical part

Provider IDs are **opaque tokens** (`FR-DATA-07`). Never hand a raw filesystem path, UNC path, drive
item path, or blob key to the client.

- The provider issues IDs and is the only thing that interprets them. URL-safe, stable in a session.
- **Validate every inbound ID** before it reaches the backend. For a filesystem-backed provider:
  resolve to a full path, canonicalise it, and verify it is inside the configured root before any
  file access. Reject `..`, absolute paths, encoded variants, and symlink escapes (`NFR-SEC-06`).
- A rejected ID is `ItemNotFoundException` — the error must not explain why it was rejected.

## 3. Map failures to the domain exceptions

`ItemNotFoundException` · `ItemAccessDeniedException` · `ProviderUnavailableException` ·
`InvalidPdfException`. Backend-specific exception types must not escape the provider — the service
layer maps these to the error envelope (`docs/02-architecture.md#error-envelope`), and nothing
about your backend should be visible in a user-facing message (`NFR-ERR-06`).

## 4. Register by configuration

```csharp
// src/Server/Infrastructure/ProviderRegistration.cs — one switch, nothing clever
services.AddExplorerProvider(configuration);
```

```jsonc
{ "Explorer": { "Provider": "SharePoint", "SharePoint": { "SiteUrl": "…" } } }
```

Credentials come from configuration/secret storage on the **server** (`NFR-SEC-05`) — nothing
reaches the browser. A backend that needs a user token is an auth design change: take it to
`architect`, don't improvise a client-side token.

## 5. Test it (`FR-DATA-04`, `FR-DATA-03`)

In `tests/Server.Tests`, without HTTP:

- roots return expected items;
- children return **one level** only;
- an unknown ID throws `ItemNotFoundException`;
- traversal-shaped IDs are rejected (`NFR-SEC-06`);
- a PDF ID returns a readable stream;
- backend failure maps to `ProviderUnavailableException`;
- if paginated, `NextCursor` round-trips.

Fake the backend SDK at its own boundary — no network in tests.

## 6. Prove the seam held

```bash
git diff --stat src/Client/     # must be empty
dotnet test
```

Then switch the configured provider and confirm the client behaves identically.

**If you needed a client change, stop.** The seam is in the wrong place. Do not patch the client to
accommodate a backend — escalate to `architect` and fix the abstraction. That change *is* the
requirement (`DOD-14`, `DOD-15`).
