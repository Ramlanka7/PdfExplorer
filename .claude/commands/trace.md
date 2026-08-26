---
description: Audit implementation against requirement IDs and refresh the traceability matrix
argument-hint: [requirement prefix, e.g. FR-LAZY or DOD — omit for everything]
---

Audit **$ARGUMENTS** (all requirements if no prefix given) against the implementation, following
`.claude/agents/requirements-auditor.md`.

For each requirement in scope:

1. Locate the implementation and cite `file:line`. No reference means `NOT IMPLEMENTED` — whatever
   any previous summary claimed.
2. Locate the test, cite it, and **read it**. A test named for a requirement that doesn't assert
   that requirement's behaviour is `NOT VERIFIED`; say why.
3. Verify functionally where possible — run the suite, run the app, count requests. Do not infer
   satisfaction from code reading.
4. Classify: `VERIFIED` · `IMPLEMENTED, UNTESTED` · `PARTIAL` · `NOT IMPLEMENTED` ·
   `MANUAL CHECK REQUIRED`.

Pay particular attention to the claims that usually outrun reality: `DOD-12` (no recursive load),
`FR-LAZY-03` (cache prevents refetch), `NFR-PERF-04` (nothing preloaded), `DOD-14`/`DOD-15` (no
storage coupling in `src/Client/`), `NFR-SEC-02`/`NFR-SEC-03` (untrusted names and URLs),
`NFR-ERR-06` (no technical detail in user-facing errors).

Then update the traceability tables in `docs/06-delivery.md` and report: what is verified with evidence, what is not and the
smallest step to close each gap, and any place the code and the docs contradict each other. Be
direct about gaps — a green report that isn't true costs more than the audit saves.
