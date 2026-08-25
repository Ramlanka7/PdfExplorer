# Office task-pane constraints

The pane is a sandboxed iframe inside Excel, not a browser tab. These are the rules of that
environment (`FR-OFC-05`).

| Constraint | Consequence |
| --- | --- |
| **HTTPS required**, including localhost in dev | Plain `http://localhost` will not load. Dev certs are mandatory. |
| **Iframe execution** | No `window.open` assumptions, no top-level navigation, no reliance on being the top frame. |
| **No filesystem access** | `file://`, UNC shares, and mapped drives are unreachable from JS. Bytes come from the API. |
| **CSP** | Inline scripts and eval are restricted. Bundle everything; self-host workers and fonts. |
| **CORS** | Designed out — the pane document and the API share one origin (D3). Never re-introduce a policy to work around a split deployment without a superseding decision. |
| **Third-party cookie blocking** | Cookie sessions are unreliable in Excel on the web. Prefer bearer tokens in headers. |
| **Webview variance** | WebView2 on Microsoft 365 Windows builds is the target. Perpetual builds or a missing runtime fall back to IE11, which is unsupported (D5) and must fail with a legible message, not a blank pane. |
| **No PDF plugin** | The host's native viewer is unavailable to the pane. Rendering is our job (PDF.js). |
| **Manifest gating** | Domains not listed in `<AppDomains>` may be blocked; only manifest-declared URLs load. |

## Office.js isolation (`FR-OFC-02`, `FR-OFC-03`)

Office.js does exactly one thing in v1: tell us the host is ready.

```ts
// src/Client/office/officeHost.ts — the ONLY module importing Office.*
export interface OfficeHost {
  readonly platform: string;
  readonly hostVersion: string;
}
export function whenOfficeReady(): Promise<OfficeHost>;
```

`main.ts` awaits it, then boots the application. Everything downstream is plain web code — which is
what makes the client testable without Excel (`NFR-CODE-07`) and runnable in a browser during
development. A future requirement that genuinely needs Excel data ("insert a link to this PDF in
the selected cell") goes behind another function in `office/`, never inline in a component.

## Verification matrix

`DOD-02`, `DOD-03`, `DOD-09`, `DOD-11` and `FR-OFC-04` cannot be proven by unit tests. Each phase
gate re-checks them in this order (D5). **A phase gate that has not been run in Excel on Windows
has not been run** — a browser tab, and Excel on the web, each prove something narrower.

| # | Host | Notes |
| --- | --- | --- |
| 1 | **Excel on Windows (Microsoft 365 + WebView2)** | The target. `DOD-02/03/09/11` and `FR-OFC-04` are signed off here and nowhere else |
| 2 | Task pane at minimum width, in Windows Excel | `FR-UI-09`, measured in the real pane, not a resized browser window |
| 3 | Excel on the web (Edge/Chrome) | Secondary: third-party context, real CSP, cross-origin framing |
| 4 | Unsupported-host message on a legacy webview | The `nomodule` path. Realistic on Windows — a perpetual build or missing WebView2 Runtime lands here |
| — | Excel on Mac | Out of scope. Not tested, not claimed |

Record results in [06-delivery.md](06-delivery.md#manual-verification-log) with date and build.
Sideloading, dev certs, manifest validation, and the debug attach live in the `office-addin-dev`
skill — get them from there so they stay consistent across sessions.
