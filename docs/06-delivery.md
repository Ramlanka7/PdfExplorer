# Delivery plan and traceability

Five phases. Each ends with `/phase-gate <n>` — build, test, verify against requirement IDs,
update the tables below. Do not start the next phase before the gate passes, and do not declare a
phase done because the code compiles. **Anything that cannot be verified is reported as unverified,
never as done.**

| Phase | Scope | Requirements | Exit criterion | Owners |
| --- | --- | --- | --- | --- |
| **1 — Architecture** ✅ *complete 2026-08-25* | No application code. Structure, seams, contracts, risk register. | — | Docs ratified, D1–D6 closed in [decisions.md](decisions.md) | `architect` |
| **2 — Vertical slice** | The thinnest genuinely end-to-end path: Office.js → two panes → mock provider → tree → mock PDF. No polish, no zoom, no caching subtleties. | FR-EXP-01…10, FR-PDF-01/02/03/07/08/11, FR-DATA-01/02/03/04/06/07/08, FR-LAZY-01, FR-UI-01…08, FR-OFC-01…06, NFR-CODE-07 | The add-in loads in a **real Excel task pane** and shows a mock PDF from a mock tree (`DOD-01`–`DOD-06`, `DOD-08`, `DOD-09`). A browser-tab-only verification does not count. | `server-engineer`, `taskpane-engineer`, `pdf-engineer` |
| **3 — Lazy loading + caching** | State machine, cache, in-flight de-dup, per-node error and retry, PDF replacement and race safety. | FR-LAZY-02…07, FR-EXP-05, FR-PDF-09/10, NFR-PERF-02/03 | An instrumented run proves expanding N folders issues exactly N requests, re-expanding issues none, and the architecture checks pass (`DOD-07`, `DOD-12`, `DOD-14`). | `taskpane-engineer`, `test-engineer` |
| **4 — Real provider + full viewer** | `LocalFileSystem*` behind the same interfaces, streaming through the API. Page nav, zoom, fit modes. | FR-DATA-05, FR-PDF-04/05/06, NFR-SEC-06/07, NFR-PERF-05/06 | Switching `Explorer:Provider` from `Mock` to `LocalFileSystem` changes behaviour with **zero client-file diffs** (`DOD-15`) — prove it with the git diff. | `server-engineer`, `pdf-engineer` |
| **5 — Hardening** | Every listed failure handled, correlation-ID logging, full test matrix, perf pass, security review, host validation, narrow-width UX, accessibility. | NFR-ERR-01…06, NFR-PERF-01, NFR-SEC-01…07, FR-UI-09, FR-EXP-11 | All `DOD-01`–`DOD-15` verified with evidence below, including the manual Excel checks. | `test-engineer`, `requirements-auditor`, `security-review` skill |

---

## Traceability

Maintained by the `requirements-auditor`; regenerate with `/trace`.

- A requirement is `DONE` only with an implementation reference **and** a test reference — or, for
  manual-only items, dated evidence of a check inside Excel.
- "A test exists" is not "the requirement is verified". The auditor reads the test and confirms it
  actually asserts the behaviour.
- Never mark something verified from reading code. Run it.

| Req | Implementation | Test | Verified | Notes |
| --- | --- | --- | --- | --- |
| _(populated from Phase 2 onward)_ | | | | |

### Manual verification log

`DOD-02`, `DOD-03`, `DOD-09`, `DOD-11` and `FR-OFC-04` cannot be automated. Log every check.

| Date | Phase | Host / build | Checked | Result | By |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Known gaps

| Req | Gap | Owner | Plan |
| --- | --- | --- | --- |
| | | | |
