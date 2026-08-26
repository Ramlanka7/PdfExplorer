# Testing strategy

Every test is named after the requirement it proves — `Method_scenario_expected_REQ_ID` in C#,
`it('… (FR-EXP-04)')` in TypeScript — so a requirement without a test is visibly not done, and a
failing test says which promise broke.

| Layer | Tool | Location |
| --- | --- | --- |
| Server unit + provider | xUnit | `tests/Server.Tests` |
| Server API | `WebApplicationFactory` in-memory host | `tests/Server.Tests` |
| Client unit (store, services) | Vitest | `tests/Client.Tests` |
| Client component (DOM) | Vitest + jsdom + Testing Library | `tests/Client.Tests` |
| Office.js | hand-written stub, no Excel | `tests/Client.Tests/mocks` |
| Excel host behaviour | **manual** — see [04-office.md](04-office.md#why-it-works-in-a-browser-isnt-proof) | — |

## What the suite actually has to prove

The product's real behaviour is four claims about what *doesn't* happen, which is why most of
these are asserted on request/call counts, not just rendered output:

| Claim | Proven by |
| --- | --- |
| Nothing loads until expanded; expanding loads one level | Root renders on startup; a service spy shows zero child calls before expand, one after (`FR-LAZY-01/02`) |
| Nothing ever auto-expands | After children load, no descendant is in `expandedFolders` (`FR-EXP-05`) |
| A loaded folder is never re-requested | Collapse → re-expand keeps the call count at 1; two rapid expands still produce one request (`FR-LAZY-03/04`) |
| A stale response never wins | A slow first PDF/folder load resolving after a newer selection is discarded, not rendered (`FR-PDF-10`) |

Plus the everyday cases: a failed folder/PDF load shows a message and recovers on retry
(`FR-LAZY-06`, `FR-PDF-11`); clicking a folder never calls the PDF service (`FR-EXP-09`); selecting
a second PDF destroys the first (`FR-PDF-09`); no rendered error text ever contains a stack trace,
path, or provider name (`NFR-ERR-06`); traversal-shaped IDs (`../`, absolute, encoded) are rejected
as not-found (`NFR-SEC-06`); mock providers answer without HTTP or disk (`FR-DATA-03/04`).

## Architecture checks

Two cheap, scripted checks over the source tree run in every phase gate — the only automated guard
on the boundaries the whole design rests on:

| Check | Guards |
| --- | --- |
| No file under `components/` imports `services/http`, `pdf/`, or `office/`; no storage-technology name appears in the client | `DOD-14` |
| `Office.` appears only under `office/` | `FR-OFC-03` |

## Rules

- Test behaviour through the store and the DOM, not internal helpers.
- Fake at the seams — `FolderService`, `IPdfDocumentService`, `IFolderProvider` — never by patching
  `window.fetch` in a component test. If that seems necessary, the component is reaching past its
  layer, and *that* is the finding.
- No test may require a real Excel instance, network access, or files outside the repo.
- A bug fix lands with the test that would have caught it.
