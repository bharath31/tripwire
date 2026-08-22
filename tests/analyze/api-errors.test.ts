import { describe, it, expect } from 'vitest';
import { APIError } from '@anthropic-ai/sdk';
import { describeApiError } from '../../src/analyze/api-errors.js';

function apiError(status: number | undefined): APIError {
  return new APIError(status ?? 0, { type: 'error', error: { type: 'api_error', message: 'boom' } }, 'boom', new Headers());
}

describe('describeApiError', () => {
  it.each([
    [401, /rejected your API key \(401\).*ANTHROPIC_API_KEY/s],
    [403, /denied this request \(403\)/],
    [404, /404.*model/s],
    [429, /rate limit hit \(429\).*probe_count/s],
    [500, /server error \(500\).*transient/s],
    [529, /server error \(529\).*transient/s],
  ] as const)('maps status %i to an actionable message', (status, re) => {
    expect(describeApiError(apiError(status))).toMatch(re);
  });

  it('falls back to the error message for unmapped statuses', () => {
    const err = apiError(422);
    expect(describeApiError(err)).toBe(err.message);
  });

  it('passes through plain Errors untouched', () => {
    expect(describeApiError(new Error('spawn failed'))).toBe('spawn failed');
  });

  it('stringifies non-Errors', () => {
    expect(describeApiError('weird')).toBe('weird');
  });
});
