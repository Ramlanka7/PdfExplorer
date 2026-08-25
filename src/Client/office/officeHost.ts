/**
 * The ONLY module in the client that touches Office.* (FR-OFC-03, rule 5).
 *
 * Office.js does exactly one thing in v1: tell us the host is ready (FR-OFC-02). Everything
 * downstream is plain web code, which is what lets the app run in a browser tab during
 * development and under jsdom in tests (NFR-CODE-07).
 *
 * A future requirement that genuinely needs Excel data ("insert a link to this PDF in the
 * selected cell") gets another function in this folder, never an Office call in a component.
 */
export interface OfficeHost {
  readonly platform: string;
  readonly hostVersion: string;
}

/** What we report when the page is not running inside an Office host at all. */
const STANDALONE_BROWSER: OfficeHost = {
  platform: 'Browser (not hosted by Office)',
  hostVersion: 'n/a',
};

/**
 * Resolves once the host is ready (FR-OFC-01). Bootstrap awaits this before touching the DOM
 * application, because Office may still be wiring up the pane before onReady fires.
 *
 * Outside Office - a browser tab, or a test - this resolves immediately instead of hanging, so
 * the same bundle is developable without Excel.
 */
export function whenOfficeReady(): Promise<OfficeHost> {
  if (typeof Office === 'undefined' || typeof Office.onReady !== 'function') {
    return Promise.resolve(STANDALONE_BROWSER);
  }

  return Office.onReady().then((info) => {
    // office.js loaded in a plain browser tab resolves with a null host.
    if (info === undefined || info === null || info.host === null) return STANDALONE_BROWSER;
    return describeHost(info.platform);
  });
}

/**
 * D5 follow-up: a support report has to identify the webview, and "Excel on Windows" covers
 * both WebView2 and the legacy engine. Read from diagnostics when the host exposes it.
 */
function describeHost(platform: Office.PlatformType | null): OfficeHost {
  const diagnostics = Office.context?.diagnostics;
  return {
    // PlatformType is an enum; the pane only ever logs or displays it.
    platform: String(diagnostics?.platform ?? platform ?? 'unknown'),
    hostVersion: diagnostics?.version ?? 'unknown',
  };
}
