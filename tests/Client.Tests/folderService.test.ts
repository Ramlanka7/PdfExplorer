import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../src/Client/services/errors';
import { createFolderService } from '../../src/Client/services/folderService';
import { asItemId } from '../../src/Client/state/types';

/**
 * Unit tests for the transport seam. fetch is the FolderService's own collaborator, so stubbing
 * it here is faking at the seam - unlike stubbing it inside a component test, which would mean
 * the component was reaching past its layer (docs/05-testing.md).
 */
function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fetchStub = vi.fn(() => {
    const next = responses.shift();
    if (next === undefined) throw new Error('Unexpected extra fetch');
    return Promise.resolve(next);
  });
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

function page(items: unknown[], nextCursor: string | null = null): Response {
  return new Response(JSON.stringify({ items, nextCursor }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function envelope(status: number, code: string, correlationId = '0HN7ABC'): Response {
  return new Response(JSON.stringify({ error: { code, message: 'ignored', correlationId } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FOLDER_ITEM = {
  id: 'f_2026',
  name: '2026',
  type: 'folder',
  hasChildren: true,
  parentId: 'f_contracts',
};

const PDF_ITEM = {
  id: 'p_a',
  name: 'Contract A.pdf',
  type: 'pdf',
  hasChildren: true,
  parentId: 'f_contracts',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('folderService', () => {
  it('asks for root items and nothing else (FR-LAZY-01, DOD-12)', async () => {
    const fetchStub = stubFetch(page([FOLDER_ITEM]));

    const nodes = await createFolderService().getRootItems();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/folders/root');
    expect(nodes[0]?.depth).toBe(0);
  });

  it('encodes opaque item ids into the URL (NFR-SEC-03, FR-DATA-07)', async () => {
    const fetchStub = stubFetch(page([]));

    await createFolderService().getChildren(asItemId('a b/../c?d#e'), 0);

    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/folders/a%20b%2F..%2Fc%3Fd%23e/children');
  });

  it('places children one level below their parent', async () => {
    stubFetch(page([FOLDER_ITEM]));

    const nodes = await createFolderService().getChildren(asItemId('f_contracts'), 2);

    expect(nodes[0]?.depth).toBe(3);
    expect(nodes[0]?.parentId).toBe('f_contracts');
  });

  it('collapses concurrent requests for one folder into a single call (FR-LAZY-04, NFR-PERF-02)', async () => {
    const fetchStub = stubFetch(page([FOLDER_ITEM]));
    const service = createFolderService();

    const [first, second] = await Promise.all([
      service.getChildren(asItemId('f_contracts'), 0),
      service.getChildren(asItemId('f_contracts'), 0),
    ]);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('starts a fresh request once the previous one has settled (FR-LAZY-06)', async () => {
    const fetchStub = stubFetch(envelope(503, 'UPSTREAM_UNAVAILABLE'), page([FOLDER_ITEM]));
    const service = createFolderService();

    await expect(service.getChildren(asItemId('f_contracts'), 0)).rejects.toBeInstanceOf(ApiError);
    await expect(service.getChildren(asItemId('f_contracts'), 0)).resolves.toHaveLength(1);

    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('tolerates a provider that returns a paging cursor (FR-DATA-08)', async () => {
    stubFetch(page([FOLDER_ITEM], 'cursor-token'));

    await expect(createFolderService().getRootItems()).resolves.toHaveLength(1);
  });

  it('ignores item types outside the closed set and never gives a PDF children (FR-EXP-06)', async () => {
    stubFetch(page([{ ...PDF_ITEM }, { ...FOLDER_ITEM, id: 'f_x', type: 'shortcut' }]));

    const nodes = await createFolderService().getRootItems();

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe('pdf');
    expect(nodes[0]?.hasChildren).toBe(false);
  });

  it('drops structurally invalid items rather than trusting them (NFR-SEC-01)', async () => {
    stubFetch(page([FOLDER_ITEM, { id: 42 }, null, { name: 'no id' }]));

    await expect(createFolderService().getRootItems()).resolves.toHaveLength(1);
  });

  it('turns the error envelope into a typed error carrying the correlation id', async () => {
    stubFetch(envelope(404, 'FOLDER_NOT_FOUND', '0HN7XYZ'));

    const failure = await createFolderService()
      .getChildren(asItemId('f_gone'), 0)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('FOLDER_NOT_FOUND');
    expect((failure as ApiError).correlationId).toBe('0HN7XYZ');
  });

  it('falls back to the status when a failure arrives without an envelope', async () => {
    stubFetch(new Response('<html>not found</html>', { status: 404 }));

    const failure = await createFolderService()
      .getRootItems()
      .catch((error: unknown) => error);

    expect((failure as ApiError).code).toBe('FOLDER_NOT_FOUND');
  });

  it('reports an unreachable server as a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const failure = await createFolderService()
      .getRootItems()
      .catch((error: unknown) => error);

    expect((failure as ApiError).code).toBe('NETWORK');
  });

  it('rejects a response that is not the documented shape', async () => {
    stubFetch(new Response('{"unexpected":true}', { status: 200 }));

    const failure = await createFolderService()
      .getRootItems()
      .catch((error: unknown) => error);

    expect((failure as ApiError).code).toBe('MALFORMED_RESPONSE');
  });
});
