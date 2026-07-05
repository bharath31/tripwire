import { describe, it, expect } from 'vitest';
import { resolvePreset } from '../../src/lint/presets.js';

describe('resolvePreset', () => {
  it('resolves the recommended preset to an empty override set (all built-ins, default levels)', () => {
    expect(resolvePreset('tripwire:recommended')).toEqual({});
  });

  it('throws a clear error for an unknown preset name', () => {
    expect(() => resolvePreset('tripwire:nonexistent')).toThrow('Unknown preset "tripwire:nonexistent"');
  });
});
