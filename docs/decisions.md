# Decisions

Why we chose things, so it doesn't have to be re-argued. This is a prototype, not a spec under
change control — edit an entry directly when the reasoning changes; git history already keeps the
old version if anyone needs it. Add a note when a choice constrains future work or two reasonable
options existed and someone will ask "why this one?" Not for naming, file layout, or anything
trivially reversible. `/adr <decision>` adds one.

---

## Vanilla TypeScript client, hand-rolled store

The client is two components with one interaction, and the state fits in seven fields (see
`FR-UI-04`). A framework runtime is bundle weight on a corporate network and CSP/supply-chain
surface inside a sandboxed pane, for a problem this small doesn't have.

**Cost:** we own ID-keyed DOM reconciliation, kept from degenerating by the component boundaries in
[03-client.md](03-client.md) plus lint rules. Official Office samples assume webpack, so their
build config gets translated, not copied. Pulling in Redux/MobX/signals or a UI framework, or
virtualising the node list, is a real decision to make later from a profile — not a default.

## Vite as the build tool

Two environment facts decided this, not taste: the bundler must emit the PDF.js worker as a
**same-origin** asset via `new URL(..., import.meta.url)`, and must serve HTTPS in dev
(`FR-OFC-05`). Target `es2020`.

## Same origin everywhere; no CORS policy registered

ASP.NET serves the built bundle from `wwwroot`; Vite proxies `/api` to Kestrel in dev. The pane's
document and the API therefore share an origin and every call is same-origin. Excel on the web
renders the pane as a third-party context where cookies are unreliable, and a permissive dev CORS
policy is the classic way that leaks into production — so CORS is **designed out** rather than
carefully configured.

**Cost:** the bundle can't be served from a CDN; client and server deploy together. If a
split-origin deployment ever becomes real, it needs an exact-origin allowlist, not a wildcard.

## Stream PDF bytes through the API

`GET /api/pdfs/{id}/content`. A design that depends on the backend minting a URL can't support the
two providers we build first: mock bytes are embedded, and a local filesystem has no URL at all.
One delivery path for every provider is what makes swapping providers possible without touching the
client, and it keeps the server the only holder of credentials and the only validator of IDs.

**Cost:** every previewed byte crosses the app server. Mitigated by range requests and on-demand
page rendering. A signed-URL redirect for providers that can mint one is a cheap upgrade later
(`PdfSource` is a URL either way, PDF.js follows redirects) — don't build it before a measurement
asks for it.

## ES2020 baseline; Excel on Windows is the target

| Host | Engine | Status |
| --- | --- | --- |
| Excel on Windows, Microsoft 365 + WebView2 Runtime | WebView2 (Edge Chromium) | **Primary target** |
| Excel on Windows, perpetual builds or no WebView2 | Internet Explorer 11 | **Unsupported — must fail legibly** |
| Excel on the web | The user's browser | Secondary |
| Excel on Mac | WKWebView | Out of scope; untested, not claimed |

Windows is the only platform where the legacy-webview problem occurs. Supporting IE11 would mean
the PDF.js legacy build plus polyfills and still not deliver a usable viewer — `ResizeObserver`
(`FR-PDF-06`) and modern PDF.js both need the modern baseline. IE11 gets a static `nomodule`
message instead, which needs no JS.

**Cost:** users on perpetual Office builds without WebView2 get the message, not the product. Mac
users get nothing. Verification order is **Windows → web**; a check not run in Excel on Windows has
not been run.

## XML add-in manifest

`manifest/manifest.xml` (production origin) and `manifest/manifest.dev.xml` (dev origin);
`<AppDomains>` lists the single origin from the same-origin decision above. XML has the widest host
support and the best-documented Windows sideload path, and is the only format that works across
perpetual Office builds — which matters given the Windows-target decision above. The unified JSON
manifest is the strategic direction but its host coverage is narrower today.

**Cost:** a future migration, bounded by Microsoft's conversion tooling. Two manifests means two
places a URL can drift — keep the difference to the origin alone. Every manifest change needs the
Excel add-in cache cleared before re-testing (`office-addin-dev` skill), or it looks like it didn't
take effect. `npx office-addin-manifest validate` is part of a normal check pass (`FR-OFC-06`).
