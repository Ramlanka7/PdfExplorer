# PdfExplorer

An **Excel task-pane add-in** (Office.js + .NET 10 / ASP.NET Core) for browsing a folder hierarchy
and previewing PDFs without leaving Excel. Two panes: a lazy-loading folder tree on the left, a
PDF.js viewer on the right.

Status: **Phase 1 complete** (2026-08-25). This repository state is **architecture and planning
only**: requirements, constraints, seams, and delivery gates are documented, but the end-to-end
add-in is **not committed yet**. Phase 2 is the first real vertical slice.

Planned stack: vanilla TypeScript + Vite, same-origin ASP.NET Core (.NET 10), PDF.js, XML
manifest. Target host: **Excel on Windows** (Microsoft 365 + WebView2); Excel on the web is
secondary.

## If You're Reviewing This Repo

- Start with [docs/reviewer-guide.md](docs/reviewer-guide.md) for the short version.
- Treat this as a **POC architecture repo**, not a finished add-in or even a runnable slice yet.
- The next milestone that matters is Phase 2: a real Excel task pane, mock folder tree, mock PDF,
  and same-origin API working together.

## What This POC Must Prove

1. **Excel can host the experience we actually want.** The hard part is not a browser tab; it is a
   task pane running inside Excel with HTTPS, CSP, and webview constraints.
2. **The tree stays lazy.** Root first, one level per expand, no recursive loading, no speculative
   prefetch.
3. **PDF preview works inside the pane.** PDF bytes stream through the API and render with PDF.js,
   not by handing the client a local path.
4. **Storage stays behind a server seam.** The client must not care whether the source is mock,
   local disk, SharePoint, Blob, or a DMS.

## Current State

- **Done now:** requirements, architecture, client design, Office constraints, testing strategy,
  delivery plan, and decision log.
- **Not in the repo yet:** `src/Server`, `src/Client`, `tests`, `manifest`, screenshots, or a
  sideloadable add-in.
- **Next proof point:** Phase 2 delivers the thinnest end-to-end slice with mock data in a real
  Excel task pane.

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
the task pane. To unregister: `npx office-addin-debugging stop ../../manifest/manifest.dev.xml`
(same directory).

If the pane shows an "ADD-IN ERROR / network connectivity" dialog, its own Retry button is
unreliable — close the task pane and click **PDF Explorer** again instead. Full prerequisites
(dev certs, WebView2, manifest validation, cache clearing) are in the `office-addin-dev` skill.

## Read In This Order

- [docs/reviewer-guide.md](docs/reviewer-guide.md) — one-page reviewer summary
- [docs/01-requirements.md](docs/01-requirements.md) — numbered source of truth
- [docs/02-architecture.md](docs/02-architecture.md) — layers, API, provider seam
- [docs/04-office.md](docs/04-office.md) — Excel task-pane constraints that kill naive designs
- [docs/06-delivery.md](docs/06-delivery.md) — phases, proof points, traceability
- [docs/decisions.md](docs/decisions.md) — why the current choices were made

Contributor-specific workflow, commands, and agent rules live in [CLAUDE.md](CLAUDE.md).

## Why The Design Is This Strict

Four constraints drive nearly every decision:

1. **The task pane is not a normal browser tab.** HTTPS, CSP, iframe hosting, and webview variance
   are first-order constraints.
2. **The client cannot load enterprise storage directly.** No filesystem access, no trusted local
   paths, and no client-side credentials.
3. **The tree cannot scale if it loads recursively.** Large hierarchies force one-level, on-demand
   loading and caching.
4. **A POC still has to prove the right thing.** "Works in a browser" is not success if it fails in
   Excel.

## Contributor Notes

The repository is set up for agent-assisted development, but those mechanics are intentionally kept
out of the reviewer path. If you are implementing Phase 2 or later, start with [CLAUDE.md](CLAUDE.md)
for rules, commands, and the contributor workflow.
