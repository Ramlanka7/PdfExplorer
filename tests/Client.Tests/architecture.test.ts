import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cheap scripted assertions over the source tree. They are the only automated guard on the
 * boundaries that matter most, so they run with every phase gate (docs/05-testing.md).
 *
 * A boundary that is only a convention is a boundary that erodes.
 */
// Not `new URL(..., import.meta.url)`: Vite rewrites that form into an asset reference.
const CLIENT_ROOT = resolve(import.meta.dirname, '../../src/Client');

interface SourceFile {
  /** Path relative to src/Client, always with forward slashes. */
  readonly path: string;
  readonly text: string;
  /** `text` without whole-line comments, so a rule can cite itself in a comment. */
  readonly code: string;
}

/**
 * Drops line and JSDoc comment lines only. A trailing comment stays, which is the safe
 * direction: it can produce a false positive that a human resolves, never a false negative
 * that lets a boundary violation through.
 */
function stripCommentLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
}

const SOURCE_FILES = collectSources(CLIENT_ROOT);

function collectSources(root: string): SourceFile[] {
  const files: SourceFile[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
        continue;
      }
      if (extname(entry.name) !== '.ts') continue;
      if (entry.name.endsWith('.config.ts')) continue;
      const text = readFileSync(full, 'utf8');
      files.push({
        path: relative(root, full).split(sep).join('/'),
        text,
        code: stripCommentLines(text),
      });
    }
  };

  walk(root);
  return files;
}

const filesUnder = (directory: string): SourceFile[] =>
  SOURCE_FILES.filter((file) => file.path.startsWith(`${directory}/`));

const offenders = (files: readonly SourceFile[], pattern: RegExp): string[] =>
  files.filter((file) => pattern.test(file.code)).map((file) => file.path);

describe('client architecture', () => {
  it('finds the client source tree', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(15);
  });

  it('confines Office.js to office/ (FR-OFC-03, rule 5)', () => {
    const outside = SOURCE_FILES.filter((file) => !file.path.startsWith('office/'));

    expect(offenders(outside, /\bOffice\s*\./)).toEqual([]);
  });

  it('confines pdfjs-dist to pdf/ (rule 6)', () => {
    const outside = SOURCE_FILES.filter((file) => !file.path.startsWith('pdf/'));

    expect(offenders(outside, /from\s+'pdfjs-dist/)).toEqual([]);
  });

  it('keeps components off the transport, host, and renderer layers (DOD-14, FR-UI-02)', () => {
    const components = filesUnder('components');
    expect(components.length).toBeGreaterThan(5);

    expect(offenders(components, /from\s+'[^']*services\/(http|folderService|pdfService)'/)).toEqual(
      [],
    );
    expect(offenders(components, /from\s+'[^']*office\//)).toEqual([]);
    expect(offenders(components, /from\s+'[^']*pdf\/pdfDocumentService'/)).toEqual([]);
    expect(offenders(components, /\bfetch\s*\(/)).toEqual([]);
  });

  it('keeps the inner layers from importing components (NFR-CODE-01)', () => {
    const inner = [...filesUnder('services'), ...filesUnder('state'), ...filesUnder('pdf')];

    expect(offenders(inner, /from\s+'[^']*components\//)).toEqual([]);
  });

  it('names no storage technology anywhere in the client (DOD-14, DOD-15)', () => {
    // Comments included on purpose: if the client is genuinely ignorant of where files live,
    // it has no reason to mention a product name even in prose.
    const technologies = /sharepoint|onedrive|azure|dropbox|\bblob storage\b|\bfile share\b/i;
    const named = SOURCE_FILES.filter((file) => technologies.test(file.text)).map(
      (file) => file.path,
    );

    expect(named).toEqual([]);
  });

  it('never assigns provider-derived content through innerHTML (NFR-SEC-02)', () => {
    expect(offenders(SOURCE_FILES, /\.innerHTML\s*=|\.outerHTML\s*=/)).toEqual([]);
  });

  it('uses no untyped escape hatch (NFR-CODE-04)', () => {
    expect(offenders(SOURCE_FILES, /:\s*any\b|<any>|\bas\s+any\b/)).toEqual([]);
  });
});
