import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries from docs/03-client.md, enforced at lint time. The same boundaries are
 * asserted over the source tree in tests/Client.Tests/architecture.test.ts (DOD-14, FR-OFC-03)
 * so they also fail a phase gate, not just an editor.
 */
export default tseslint.config(
  { ignores: ['node_modules/**', '../Server/wwwroot/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // NFR-CODE-04: `any` needs an inline justification, so make it loud.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message:
            'NFR-SEC-02: names and API responses are untrusted. Use textContent, or build elements.',
        },
        {
          property: 'outerHTML',
          message: 'NFR-SEC-02: use textContent or build elements.',
        },
      ],
    },
  },

  {
    // FR-OFC-03: Office.js lives in office/ and nowhere else.
    files: ['**/*.ts'],
    ignores: ['office/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Office',
          message: 'FR-OFC-03: Office.js is confined to src/Client/office/.',
        },
      ],
    },
  },

  {
    // Rule 6: the PDF.js seam. Components depend on pdf/types, never on the library.
    files: ['**/*.ts'],
    ignores: ['pdf/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pdfjs-dist', 'pdfjs-dist/*'],
              message: 'Rule 6: pdfjs-dist is imported only in src/Client/pdf/.',
            },
          ],
        },
      ],
    },
  },

  {
    // Components are dumb: props in, events out. No transport, no host, no renderer library.
    files: ['components/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/http', '**/services/folderService', '**/services/pdfService'],
              message:
                'FR-UI-02: components never reach the HTTP boundary. Take data and callbacks as props.',
            },
            {
              group: ['**/office/*', 'pdfjs-dist', 'pdfjs-dist/*', '**/pdf/pdfDocumentService'],
              message:
                'FR-UI-02 / FR-OFC-03: components depend on interfaces (pdf/types), never on Office.js or PDF.js.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'FR-UI-02: components do not perform I/O.' },
        { name: 'Office', message: 'FR-OFC-03: Office.js is confined to src/Client/office/.' },
      ],
    },
  },

  {
    // services/ owns the HTTP boundary and must not depend on the DOM layer.
    files: ['services/**/*.ts', 'state/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/components/*'],
              message: 'NFR-CODE-01: dependencies point inward. services/ and state/ never import components.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['vite.config.ts', 'vitest.config.ts', 'eslint.config.js'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
