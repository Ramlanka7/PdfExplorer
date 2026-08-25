import { afterEach, describe, expect, it, vi } from 'vitest';

import { whenOfficeReady } from '../../src/Client/office/officeHost';

/**
 * The whole point of confining Office.js to one module is that the rest of the client - and this
 * suite - runs without Excel (NFR-CODE-07). A hand-written stub is enough to prove the bootstrap
 * contract; whether it is really Excel on the other side is a manual check (docs/04-office.md).
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('whenOfficeReady', () => {
  it('waits for Office.onReady before the application starts (FR-OFC-01)', async () => {
    let resolveReady: (info: unknown) => void = () => {};
    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    vi.stubGlobal('Office', {
      onReady: () => ready,
      context: { diagnostics: { platform: 'PC', version: '16.0.18324.20168' } },
    });

    let settled = false;
    const pending = whenOfficeReady().then((host) => {
      settled = true;
      return host;
    });

    expect(settled).toBe(false);
    resolveReady({ host: 'Excel', platform: 'PC' });

    await expect(pending).resolves.toEqual({
      platform: 'PC',
      hostVersion: '16.0.18324.20168',
    });
  });

  it('starts anyway when the page is not hosted by Office, so the app is developable in a tab', async () => {
    await expect(whenOfficeReady()).resolves.toEqual({
      platform: 'Browser (not hosted by Office)',
      hostVersion: 'n/a',
    });
  });

  it('treats office.js loaded outside a host as a plain browser', async () => {
    vi.stubGlobal('Office', { onReady: () => Promise.resolve({ host: null, platform: null }) });

    await expect(whenOfficeReady()).resolves.toMatchObject({ hostVersion: 'n/a' });
  });
});
