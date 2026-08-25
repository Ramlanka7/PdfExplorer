import { whenOfficeReady } from '../office/officeHost';
import { bootstrap, createDefaultDependencies } from './bootstrap';

const ROOT_ID = 'app';
const INSECURE_ORIGIN_MESSAGE =
  'PDF Explorer requires HTTPS. Reopen this add-in from an https:// origin.';
const STARTUP_FAILURE_MESSAGE =
  'PDF Explorer could not start. Close and reopen the pane to try again.';

function appendStartupMessage(root: HTMLElement, message: string): void {
  const failure = document.createElement('p');
  failure.className = 'startup-failure';
  failure.textContent = message;
  root.appendChild(failure);
}

function isHttpsOrigin(): boolean {
  return window.location.protocol === 'https:';
}

/**
 * FR-OFC-01: nothing touches the application until the host says it is ready. Everything after
 * this line is plain web code (FR-OFC-02).
 */
async function start(): Promise<void> {
  const root = document.getElementById(ROOT_ID);
  if (root === null) return;

  // FR-OFC-05: task panes require HTTPS, localhost included.
  if (!isHttpsOrigin()) {
    console.error(`[PdfExplorer] insecure origin: ${window.location.protocol}`);
    appendStartupMessage(root, INSECURE_ORIGIN_MESSAGE);
    return;
  }

  try {
    const host = await whenOfficeReady();
    // D5 follow-up: a support report has to be able to identify the webview it ran in.
    console.info(`[PdfExplorer] host platform=${host.platform} version=${host.hostVersion}`);
    bootstrap(root, createDefaultDependencies());
  } catch (error) {
    console.error('[PdfExplorer] failed to start', error);
    // NFR-ERR-02/06: a legible message, never a blank pane and never an exception detail.
    appendStartupMessage(root, STARTUP_FAILURE_MESSAGE);
  }
}

void start();
