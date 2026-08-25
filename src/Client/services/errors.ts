import { PdfLoadError, type PdfLoadFailureReason } from '../pdf/types';
import type { UserFacingError } from '../state/types';

/**
 * The closed set of error codes from the server's error envelope
 * (docs/02-architecture.md#error-envelope), plus two the client raises itself when it never got
 * a usable envelope at all.
 */
export type ApiErrorCode =
  | 'FOLDER_NOT_FOUND'
  | 'PDF_NOT_FOUND'
  | 'PDF_INVALID'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL'
  | 'NETWORK'
  | 'MALFORMED_RESPONSE';

export interface ApiErrorOptions {
  readonly correlationId?: string | null;
  readonly status?: number;
  readonly cause?: unknown;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly correlationId: string | null;
  readonly status: number | null;

  constructor(code: ApiErrorCode, options: ApiErrorOptions = {}) {
    // The message is diagnostic only. What the user sees comes from describeError().
    super(`API error: ${code}`, { cause: options.cause });
    this.name = 'ApiError';
    this.code = code;
    this.correlationId = options.correlationId ?? null;
    this.status = options.status ?? null;
  }
}

/**
 * The one mapping layer (rule 14). Every user-visible failure message in the client is produced
 * here, from a typed code — never from an exception message, a status code, or a provider
 * detail, so no stack trace, path, or connection string can reach the pane (NFR-ERR-06).
 *
 * `retryable` is what decides whether a Retry affordance is offered (NFR-ERR-04); it comes from
 * the envelope's code, never from string-matching (FR-PDF-11).
 */
const PRESENTATION: Record<ApiErrorCode, { readonly message: string; readonly retryable: boolean }> = {
  FOLDER_NOT_FOUND: { message: 'That folder is no longer available.', retryable: false },
  PDF_NOT_FOUND: { message: 'This file is no longer available.', retryable: false },
  PDF_INVALID: { message: "This file isn't a readable PDF.", retryable: false },
  UNAUTHORIZED: { message: 'Sign in to Office again to view this item.', retryable: false },
  FORBIDDEN: { message: "You don't have access to this item.", retryable: false },
  UPSTREAM_UNAVAILABLE: {
    message: 'The document service is temporarily unavailable.',
    retryable: true,
  },
  INTERNAL: { message: 'Something went wrong opening this item.', retryable: true },
  NETWORK: { message: "Can't reach the document service. Check your connection.", retryable: true },
  MALFORMED_RESPONSE: {
    message: 'The document service returned an unexpected response.',
    retryable: true,
  },
};

const API_ERROR_CODES = new Set<string>(Object.keys(PRESENTATION));

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODES.has(value);
}

/** Fallback when a failure arrives without an envelope — a proxy error or the HTML fallback. */
export function codeForStatus(status: number, notFound: ApiErrorCode): ApiErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return notFound;
    case 415:
      return 'PDF_INVALID';
    default:
      return status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'INTERNAL';
  }
}

/**
 * PDF bytes are fetched by pdf.js, not by http.ts, so a viewer failure arrives as a
 * PdfLoadError. It maps onto the same codes so there is exactly one table of user-facing
 * messages (NFR-CODE-05).
 */
const PDF_REASON_CODES: Record<PdfLoadFailureReason, ApiErrorCode> = {
  'not-found': 'PDF_NOT_FOUND',
  invalid: 'PDF_INVALID',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  unavailable: 'UPSTREAM_UNAVAILABLE',
  network: 'NETWORK',
  unknown: 'INTERNAL',
};

export function describeError(error: unknown): UserFacingError {
  if (error instanceof ApiError) return present(error.code, error.correlationId);
  if (error instanceof PdfLoadError) return present(PDF_REASON_CODES[error.reason], null);
  return present('INTERNAL', null);
}

function present(code: ApiErrorCode, correlationId: string | null): UserFacingError {
  const { message, retryable } = PRESENTATION[code];
  return { message, retryable, correlationId };
}

/** An aborted request is an expected outcome of a newer selection, not a failure to report. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
