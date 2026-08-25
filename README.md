# PdfExplorer

An **Excel task-pane add-in** (Office.js + .NET 10 / ASP.NET Core) for browsing a folder hierarchy
and previewing PDFs without leaving Excel. Two panes: a lazy-loading folder tree on the left, a
PDF.js viewer on the right.

Status: **Phase 1 complete** (2026-08-25) — architecture ratified, decisions closed by
[decisions D1–D6](docs/decisions.md). Next: Phase 2, the minimal vertical slice.

Stack: vanilla TypeScript + Vite, same-origin ASP.NET Core (.NET 10), PDF.js, XML manifest.
Target host: **Excel on Windows** (Microsoft 365 + WebView2); Excel on the web secondary.

## Start here

- [CLAUDE.md](CLAUDE.md) — working rules and commands
- [docs/01-requirements.md](docs/01-requirements.md) — the numbered source of truth
- [docs/06-delivery.md](docs/06-delivery.md) — the five phases and the traceability matrix
- [docs/decisions.md](docs/decisions.md) — why it's built this way

## AI workspace

The repo is set up for agent-assisted development. Each piece has one job.

**Agents** (`.claude/agents/`) — delegate by concern, each with its own boundaries:

| Agent | Owns |
| --- | --- |
| `architect` | Layers, seams, project structure, the decision log, "is this abstraction justified?" |
| `server-engineer` | `src/Server` — controllers, services, providers, DI, streaming, validation |
| `taskpane-engineer` | `src/Client` — components, store, lazy-load state machine, layout, Office bootstrap |
| `pdf-engineer` | `src/Client/pdf` + viewer — PDF.js, worker, zoom/nav/fit, document lifecycle |
| `test-engineer` | Both test suites, Office.js mocks, architecture boundary checks |
| `requirements-auditor` | Read-only verification against requirement IDs and the Definition of Done |

**Skills** (`.claude/skills/`) — procedures that must not be improvised:

| Skill | Use it for |
| --- | --- |
| `/office-addin-dev` | Dev certs, manifest validation, sideloading, cache clearing, diagnosing a blank pane |
| `/phase-gate` | The end-of-phase ritual: build, test, boundary checks, functional verification, honest report |
| `/add-storage-provider` | Swapping mock → SharePoint/Blob/DMS/REST behind the provider seam |

**Commands** (`.claude/commands/`) — `/adr <decision>` to append to the decision log, `/trace [prefix]` to
audit requirement coverage.

## Why the structure looks like this

Four rules drive nearly every choice, and each has a doc behind it:

1. **Nothing loads until it's needed.** Root first, one level per expand, cached, never recursive —
   the tree must hold up at millions of files.
2. **The UI never learns where files live.** Storage sits behind `IFolderProvider`/`IPdfProvider`;
   swapping the backend must not touch a client file.
3. **The task pane is a sandboxed iframe, not a browser tab.** HTTPS, CSP, CORS, no filesystem.
   Designs that ignore that work in a browser and fail in Excel.
4. **Done means verified, not compiled.** Requirements are numbered, tests are named after them,
   and the phase gate checks behaviour.
