import { describe, expect, it } from 'vitest';
import { lintSource } from '../src/engine';
import { BAD_SKILL, GOOD_SKILL } from '@/lib/examples';

describe('browser lint engine', () => {
  it('uses the production rules for a clean skill', () => {
    expect(lintSource(GOOD_SKILL)).toEqual({ errors: [], warnings: [] });
  });

  it('prioritizes structural errors for a broken skill', () => {
    const result = lintSource(BAD_SKILL);
    expect(result.errors.map(issue => issue.rule)).toContain('name-kebab-case');
    expect(result.errors.map(issue => issue.rule)).toContain('description-no-workflow');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('surfaces malformed YAML instead of silently accepting it', () => {
    expect(() => lintSource('---\nname: [broken\n---\nbody')).toThrow();
  });
});
