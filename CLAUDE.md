# PdfExplorer — Excel Office.js PDF Explorer Add-in

A one-day prototype: an Excel **task-pane add-in** (Office.js + .NET 10 / ASP.NET Core) that lets
users browse a folder hierarchy and preview PDFs without leaving Excel. Two panes: folder tree
(left), PDF viewer (right).

## Docs

| Question | Doc |
| --- | --- |
| What are we building, and what's required? | [docs/01-requirements.md](docs/01-requirements.md) |
| How is it structured — layers, API, providers? | [docs/02-architecture.md](docs/02-architecture.md) |
| How is the client built, and how do we render PDFs? | [docs/03-client.md](docs/03-client.md) |
| What will Office.js break? | [docs/04-office.md](docs/04-office.md) |
| What do we test? | [docs/05-testing.md](docs/05-testing.md) |
| Where things stand | [docs/06-delivery.md](docs/06-delivery.md) |
| Why is it this way? | [docs/decisions.md](docs/decisions.md) |

Requirements have IDs (`FR-EXP-03`, `NFR-SEC-02`...) and tests/comments reference them — that's
just so a requirement and the code proving it stay findable, not a governance process. Edit
`docs/01-requirements.md` directly when a requirement changes.

## Settled choices

Vanilla TypeScript + Vite · same-origin hosting, no CORS policy · PDF bytes streamed through the
API · ES2020 baseline, **Excel on Windows is the target** (web secondary, Mac out of scope) · XML
manifest. Rationale is in [docs/decisions.md](docs/decisions.md) — read it before re-litigating one
of these; edit it directly if the reasoning changes.

## Rules that actually prevent bugs

1. **No VSTO. No desktop app.** It is an Office Add-in running in a task-pane iframe.
2. **Never recursively load the folder tree.** Root first; children only on expand.
3. **Never preload PDF bytes.** A PDF is fetched only after the user selects it.
4. **The UI must not know where files come from.** It talks to a client service; the server talks
   to `IFolderProvider` / `IPdfProvider`. No folder data is ever hard-coded in a component.
5. **Office.js stays isolated** in `src/Client/office/`. Application and folder/PDF logic must not
   import `Office.*`.
6. **PDF.js stays isolated** behind `IPdfDocumentService`. Components never touch `pdfjs-dist` directly.
7. **All names/URLs/API responses are untrusted.** `textContent`, never `innerHTML`. No string-built URLs.
8. **Strong typing everywhere.** No `any` in TypeScript without a comment justifying it; no `dynamic` in C#.
9. **Don't over-engineer.** An interface needs a real, current architectural boundary to exist —
   this is a prototype, not a platform. A newcomer must be able to follow the first implementation.
10. **Never assume a local filesystem path is loadable** by JS in the task pane. Bytes come from the API.
11. **Never weaken browser or Office security to make something work.** No disabled CSP, no wildcard
    CORS, no browser security flags off, no unvalidated redirects. If it only works that way, the
    design is wrong.
12. **No secrets client-side.** If a feature seems to need one, it belongs on the server.
13. **Dependency injection on the server.** No service location, no `new SomeProvider()` in a controller.
14. **Errors are typed and mapped**, never string-matched. One error envelope, one mapping layer.
15. **No duplicated logic** between client and server, or across components. Two caches means two truths.
16. **Follow SOLID, DRY, and YAGNI.** Not new work — rules 4, 6, and 13 already are dependency
    inversion, and the two-interface provider seam already is interface segregation. See
    [docs/02-architecture.md](docs/02-architecture.md#coding-principles-this-design-follows) for
    where each principle actually shows up in this codebase, not just a claim that it's followed.

If a rule is wrong, say so and change it here.

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

Sideloading into Excel, dev certs, and manifest validation are covered by the `office-addin-dev`
skill. `/phase-gate`, `/trace`, and `/adr` are there when you want a build+test+verify pass, a
requirements audit, or to jot down why a choice was made — use them when they're useful, not as a
required ritual.

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
