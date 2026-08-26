---
name: phase-gate
description: Run a build+test+verify pass for PdfExplorer — build server and client, run both test suites, run the architecture boundary checks, verify requirements functionally, update traceability, then report honestly. Use before claiming any chunk of work or the project done.
---

# Phase gate

Argument: an optional scope (a requirement prefix, a feature area, or nothing for everything).
Requirement IDs come from `docs/01-requirements.md`; status is recorded in `docs/06-delivery.md`.

**The rule this exists to enforce:** an implementation is not complete because it compiles. Every
step below is evidence-producing. If you cannot produce the evidence, the item is unverified — say
so.

## 1. Build

```bash
dotnet build PdfExplorer.sln
npm --prefix src/Client run lint
npm --prefix src/Client run build
```

Any warning that indicates a real problem (nullability, unused seam, TS error suppressed) is a
finding, not noise.

## 2. Test

```bash
dotnet test
npm --prefix src/Client test
```

Paste real output. A red suite ends the gate — fix, then restart the gate. Never summarise failures
as "mostly passing".

## 3. Architecture checks

These guard the seams that the whole design rests on (`DOD-14`, `FR-OFC-03`, rule 5):

```bash
# Office.js only in office/
grep -rn "Office\." src/Client --include=*.ts | grep -v "^src/Client/office/"
# pdfjs only in pdf/
grep -rn "pdfjs-dist" src/Client --include=*.ts | grep -v "^src/Client/pdf/"
# components must not reach past their layer
grep -rn "fetch(\|/api/" src/Client/components
# no storage technology leaking into the client
grep -rniE "sharepoint|onedrive|azure|blob|\\\\\\\\|file://|[A-Za-z]:\\\\" src/Client
# no recursive tree walk on the server
grep -rn "GetChildrenAsync" src/Server | grep -iE "foreach|recurs|while"
# PDF.js worker must be same-origin, never a CDN (risk R1 — fails only inside Excel)
grep -rn "workerSrc" src/Client | grep -iE "cdn|unpkg|jsdelivr|https?://"
```

Every one of these should return nothing. A hit is a violation to fix or an explicit, documented
exception — not something to note and move past.

## 4. Verify requirements functionally

For each requirement in scope, **exercise the behaviour**. Reading the code does not count. In
particular:

- Load root, then expand one folder: confirm the network log shows exactly two requests, one level
  each (`FR-LAZY-01`, `FR-LAZY-02`, `DOD-12`).
- Collapse and re-expand: confirm **zero** new requests (`FR-LAZY-03`).
- Confirm no descendant expanded itself (`FR-EXP-05`).
- Confirm no PDF request was issued before a PDF was clicked (`NFR-PERF-04`).
- Select a second PDF: confirm the first is replaced and its document destroyed (`FR-PDF-09`).
- Force a failure (stop the server, request a bad ID): confirm a useful message, a working retry,
  and that the rest of the UI still works (`NFR-ERR-02`, `NFR-ERR-04`).
- Shrink the pane to its minimum width: confirm it stays usable (`FR-UI-09`).

A gate covering `DOD-02`, `DOD-03`, `DOD-09`, `DOD-11`, `FR-OFC-04` additionally requires a run in
**Excel on Windows** (`office-addin-dev` skill) — that's the target host per
[decisions.md](../../../docs/decisions.md), and a gate not run there has not been run. Log the
check in `docs/06-delivery.md#manual-verification-log` with the Office build and webview.

## 5. Update the record

- Fill in the traceability table in `docs/06-delivery.md` (`TODO` → `DONE` only with evidence):
  requirement → file:line → test → verification. Status lives there, not in `01-requirements.md`.
- Log manual Excel checks with date, host and build.
- Add any new risk to `docs/02-architecture.md`.

## 6. Report

State plainly:

- **Verified**, with evidence.
- **Unverified or deferred**, with what is missing and why.
- **New risks or contradictions** found.
- **Ready / not ready** to call this done — and if not ready, the shortest path to ready.

Do not soften a gap into a summary. The point of the gate is to find the thing that would otherwise
be discovered inside Excel, later, in front of someone else.
