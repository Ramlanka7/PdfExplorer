import { ApiError, codeForStatus, isAbortError, isApiErrorCode, type ApiErrorCode } from './errors';

const API_BASE = '/api';

/**
 * Builds an API URL from path segments, encoding each one (NFR-SEC-03). Item ids are opaque
 * provider tokens (FR-DATA-07) and may contain anything, so they are never concatenated raw.
 */
export function apiUrl(...segments: readonly string[]): string {
  return `${API_BASE}/${segments.map(encodeURIComponent).join('/')}`;
}

export interface GetJsonOptions {
  readonly signal?: AbortSignal;
  /** Which code a bare 404 means here — the server sends an envelope, proxies do not. */
  readonly notFoundCode: ApiErrorCode;
}

/**
 * The client's only call into fetch(). Same-origin by construction (D3), so no CORS mode and no
 * cross-site cookies (risk R2).
 */
export async function getJson(url: string, options: GetJsonOptions): Promise<unknown> {
  let response: Response;
  try {
    const init: RequestInit = {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    };
    if (options.signal !== undefined) init.signal = options.signal;
    response = await fetch(url, init);
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    throw new ApiError('NETWORK', { cause });
  }

  if (!response.ok) throw await errorFromResponse(response, options.notFoundCode);

  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new ApiError('MALFORMED_RESPONSE', { status: response.status, cause });
  }
}

export interface PostOptions {
  readonly signal?: AbortSignal;
  readonly notFoundCode: ApiErrorCode;
}

/**
 * POST with no request body, for an action whose only outcomes are "did something" (200) or "the
 * user backed out, nothing changed" (204 - not a failure, so it never throws for it; NFR-ERR-04).
 */
export async function postForSelection(url: string, options: PostOptions): Promise<boolean> {
  let response: Response;
  try {
    const init: RequestInit = {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    };
    if (options.signal !== undefined) init.signal = options.signal;
    response = await fetch(url, init);
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    throw new ApiError('NETWORK', { cause });
  }

  if (response.status === 204) return false;
  if (!response.ok) throw await errorFromResponse(response, options.notFoundCode);
  return true;
}

/**
 * DELETE with no request body and no response payload — for an action that either happened (2xx)
 * or failed outright; unlike postForSelection there is no "user backed out" outcome to distinguish.
 */
export async function deleteResource(url: string, options: PostOptions): Promise<void> {
  let response: Response;
  try {
    const init: RequestInit = {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    };
    if (options.signal !== undefined) init.signal = options.signal;
    response = await fetch(url, init);
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    throw new ApiError('NETWORK', { cause });
  }

  if (!response.ok) throw await errorFromResponse(response, options.notFoundCode);
}

async function errorFromResponse(response: Response, notFound: ApiErrorCode): Promise<ApiError> {
  const envelope = await readEnvelope(response);
  const code = isApiErrorCode(envelope?.code) ? envelope.code : codeForStatus(response.status, notFound);
  return new ApiError(code, {
    status: response.status,
    correlationId: typeof envelope?.correlationId === 'string' ? envelope.correlationId : null,
  });
}

interface EnvelopeBody {
  readonly code?: unknown;
  readonly correlationId?: unknown;
}

/** An unmatched /api route may still return HTML from the task-pane fallback; tolerate that. */
async function readEnvelope(response: Response): Promise<EnvelopeBody | null> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) return null;
    const error = (body as { error?: unknown }).error;
    if (typeof error !== 'object' || error === null) return null;
    return error as EnvelopeBody;
  } catch {
    return null;
  }
}
