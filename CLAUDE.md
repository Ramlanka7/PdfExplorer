# PdfExplorer — Excel Office.js PDF Explorer Add-in

An Excel **task-pane add-in** (Office.js + .NET 10 / ASP.NET Core) that lets users browse a
folder hierarchy and preview PDFs without leaving Excel. Two panes: folder tree (left),
PDF viewer (right).

## Read this first

| Question | Doc |
| --- | --- |
| What are we building, and what's required? | [docs/01-requirements.md](docs/01-requirements.md) |
| How is it structured — layers, API, providers? | [docs/02-architecture.md](docs/02-architecture.md) |
| How is the client built, and how do we render PDFs? | [docs/03-client.md](docs/03-client.md) |
| What will Office.js break? | [docs/04-office.md](docs/04-office.md) |
| What do we test? | [docs/05-testing.md](docs/05-testing.md) |
| What order do we build in, and is requirement X covered? | [docs/06-delivery.md](docs/06-delivery.md) |
| Why is it this way? | [docs/decisions.md](docs/decisions.md) |

Requirements are **numbered and stable** (`FR-EXP-03`, `NFR-SEC-02`, `DOD-07`...). Cite the ID in
commit messages, test names, and PR descriptions. If a requirement changes, edit
`docs/01-requirements.md` in the same commit and re-run `/trace`.

## Settled decisions

Phase 1 is closed: vanilla TypeScript + Vite · same-origin hosting, no CORS policy · PDF bytes
streamed through the API · ES2020 baseline, **Excel on Windows is the target** (web secondary, Mac
out of scope) · XML manifest. Rationale and accepted costs are in
[docs/decisions.md](docs/decisions.md). Changing one means **adding a superseding entry** (`/adr`),
not editing the old one.

## Non-negotiable rules

1. **No VSTO. No desktop app.** It is an Office Add-in running in a task-pane iframe.
2. **Never recursively load the folder tree.** Root first; children only on expand. See `FR-LAZY-*`.
3. **Never preload PDF bytes.** A PDF is fetched only after the user selects it.
4. **The UI must not know where files come from.** It talks to a client service; the server talks
   to `IFolderProvider` / `IPdfProvider`. Swapping mock → SharePoint/Blob/DMS must not touch a
   component, and no folder data is ever hard-coded in one.
5. **Office.js stays isolated** in `src/Client/office/`. Application and folder/PDF logic must not
   import `Office.*`.
6. **PDF.js stays isolated** behind `IPdfDocumentService`. Components never touch `pdfjs-dist` directly.
7. **All names/URLs/API responses are untrusted.** `textContent`, never `innerHTML`. No string-built URLs.
8. **Strong typing everywhere.** No `any` in TypeScript without a comment justifying it; no `dynamic` in C#.
9. **Don't over-engineer.** An interface needs a real, current architectural boundary to exist.
   A newcomer must be able to follow the first implementation.
10. **Never assume a local filesystem path is loadable** by JS in the task pane. Bytes come from the API.
11. **Never weaken browser or Office security to make something work.** No disabled CSP, no wildcard
    CORS, no browser security flags off, no unvalidated redirects. If it only works that way, the
    design is wrong (`NFR-SEC-04`).
12. **No secrets client-side.** If a feature seems to need one, it belongs on the server (`NFR-SEC-05`).
13. **Dependency injection on the server.** No service location, no `new SomeProvider()` in a controller.
14. **Errors are typed and mapped**, never string-matched. One error envelope, one mapping layer.
15. **No duplicated logic** between client and server, or across components (`NFR-CODE-05`). Two
    caches means two truths.

If a rule is wrong, say so with the case that broke it and change it here. A rule silently ignored
in one file becomes an inconsistency nobody can explain in six months.

## Workflow

Work in phases ([docs/06-delivery.md](docs/06-delivery.md)). **After every phase**, run the phase
gate — build, test, verify against requirement IDs, not just "it compiles":

```
/phase-gate <phase-number>
```

Use `/trace` to see which requirements have code and tests behind them, and `/adr <decision>` to
record an architectural decision.

## Commands

```bash
dotnet build PdfExplorer.sln                 # server + solution build
dotnet test                                  # server tests (xUnit)
dotnet run --project src/Server              # API (dev)
npm --prefix src/Client run dev              # Vite: HTTPS, proxies /api to Kestrel
npm --prefix src/Client run build            # client bundle -> src/Server/wwwroot
npm --prefix src/Client test                 # client tests (Vitest)
npm --prefix src/Client run lint             # eslint + tsc --noEmit
```

Sideloading into Excel, dev certs, and manifest validation are covered by the `office-addin-dev` skill.

## Layout

```
src/Server/          ASP.NET Core: Controllers, Services, Providers, Models, DI
src/Client/          TypeScript task pane: components, services, state, office, pdf, styles
tests/Server.Tests/  xUnit
tests/Client.Tests/  Vitest + jsdom (Office.js and fetch mocked)
manifest/            Office Add-in manifest(s)
docs/                Requirements, architecture, decisions
.claude/             Agents, skills, commands
```
