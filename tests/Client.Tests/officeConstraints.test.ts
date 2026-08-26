import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

function readRepoText(pathFromRoot: string): string {
  return readFileSync(resolve(REPO_ROOT, pathFromRoot), 'utf8');
}

describe('Office task-pane constraints', () => {
  it('loads Office.js from the Microsoft CDN over HTTPS (FR-OFC-05)', () => {
    const taskpaneHtml = readRepoText('src/Client/taskpane.html');

    expect(taskpaneHtml).toContain(
      '<script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>',
    );
  });

  it('keeps taskpane.html CSP-safe: scripts are external and no inline event handlers are used', () => {
    const taskpaneHtml = readRepoText('src/Client/taskpane.html');

    expect(taskpaneHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(taskpaneHtml).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('includes a static unsupported-host fallback and a module entrypoint (FR-OFC-04)', () => {
    const taskpaneHtml = readRepoText('src/Client/taskpane.html');

    expect(taskpaneHtml).toContain('id="unsupported-host"');
    expect(taskpaneHtml).toContain('<script type="module" src="./app/main.ts"></script>');
  });

  it('uses an HTTPS dev server configuration and installs dev certs when serving (FR-OFC-05)', () => {
    const viteConfig = readRepoText('src/Client/vite.config.ts');

    expect(viteConfig).toContain("const apiTarget = process.env.PDFEXPLORER_API_URL ?? 'https://localhost:7178';");
    expect(viteConfig).toContain('httpsDevServerOptions');
    expect(viteConfig).toContain('config.server = { ...config.server, https: await httpsDevServerOptions() };');
  });
});