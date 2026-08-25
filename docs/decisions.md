# Decisions

Numbered, dated, and immutable in intent: to change one, **add a new entry that supersedes it** —
don't rewrite history. Record a decision when a choice constrains future work, when two reasonable
options exist and someone will later ask "why this one?", or when you bend a rule in `CLAUDE.md`.
Not for naming, file layout, or anything trivially reversible. Add one with `/adr <decision>`.

All Phase 1 decisions are closed.

---

### D1 — Vanilla TypeScript client, hand-rolled store · *Accepted 2026-08-25*

The client is two components with one interaction, and `FR-UI-04` enumerates the entire state in
seven fields. A framework runtime is bundle weight on a corporate network and CSP/supply-chain
surface inside a sandboxed pane, for a problem we don't have.

**Cost accepted:** we own ID-keyed DOM reconciliation, and the discipline that keeps it from
degenerating rests on the component boundaries in [03-client.md](03-client.md) plus lint rules.
Official Office samples assume webpack, so their build config must be translated, not copied.
**Rules out:** Redux/MobX/signals or any UI framework without a superseding decision (`FR-UI-05`).
Virtualising the visible node list is its own decision, made from a profile — not a guess.

### D2 — Vite as the build tool · *Accepted 2026-08-25*

Two environment facts decided this, not taste: the bundler must emit the PDF.js worker as a
**same-origin** asset (risk R1) via `new URL(..., import.meta.url)`, and must serve HTTPS in dev
(`FR-OFC-05`). Target `es2020`. **Follow-up:** configure `rollupOptions.input` for multiple entries
now, so a future commands page doesn't force a build rework.

### D3 — Same origin everywhere; no CORS policy registered · *Accepted 2026-08-25*

ASP.NET serves the built bundle from `wwwroot`; Vite proxies `/api` to Kestrel in dev. The pane's
document and the API therefore share an origin and every call is same-origin. Excel on the web
renders the pane as a third-party context where our cookies are third-party and unreliable
(risk R2), and a permissive dev CORS policy is the classic way that leaks into production —
so CORS is **designed out** rather than carefully configured.

**Cost accepted:** the bundle can't be served from a CDN; client and server deploy together.
**Rules out:** any wildcard CORS, ever. A split-origin deployment needs a superseding decision with
an exact-origin allowlist (`NFR-SEC-04`).

### D4 — Stream PDF bytes through the API · *Accepted 2026-08-25*

`GET /api/pdfs/{id}/content`. A design that depends on the backend minting a URL cannot support the
two providers we build first: mock bytes are embedded, and a local filesystem has no URL at all.
One delivery path for every provider is what makes `FR-DATA-05` and `DOD-15` true rather than
aspirational, and it keeps the server the only holder of credentials and the only validator of IDs.

**Cost accepted:** every previewed byte crosses the app server — the latency path for large
documents on a slow link, mitigated by range requests and on-demand page rendering.
**Open upgrade:** signed-URL redirect for providers that can mint one. `PdfSource` is a URL either
way and PDF.js follows redirects, so it is a provider capability plus a `302` with **zero client
change**. Don't build it before a measurement asks for it.

### D5 — ES2020 baseline; **Excel on Windows is the target** · *Accepted 2026-08-25, supersedes D5-original*

The original entry ordered verification Mac → web → Windows, reasoning from the machine this repo
was created on rather than where the add-in will be used. That was wrong.

| Host | Engine | Status |
| --- | --- | --- |
| Excel on Windows, Microsoft 365 + WebView2 Runtime | WebView2 (Edge Chromium) | **Primary target** |
| Excel on Windows, perpetual builds or no WebView2 | Internet Explorer 11 | **Unsupported — must fail legibly** |
| Excel on the web | The user's browser | Secondary |
| Excel on Mac | WKWebView | Out of scope; untested, not claimed |

Windows is the only platform where the legacy-webview problem actually occurs. Supporting IE11
would mean the PDF.js legacy build plus polyfills and still not deliver a usable viewer;
`ResizeObserver` (`FR-PDF-06`) and modern PDF.js both require the modern baseline. IE11 instead
gets a static `nomodule` message that needs no JS.

**Cost accepted:** users on perpetual Office builds without WebView2 get the message, not the
product. Mac users get nothing. Either changing is a new decision and a real testing commitment.
**Follow-up:** log platform and host version at bootstrap via `OfficeHost`, so a support report
identifies the webview. Verification order is **Windows → web**; a phase gate not run in Excel on
Windows has not been run.

### D6 — XML add-in manifest · *Accepted 2026-08-25*

`manifest/manifest.xml` (production origin) and `manifest/manifest.dev.xml` (dev origin);
`<AppDomains>` lists the single origin from D3. XML has the widest host support and the
best-documented Windows sideload path, and is the only format that works across perpetual Office
builds — which D5 makes the relevant axis. The unified JSON manifest is the strategic direction but
its host coverage is narrower today.

**Cost accepted:** a future migration, bounded by Microsoft's conversion tooling.
**Follow-ups:** re-verify unified-manifest host coverage before migrating — this entry's premise is
a point-in-time platform fact and the part most likely to have changed. Two manifests means two
places a URL can drift; keep the difference to the origin alone. Every manifest change needs the
Excel add-in cache cleared before re-testing (`office-addin-dev` skill), or it will look like it
didn't take effect. `npx office-addin-manifest validate` runs in the phase gate (`FR-OFC-06`).
