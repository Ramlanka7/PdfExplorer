import { describe, expect, it } from 'vitest';

import { PdfLoadError } from '../../src/Client/pdf/types';
import { ApiError, describeError, type ApiErrorCode } from '../../src/Client/services/errors';

/**
 * One mapping layer, driven by typed codes (rule 14). These tests pin the two properties the
 * rest of the UI depends on: the message is safe to show, and `retryable` decides whether a
 * Retry affordance appears at all (NFR-ERR-03, NFR-ERR-04, NFR-ERR-06).
 */
describe('describeError', () => {
  const cases: readonly [ApiErrorCode, string, boolean][] = [
    ['FOLDER_NOT_FOUND', 'That folder is no longer available.', false],
    ['PDF_NOT_FOUND', 'This file is no longer available.', false],
    ['PDF_INVALID', "This file isn't a readable PDF.", false],
    ['FORBIDDEN', "You don't have access to this item.", false],
    ['UPSTREAM_UNAVAILABLE', 'The document service is temporarily unavailable.', true],
    ['NETWORK', "Can't reach the document service. Check your connection.", true],
    ['INTERNAL', 'Something went wrong opening this item.', true],
  ];

  it.each(cases)('maps %s to a safe message', (code: ApiErrorCode, message: string, retryable: boolean) => {
    const described = describeError(new ApiError(code));

    expect(described.message).toBe(message);
    expect(described.retryable).toBe(retryable);
  });

  it('surfaces the sign-in requirement without exposing anything else (NFR-ERR-01)', () => {
    expect(describeError(new ApiError('UNAUTHORIZED')).message).toBe(
      'Sign in to Office again to view this item.',
    );
  });

  it('maps viewer failures through the same table as API failures (NFR-CODE-05)', () => {
    expect(describeError(new PdfLoadError('invalid')).message).toBe("This file isn't a readable PDF.");
    expect(describeError(new PdfLoadError('not-found')).retryable).toBe(false);
    expect(describeError(new PdfLoadError('unavailable')).retryable).toBe(true);
  });

  it('keeps the correlation id for logging but not in the message (NFR-ERR-05)', () => {
    const described = describeError(new ApiError('INTERNAL', { correlationId: '0HN7ABC' }));

    expect(described.correlationId).toBe('0HN7ABC');
    expect(described.message).not.toContain('0HN7ABC');
  });

  it('never repeats an unknown exception back to the user (NFR-ERR-06)', () => {
    const leaky = new Error('ECONNREFUSED /var/data/contracts/secret.pdf at Provider.open (line 9)');

    const described = describeError(leaky);

    expect(described.message).toBe('Something went wrong opening this item.');
    expect(described.message).not.toContain('/var/data');
  });
});
