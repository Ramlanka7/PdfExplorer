---
name: office-addin-dev
description: Run, sideload, debug, and validate the Excel add-in on Windows — WebView2 prerequisites, HTTPS dev certificates, manifest validation, registry and trusted-catalog sideloading, Edge DevTools attach, Wef cache clearing, and diagnosing a task pane that loads blank or shows the unsupported-host message. Use whenever the add-in must actually run in Excel, when the manifest changes, or when something works in a browser but fails in the task pane.
---

# Running the add-in in Excel on Windows

**Target host: Excel on Windows (Microsoft 365 + WebView2 Runtime)** — decision D5. Several
requirements can be verified nowhere else (`DOD-02`, `DOD-03`, `DOD-09`, `DOD-11`, `FR-OFC-04`). A
browser tab does not substitute, and neither does Excel on the web. Do not improvise these steps —
inconsistent sideloading is the most common source of "it worked yesterday".

## 0. Prerequisites

- **Microsoft 365 Excel on Windows** with the **WebView2 Runtime** installed. Without it Excel falls
  back to the IE11 webview and you will get the unsupported-host message instead of the add-in
  (correct behaviour per decision D5 — but check this first if the message appears unexpectedly).
- .NET 10 SDK and Node.js on the machine running the app.
- Confirm which webview you actually got: the bootstrap logs platform and host version via
  `OfficeHost`. Check that before debugging anything else.

> **If you edit code on one machine and run Excel on another:** `localhost` in the manifest only
> works when the app runs on the same machine as Excel. In a split setup the dev server must be
> reachable from the Windows box by hostname or IP, that URL must be in the manifest **and** in
> `<AppDomains>`, and the dev certificate must be trusted **on the Windows machine**. The simplest
> arrangement by far is to run the dev server, the API, and Excel all on Windows.

## 1. HTTPS dev certificates (once per machine)

Office refuses to load an add-in over plain HTTP, including from localhost (`FR-OFC-05`).

```bash
npx office-addin-dev-certs install     # installs and trusts a localhost CA
npx office-addin-dev-certs verify
```

Run this on the machine Excel runs on. The Vite dev server consumes these certs. A blank pane with a
certificate or mixed-content error in the console is this.

**Never** work around a certificate problem by disabling security in the webview (`NFR-SEC-04`,
rule 15).

## 2. Validate the manifest

```bash
npx office-addin-manifest validate manifest/manifest.dev.xml
```

Every URL the pane loads must be HTTPS, and its domain must be declared in `<AppDomains>` —
undeclared domains are blocked, which presents as a pane that opens empty with no network activity.

## 3. Start and sideload

```bash
dotnet run --project src/Server              # API (Kestrel)
npm --prefix src/Client run dev              # Vite: HTTPS, proxies /api to Kestrel (decision D3)
npx office-addin-debugging start manifest/manifest.dev.xml
```

The third command registers the add-in for development under
`HKEY_CURRENT_USER\Software\Microsoft\Office\16.0\WEF\Developer\` and launches Excel with it loaded.
To unregister:

```bash
npx office-addin-debugging stop manifest/manifest.dev.xml
```

**Manual fallback** — trusted catalog, if the tooling misbehaves:

1. Put `manifest.dev.xml` in a shared folder (a local folder shared as `\\<machine>\<share>` works).
2. Excel → File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs.
3. Add the **share path** (not a drive letter), tick **Show in Menu**, OK.
4. Restart Excel → Insert → My Add-ins → **Shared Folder** tab → pick the add-in.

## 4. Debug

**VS Code / direct attach** — the primary loop:

```bash
npx office-addin-debugging start manifest/manifest.dev.xml --debug-method direct
```

**Microsoft Edge DevTools** — install the **Microsoft Edge DevTools Preview** app from the Microsoft
Store, run it with the add-in loaded, and attach to the running task-pane target. This is the
practical way to get a real console, network panel, and DOM inspector against WebView2.

The task pane's personality menu (the control in the pane's corner) also exposes an attach-debugger
entry when the add-in is sideloaded for development. Exact wording varies by Office build — check
what your install actually shows rather than assuming.

**Server-side** — watch the ASP.NET Core log and match on the correlation ID from the error envelope
(`NFR-ERR-05`).

## 5. Clear the cache when a stale build persists

Excel caches add-in assets aggressively. After **any** manifest change:

1. Close Excel.
2. Delete the contents of `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`.
3. Restart Excel.

A manifest change without a cache clear is the second most common source of phantom failures, right
behind an untrusted certificate. If you are on an older webview, also clear the
`Microsoft.Win32WebViewHost` package cache under `%LOCALAPPDATA%\Packages\`.

## Diagnosing a broken pane

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Unsupported-host message on a machine that should work | Missing WebView2 Runtime, or a perpetual Office build | Install the WebView2 Runtime; confirm the Office build (step 0) |
| Pane blank, no network activity | Manifest URL wrong, or domain not in `<AppDomains>` | Fix manifest, clear cache, restart |
| Pane blank, certificate error in console | Dev certs missing or untrusted **on this machine** | Step 1 |
| Loads in a browser, blank in Excel | CSP blocked a script or the PDF.js worker, or a CDN reference | Self-host the asset (`docs/03-client.md`, decision D1/D2) |
| PDF never renders, no error | PDF.js worker blocked by CSP | Same-origin `workerSrc` via `new URL(..., import.meta.url)` |
| API calls fail from Excel but work in the browser | Dev server not reachable from the Excel machine (split setup) | Step 0 note — use a reachable host, not `localhost` |
| Stale UI after a rebuild | Add-in cache | Step 5 |

## Record the result

Every run that verifies a manual requirement goes in the manual verification table of
`docs/06-delivery.md`: date, Office build and webview, what was checked, result. An unlogged check
did not happen.
