import { describe, it, expect } from 'vitest';
import {
  globToRegExp,
  filterByPatterns,
  parsePatterns,
  skillFilesForChanges,
} from '../../src/action/changed-files.js';

describe('globToRegExp', () => {
  it('matches ** across directory separators', () => {
    const re = globToRegExp('**/SKILL.md');
    expect(re.test('SKILL.md')).toBe(true);
    expect(re.test('skills/foo/SKILL.md')).toBe(true);
    expect(re.test('a/b/c/SKILL.md')).toBe(true);
  });

  it('does not match different filenames', () => {
    const re = globToRegExp('**/SKILL.md');
    expect(re.test('skills/foo/README.md')).toBe(false);
    expect(re.test('SKILL.mdx')).toBe(false);
  });

  it('matches single * within a path segment only', () => {
    const re = globToRegExp('skills/*/SKILL.md');
    expect(re.test('skills/foo/SKILL.md')).toBe(true);
    expect(re.test('skills/foo/bar/SKILL.md')).toBe(false);
  });

  it('escapes regex metacharacters in literals', () => {
    const re = globToRegExp('a.b/SKILL.md');
    expect(re.test('a.b/SKILL.md')).toBe(true);
    expect(re.test('axb/SKILL.md')).toBe(false);
  });

  it('does NOT match a bare filename that shares a suffix with the pattern (path boundary)', () => {
    const re = globToRegExp('**/SKILL.md');
    // 'mySKILL.md' must NOT match — it is not a directory-separated SKILL.md
    expect(re.test('mySKILL.md')).toBe(false);
    // sanity: still matches legitimate paths
    expect(re.test('SKILL.md')).toBe(true);
    expect(re.test('a/b/SKILL.md')).toBe(true);
  });
});

describe('parsePatterns', () => {
  it('splits on commas and newlines and trims', () => {
    expect(parsePatterns('**/SKILL.md, skills/*.md\n docs/**/*.md ')).toEqual([
      '**/SKILL.md', 'skills/*.md', 'docs/**/*.md',
    ]);
  });

  it('drops empty entries', () => {
    expect(parsePatterns('**/SKILL.md,,\n')).toEqual(['**/SKILL.md']);
  });
});

describe('filterByPatterns', () => {
  it('keeps files matching any pattern', () => {
    const files = ['skills/a/SKILL.md', 'src/index.ts', 'docs/x.md'];
    expect(filterByPatterns(files, ['**/SKILL.md'])).toEqual(['skills/a/SKILL.md']);
  });

  it('matches across multiple patterns and dedupes', () => {
    const files = ['skills/a/SKILL.md', 'docs/x.md'];
    expect(filterByPatterns(files, ['**/SKILL.md', 'docs/**/*.md'])).toEqual([
      'skills/a/SKILL.md', 'docs/x.md',
    ]);
  });

  it('returns empty when nothing matches', () => {
    expect(filterByPatterns(['src/index.ts'], ['**/SKILL.md'])).toEqual([]);
  });
});

describe('skillFilesForChanges', () => {
  const exists = (path: string) => path === 'skills/a/SKILL.md';

  it('runs the sibling skill when only its behavioral contract changes', () => {
    expect(skillFilesForChanges(
      ['skills/a/tripwire-scenarios.yaml'],
      ['**/SKILL.md'],
      exists,
    )).toEqual(['skills/a/SKILL.md']);
  });

  it('deduplicates a skill when both the skill and scenarios change', () => {
    expect(skillFilesForChanges(
      ['skills/a/SKILL.md', 'skills/a/tripwire-scenarios.yaml'],
      ['**/SKILL.md'],
      exists,
    )).toEqual(['skills/a/SKILL.md']);
  });

  it('ignores an orphan scenario file with no sibling skill', () => {
    expect(skillFilesForChanges(
      ['skills/missing/tripwire-scenarios.yaml'],
      ['**/SKILL.md'],
      exists,
    )).toEqual([]);
  });
});
