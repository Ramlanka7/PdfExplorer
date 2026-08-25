# Testing strategy

Every test is named after the requirement it proves. A requirement without a test is not `DONE`.
Naming: `Method_scenario_expected_REQ_ID` in C#; `it('… (FR-EXP-04)')` in TypeScript.

| Layer | Tool | Location |
| --- | --- | --- |
| Server unit + provider | xUnit | `tests/Server.Tests` |
| Server API | `WebApplicationFactory` in-memory host | `tests/Server.Tests` |
| Client unit (store, services) | Vitest | `tests/Client.Tests` |
| Client component (DOM) | Vitest + jsdom + Testing Library | `tests/Client.Tests` |
| Office.js | hand-written stub, no Excel (`NFR-CODE-07`) | `tests/Client.Tests/mocks` |
| Excel host behaviour | **manual** — see [04-office.md](04-office.md#verification-matrix) | — |

## Required tests

### Folder behaviour
| Req | Test |
| --- | --- |
| FR-LAZY-01 | Root items load and render on startup |
| FR-LAZY-02 | Children are requested only on first expand — a service spy asserts zero calls before |
| FR-EXP-05 | After children load, no descendant is in `expandedFolders` |
| FR-EXP-03 | Expand shows children; collapse hides them and keeps the cache |
| FR-LAZY-03 | Collapse → re-expand issues no second request (call count stays 1) |
| FR-LAZY-06 | A rejected children request sets `Failed` + message, and retry recovers |
| FR-LAZY-04 | Two rapid expands of one folder produce one request |
| FR-EXP-09 | Clicking a folder never calls the PDF service |
| DOD-12 | Loading root + expanding one folder requests exactly two endpoints, never a recursive one |

### PDF behaviour
| Req | Test |
| --- | --- |
| FR-PDF-01/02 | Selecting a PDF loads it and renders into the viewer |
| FR-PDF-09 | Selecting a second PDF replaces the first and destroys the previous document |
| FR-PDF-08 | `pdfLoading` is true during the fetch and false after |
| FR-PDF-11 | Fetch rejection and non-PDF bytes both produce a safe message, no crash |
| FR-PDF-10 | A slow first load resolving after a second selection does not overwrite it |
| NFR-ERR-06 | No rendered error text contains a stack trace, path, or provider name |

### Provider / API
| Req | Test |
| --- | --- |
| FR-DATA-04 | `MockFolderProvider` returns roots and children directly, no HTTP |
| FR-DATA-03 | `MockPdfProvider` returns a stream for a known ID, throws `ItemNotFoundException` otherwise |
| FR-DATA-02 | Controllers return the documented shape and status codes |
| NFR-SEC-06 | Traversal-shaped IDs (`../`, absolute, encoded) are rejected as not-found |
| FR-DATA-08 | A provider returning `NextCursor` flows through the API unchanged |

### Architecture
| Req | Test |
| --- | --- |
| DOD-14 | Static check: no file under `components/` imports from `services/http`, `pdf/`, or `office/`; no client file names a storage technology |
| FR-OFC-03 | Static check: `Office.` appears only under `office/` |

These two are cheap scripted assertions over the source tree, and the only automated guard on the
boundaries that matter most — so they run in every phase gate.

## Rules

- Test behaviour through the store and the DOM, not implementation details of internal helpers.
- Fake at the seams — `FolderService`, `IPdfDocumentService`, `IFolderProvider` — never by patching
  globals like `window.fetch` in a component test. If that seems necessary, the component is
  reaching past its layer, and *that* is the finding.
- Assert on **request counts**, not just rendered output. The lazy-loading requirements are mostly
  claims about what was *not* requested.
- No test may require a real Excel instance, network access, or files outside the repo
  (`NFR-CODE-07`).
- A bug fix lands with the test that would have caught it.
