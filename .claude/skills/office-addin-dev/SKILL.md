---
name: office-addin-dev
description: Run, sideload, debug, and validate the Excel add-in on Windows — WebView2 prerequisites, HTTPS dev certificates, manifest validation, registry and trusted-catalog sideloading, Edge DevTools attach, Wef cache clearing, and diagnosing a task pane that loads blank or shows the unsupported-host message. Use whenever the add-in must actually run in Excel, when the manifest changes, or when something works in a browser but fails in the task pane.
---

# Running the add-in in Excel on Windows

**Target host: Excel on Windows (Microsoft 365 + WebView2 Runtime)** — see `docs/decisions.md`. A
browser tab or Excel on the web doesn't substitute for `DOD-02`, `DOD-03`, `DOD-09`, `DOD-11`,
`FR-OFC-04`. Inconsistent sideloading is the most common source of "it worked yesterday" — follow
these steps rather than improvising.

## 0. Prerequisites

- **Microsoft 365 Excel on Windows** with the **WebView2 Runtime** installed. Without it Excel falls
  back to the IE11 webview and you will get the unsupported-host message instead of the add-in
  (correct behaviour per `docs/decisions.md` — but check this first if the message appears unexpectedly).
- .NET 10 SDK and Node.js on the machine running the app.
- Confirm which webview you actually got: the bootstrap logs platform and host version via
  `OfficeHost`. Check that before debugging anything else.

> **Editing on one machine, running Excel on another:** `localhost` in the manifest only works when
> the app and Excel are on the same machine. In a split setup, the dev server must be reachable from
> the Windows box by hostname/IP, that URL needs to be in the manifest **and** `<AppDomains>`, and
> the dev cert must be trusted **on the Windows machine**. Simplest fix: run everything on Windows.

## 1. HTTPS dev certificates (automatic — nothing to run here on a fresh clone)

Office refuses to load an add-in over plain HTTP, including from localhost (`FR-OFC-05`). You do
**not** need a separate command for this: `npm --prefix src/Client run dev` calls
`office-addin-dev-certs`'s `getHttpsServerOptions()` itself (`vite.config.ts`), which generates a
localhost CA and installs it into the current user's trust store (no admin prompt) the first time
it runs on a machine. A fresh clone gets a working `https://localhost:3000` from the two commands in
step 3 alone.

Only reach for the manual commands below when that self-install didn't take — e.g. a corporate
Group Policy blocks writes to the CurrentUser Root store, or you're diagnosing a cert/mixed-content
error already showing in the console:

```bash
npx office-addin-dev-certs verify      # confirms whether the CA is actually trusted
npx office-addin-dev-certs install     # re-generates and re-trusts it if not
```

If the browser still warns after `install` reports success, close **all** browser windows first —
Chromium caches a per-site invalid-certificate decision from before the CA existed and won't
re-check until every window for that profile is closed.

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
npm --prefix src/Client run dev              # Vite: HTTPS, proxies /api to Kestrel (docs/decisions.md)
```

`office-addin-debugging` needs a `package.json` in the working directory, and this repo's is at
`src/Client/`, not the root — run it from there, with a manifest path relative to that directory:

```bash
cd src/Client
npx office-addin-debugging start ../../manifest/manifest.dev.xml --no-debug
```

Running it from the repo root fails with `ENOENT: no such file or directory, open
'.../package.json'` — there is no root-level `package.json` to find. `--no-debug` skips the
debugger-attach prompt for a plain "does it load" check; drop it when you actually want to attach.

This registers the add-in for development under
`HKEY_CURRENT_USER\Software\Microsoft\Office\16.0\WEF\Developer\` and launches Excel with it loaded.
To unregister (same directory):

```bash
npx office-addin-debugging stop ../../manifest/manifest.dev.xml
```

**If the tooling misbehaves:** share `manifest.dev.xml` in a folder, add that share path (not a
drive letter) under Excel → File → Options → Trust Center → Trusted Add-in Catalogs, tick **Show in
Menu**, restart Excel, then Insert → My Add-ins → **Shared Folder**.

## 4. Debug

**VS Code / direct attach** — the primary loop, run from `src/Client` like step 3:

```bash
npx office-addin-debugging start ../../manifest/manifest.dev.xml --debug-method direct
```

**Microsoft Edge DevTools** — install the **Microsoft Edge DevTools Preview** app from the Microsoft
Store and attach to the running task-pane target for a real console/network/DOM inspector against
WebView2. The task pane's corner menu also has an attach-debugger entry when sideloaded for dev —
exact wording varies by Office build.

**Server-side** — watch the ASP.NET Core log and match the correlation ID from the error envelope
(`NFR-ERR-05`).

## 5. Clear the cache when a stale build persists

Excel caches add-in assets aggressively. After **any** manifest change:

1. Close Excel.
2. Delete the contents of `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`.
3. Restart Excel.

Skipping this after a manifest change is the second most common source of phantom failures, right
behind an untrusted certificate. On an older webview, also clear the `Microsoft.Win32WebViewHost`
package cache under `%LOCALAPPDATA%\Packages\`.

## Diagnosing a broken pane

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Unsupported-host message on a machine that should work | Missing WebView2 Runtime, or a perpetual Office build | Install the WebView2 Runtime; confirm the Office build (step 0) |
| Pane blank, no network activity | Manifest URL wrong, or domain not in `<AppDomains>` | Fix manifest, clear cache, restart |
| Pane blank, certificate error in console | Dev certs missing or untrusted **on this machine** | Step 1 |
| Loads in a browser, blank in Excel | CSP blocked a script or the PDF.js worker, or a CDN reference | Self-host the asset (`docs/03-client.md`, `docs/decisions.md`) |
| PDF never renders, no error | PDF.js worker blocked by CSP | Same-origin `workerSrc` via `new URL(..., import.meta.url)` |
| API calls fail from Excel but work in the browser | Dev server not reachable from the Excel machine (split setup) | Step 0 note — use a reachable host, not `localhost` |
| Stale UI after a rebuild | Add-in cache | Step 5 |
