import { ApiError } from './errors';

/**
 * The wire shape from docs/02-architecture.md#api-contract. Defined once, here, and mapped to
 * TreeNode at this boundary - components never see a raw API shape.
 *
 * Everything below treats the payload as untrusted (NFR-SEC-01): fields are checked before use,
 * and a structurally invalid item is dropped rather than trusted.
 */
export interface ExplorerItemDto {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly hasChildren: boolean;
  readonly parentId: string | null;
}

export interface FolderPageDto {
  readonly items: readonly ExplorerItemDto[];
  /**
   * v1 providers may ignore paging, but the client must tolerate a non-null cursor without
   * breaking (FR-DATA-08). v1 shows the first page; wiring "load more" is a later change here
   * and in the tree, not a contract change.
   */
  readonly nextCursor: string | null;
}

export function parseFolderPage(payload: unknown): FolderPageDto {
  if (typeof payload !== 'object' || payload === null) {
    throw new ApiError('MALFORMED_RESPONSE');
  }
  const { items, nextCursor } = payload as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(items)) {
    throw new ApiError('MALFORMED_RESPONSE');
  }

  return {
    items: items.filter(isExplorerItemDto),
    nextCursor: typeof nextCursor === 'string' ? nextCursor : null,
  };
}

function isExplorerItemDto(value: unknown): value is ExplorerItemDto {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['id'] === 'string' &&
    item['id'].length > 0 &&
    typeof item['name'] === 'string' &&
    typeof item['type'] === 'string' &&
    typeof item['hasChildren'] === 'boolean' &&
    (item['parentId'] === null || typeof item['parentId'] === 'string')
  );
}
