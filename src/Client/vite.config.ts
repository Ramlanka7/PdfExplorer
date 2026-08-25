import { createReadStream } from 'node:fs';
import { cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin, type ServerOptions, type UserConfig } from 'vite';

const clientRoot = import.meta.dirname;

/**
 * Kestrel's HTTPS endpoint in development. Overridable so a developer running the API on a
 * different port does not have to edit this file (D3: the pane and the API share one origin,
 * so in dev the proxy is what creates that single origin).
 */
const apiTarget = process.env.PDFEXPLORER_API_URL ?? 'https://localhost:7178';

/**
 * Office refuses to load a task pane over plain HTTP, localhost included (04-office.md, R3).
 * Certificates come from office-addin-dev-certs; the `office-addin-dev` skill installs them.
 */
async function httpsDevServerOptions(): Promise<ServerOptions['https']> {
  try {
    const devCerts = await import('office-addin-dev-certs');
    return await devCerts.default.getHttpsServerOptions();
  } catch (cause) {
    throw new Error(
      'No HTTPS development certificate found. Run `npx office-addin-dev-certs install` ' +
        '(see the office-addin-dev skill). Excel will not load a task pane over http://.',
      { cause },
    );
  }
}

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

/** Folders pdf.js fetches at runtime. Served same-origin, never from a CDN (risk R1, D3). */
const PDFJS_ASSET_FOLDERS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const;
const PDFJS_ASSET_FILE = /^[A-Za-z0-9_.-]+$/;

/**
 * pdf.js loads character maps and the standard-14 font data over HTTP at render time. Without
 * them, PDFs that rely on CJK encodings or non-embedded fonts render with missing glyphs — a
 * failure that only shows up on real documents. Ship them with the bundle and serve them from
 * our own origin in dev.
 */
function pdfjsRuntimeAssets(): Plugin {
  return {
    name: 'pdfexplorer:pdfjs-assets',

    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const [folder, file] = (req.url ?? '').replace(/^\//, '').split('/');
        const known = PDFJS_ASSET_FOLDERS.find((candidate) => candidate === folder);
        if (known === undefined || file === undefined || !PDFJS_ASSET_FILE.test(file)) {
          next();
          return;
        }
        createReadStream(resolve(pdfjsRoot, known, file))
          .on('error', () => next())
          .pipe(res);
      });
    },

    async writeBundle(options) {
      const outDir = options.dir;
      if (outDir === undefined) return;
      for (const folder of PDFJS_ASSET_FOLDERS) {
        await cp(resolve(pdfjsRoot, folder), resolve(outDir, 'pdfjs', folder), { recursive: true });
      }
    },
  };
}

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const config: UserConfig = {
    root: clientRoot,
    base: '/',
    plugins: [pdfjsRuntimeAssets()],
    build: {
      // D5: ES2020 baseline.
      target: 'es2020',
      // The API serves the built bundle from wwwroot; same origin, no CORS (D3).
      outDir: resolve(clientRoot, '../Server/wwwroot'),
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        // D2 follow-up: multiple entries configured now so adding a commands page later is
        // a one-line change rather than a build rework.
        input: {
          taskpane: resolve(clientRoot, 'taskpane.html'),
        },
      },
    },
    worker: {
      // R1: the PDF.js worker must be emitted as a same-origin ES module asset, never a CDN URL.
      format: 'es',
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
          // The dev API uses the ASP.NET Core self-signed development certificate.
          secure: false,
        },
      },
    },
  };

  if (command === 'serve') {
    config.server = { ...config.server, https: await httpsDevServerOptions() };
  }

  return config;
});
