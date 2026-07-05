import { describe, it, expect } from 'vitest';
import { checkAssertion, checkAssertions } from '../../src/eval/assertions.js';

describe('checkAssertion', () => {
  it('passes a "contains" assertion when the value is present', () => {
    const result = checkAssertion('the quick brown fox', { type: 'contains', value: 'brown' });
    expect(result.passed).toBe(true);
  });

  it('fails a "contains" assertion when the value is absent', () => {
    const result = checkAssertion('the quick brown fox', { type: 'contains', value: 'purple' });
    expect(result.passed).toBe(false);
  });

  it('passes a "not_contains" assertion when the value is absent', () => {
    const result = checkAssertion('the quick brown fox', { type: 'not_contains', value: 'purple' });
    expect(result.passed).toBe(true);
  });

  it('fails a "not_contains" assertion when the value is present', () => {
    const result = checkAssertion('the quick brown fox', { type: 'not_contains', value: 'brown' });
    expect(result.passed).toBe(false);
  });

  it('is case-sensitive and substring-based, not word-boundary based', () => {
    expect(checkAssertion('Foxglove', { type: 'contains', value: 'fox' }).passed).toBe(false);
    expect(checkAssertion('Foxglove', { type: 'contains', value: 'Fox' }).passed).toBe(true);
  });
});

describe('checkAssertions', () => {
  it('checks a list of assertions independently and preserves order', () => {
    const results = checkAssertions('hello world', [
      { type: 'contains', value: 'hello' },
      { type: 'not_contains', value: 'goodbye' },
      { type: 'contains', value: 'missing' },
    ]);
    expect(results.map((r) => r.passed)).toEqual([true, true, false]);
  });

  it('returns an empty array for no assertions', () => {
    expect(checkAssertions('anything', [])).toEqual([]);
  });
});
