import { describe, expect, it } from 'vitest';
import { decodeShareState, encodeShareState, MAX_SHARE_BYTES, readShareState } from '@/lib/share';

describe('share state', () => {
  it('round trips Unicode content', () => {
    const raw = 'description: Use when reviewing café APIs 🪤';
    expect(decodeShareState(encodeShareState(raw))).toBe(raw);
  });

  it('returns a recoverable result for a corrupt hash', () => {
    expect(readShareState('#s=%%%')).toEqual({ kind: 'invalid', reason: 'corrupt' });
  });

  it('refuses oversized content before creating a hash', () => {
    expect(() => encodeShareState('x'.repeat(MAX_SHARE_BYTES + 1))).toThrow('share-too-large');
  });
});
