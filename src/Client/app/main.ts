import { whenOfficeReady } from '../office/officeHost';
import { bootstrap, createDefaultDependencies } from './bootstrap';

const ROOT_ID = 'app';

/**
 * FR-OFC-01: nothing touches the application until the host says it is ready. Everything after
 * this line is plain web code (FR-OFC-02).
 */
async function start(): Promise<void> {
  const root = document.getElementById(ROOT_ID);
  if (root === null) return;

  try {
    const host = await whenOfficeReady();
    // D5 follow-up: a support report has to be able to identify the webview it ran in.
    console.info(`[PdfExplorer] host platform=${host.platform} version=${host.hostVersion}`);
    bootstrap(root, createDefaultDependencies());
  } catch (error) {
    console.error('[PdfExplorer] failed to start', error);
    // NFR-ERR-02/06: a legible message, never a blank pane and never an exception detail.
    const failure = document.createElement('p');
    failure.className = 'startup-failure';
    failure.textContent = 'PDF Explorer could not start. Close and reopen the pane to try again.';
    root.appendChild(failure);
  }
}

void start();
