import type { FolderService } from '../../../src/Client/services/folderService';
import { asItemId, type ItemId, type TreeNode } from '../../../src/Client/state/types';

/**
 * A folder source described as a literal, so a test says what the hierarchy is instead of
 * mocking HTTP. This is the seam docs/05-testing.md says to fake at: the tree asks a
 * FolderService for a level and gets one.
 *
 * Crucially it records what was asked for. Most of the lazy-loading requirements are claims
 * about what was *not* requested, and only a call log can prove those.
 */
export interface FakeItem {
  readonly id: string;
  readonly name: string;
  readonly type: 'folder' | 'pdf';
  readonly children?: readonly FakeItem[];
}

export const ROOT_REQUEST = 'root';

export interface FakeFolderService extends FolderService {
  /** Every request in order: 'root', or the id of the folder whose children were asked for. */
  readonly requests: readonly string[];
  countOf(key: string): number;
  /** Makes the next request for `key` hang until release(key). */
  hold(key: string): void;
  release(key: string): void;
  /** Makes the next request for `key` reject. */
  failNext(key: string, error: unknown): void;
  /** How many times browseForSource() was called. */
  readonly browseCalls: number;
  /** Makes the next browseForSource() resolve as if the user closed the dialog without picking anything. */
  cancelNextBrowse(): void;
  /** How many times clearSource() was called. */
  readonly clearCalls: number;
}

interface Gate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

export function createFakeFolderService(roots: readonly FakeItem[]): FakeFolderService {
  const index = new Map<string, FakeItem>();
  indexItems(roots, index);

  const requests: string[] = [];
  const gates = new Map<string, Gate>();
  const failures = new Map<string, unknown>();
  let browseCalls = 0;
  let nextBrowseCanceled = false;
  let clearCalls = 0;

  async function respond(key: string, produce: () => readonly TreeNode[]): Promise<readonly TreeNode[]> {
    requests.push(key);

    const gate = gates.get(key);
    if (gate !== undefined) await gate.promise;

    if (failures.has(key)) {
      const failure = failures.get(key);
      failures.delete(key);
      throw failure;
    }
    return produce();
  }

  return {
    requests,

    async browseForSource() {
      browseCalls += 1;
      if (nextBrowseCanceled) {
        nextBrowseCanceled = false;
        return false;
      }
      return true;
    },

    get browseCalls() {
      return browseCalls;
    },

    cancelNextBrowse() {
      nextBrowseCanceled = true;
    },

    async clearSource() {
      clearCalls += 1;
    },

    get clearCalls() {
      return clearCalls;
    },

    countOf(key) {
      return requests.filter((request) => request === key).length;
    },

    hold(key) {
      let open = (): void => {};
      const promise = new Promise<void>((resolve) => {
        open = resolve;
      });
      gates.set(key, { promise, open });
    },

    release(key) {
      const gate = gates.get(key);
      gates.delete(key);
      gate?.open();
    },

    failNext(key, error) {
      failures.set(key, error);
    },

    getRootItems() {
      return respond(ROOT_REQUEST, () => toTreeNodes(roots, null, 0));
    },

    getChildren(folderId, parentDepth) {
      return respond(folderId, () => {
        const folder = index.get(folderId);
        return toTreeNodes(folder?.children ?? [], folderId, parentDepth + 1);
      });
    },
  };
}

function indexItems(items: readonly FakeItem[], into: Map<string, FakeItem>): void {
  for (const item of items) {
    into.set(item.id, item);
    if (item.children !== undefined) indexItems(item.children, into);
  }
}

/**
 * Returns one level and only one level - exactly what the API contract promises, so a test can
 * never accidentally prove lazy loading against a fake that handed over the whole subtree.
 */
function toTreeNodes(
  items: readonly FakeItem[],
  parentId: string | null,
  depth: number,
): readonly TreeNode[] {
  return items.map((item) => ({
    id: asItemId(item.id),
    name: item.name,
    type: item.type,
    hasChildren: item.type === 'folder' && (item.children?.length ?? 0) > 0,
    parentId: parentId === null ? null : asItemId(parentId),
    depth,
  }));
}

export function id(value: string): ItemId {
  return asItemId(value);
}
