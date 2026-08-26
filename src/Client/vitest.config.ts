import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const clientRoot = import.meta.dirname;
const repoRoot = resolve(clientRoot, '../..');

/**
 * Client tests live in tests/Client.Tests (docs/02-architecture.md), outside this Vite project.
 * That costs two lines of configuration: Vite has to be allowed to read files outside its root,
 * and a bare specifier in a test file cannot walk up to the single node_modules in the repo, so
 * the one package a test imports directly is pointed at explicitly.
 */
export default defineConfig({
  root: clientRoot,
  server: { fs: { allow: [repoRoot] } },
  resolve: {
    alias: {
      'pdfjs-dist': resolve(clientRoot, 'node_modules/pdfjs-dist/build/pdf.mjs'),
    },
  },
  test: {
    // tinyglobby treats backslash as a glob escape character, not a path separator, so the
    // pattern must use forward slashes even though path.resolve() returns native (backslash)
    // separators on Windows.
    include: [resolve(repoRoot, 'tests/Client.Tests/**/*.test.ts').replace(/\\/g, '/')],
    environment: 'jsdom',
    setupFiles: [resolve(repoRoot, 'tests/Client.Tests/setup.ts')],
    restoreMocks: true,
  },
});
