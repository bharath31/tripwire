import { describe, it, expect } from 'vitest';
import {
  toSkillRef,
  findNameCollisions,
  findDescriptionOverlaps,
  detectConflicts,
  type SkillRef,
} from '../../src/lint/conflicts.js';
import type { ParsedSkill } from '../../src/types.js';

const ref = (name: string, description: string, filePath = `${name}/SKILL.md`): SkillRef => ({ name, description, filePath });

describe('toSkillRef', () => {
  it('builds a ref from a skill with name and description', () => {
    const skill: ParsedSkill = { frontmatter: { name: 'x', description: 'Use when doing x' }, body: '', filePath: 'x/SKILL.md' };
    expect(toSkillRef(skill)).toEqual({ name: 'x', description: 'Use when doing x', filePath: 'x/SKILL.md' });
  });

  it('returns null when name or description is missing', () => {
    expect(toSkillRef({ frontmatter: { description: 'Use when x' }, body: '', filePath: 'a' })).toBeNull();
    expect(toSkillRef({ frontmatter: { name: 'x' }, body: '', filePath: 'a' })).toBeNull();
  });
});

describe('findNameCollisions', () => {
  it('flags two skills sharing the same name', () => {
    const refs = [ref('brainstorming', 'Use when ideating', 'a/SKILL.md'), ref('brainstorming', 'Use when brainstorming', 'b/SKILL.md')];
    const collisions = findNameCollisions(refs);
    expect(collisions).toEqual([{ name: 'brainstorming', files: ['a/SKILL.md', 'b/SKILL.md'] }]);
  });

  it('reports no collisions when all names are unique', () => {
    const refs = [ref('a', 'Use when a'), ref('b', 'Use when b')];
    expect(findNameCollisions(refs)).toEqual([]);
  });
});

describe('findDescriptionOverlaps', () => {
  it('flags two skills whose descriptions share significant trigger words', () => {
    const refs = [
      ref('pdf-export', 'Use when exporting a report to pdf format for sharing'),
      ref('pdf-generator', 'Use when generating a pdf report from structured data'),
    ];
    const overlaps = findDescriptionOverlaps(refs, 0.2);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].sharedTriggerWords).toEqual(expect.arrayContaining(['pdf', 'report']));
  });

  it('does not flag unrelated skills', () => {
    const refs = [
      ref('database-migrations', 'Use when writing or reviewing SQL schema migrations'),
      ref('social-media-copy', 'Use when drafting a tweet or LinkedIn post'),
    ];
    expect(findDescriptionOverlaps(refs)).toEqual([]);
  });

  it('ignores stopwords when computing overlap so generic phrasing does not false-positive', () => {
    const refs = [
      ref('a', 'Use when you want to do the thing for your project'),
      ref('b', 'Use when you want to do the other thing for your codebase'),
    ];
    // "use when you want to do the thing for your" is almost entirely stopwords —
    // the only content words are project/thing vs other/thing/codebase, well
    // below a real trigger-overlap threshold.
    expect(findDescriptionOverlaps(refs, 0.3)).toEqual([]);
  });

  it('respects a custom threshold', () => {
    const refs = [
      ref('a', 'Use when handling customer refunds and payment disputes'),
      ref('b', 'Use when handling customer refunds and chargeback disputes'),
    ];
    const strict = findDescriptionOverlaps(refs, 0.9);
    const loose = findDescriptionOverlaps(refs, 0.3);
    expect(strict).toEqual([]);
    expect(loose.length).toBe(1);
  });

  it('sorts overlaps by descending similarity score', () => {
    const refs = [
      ref('a', 'Use when exporting reports to pdf'),
      ref('b', 'Use when exporting reports to pdf for archival'),
      ref('c', 'Use when exporting reports to csv'),
    ];
    const overlaps = findDescriptionOverlaps(refs, 0.1);
    for (let i = 1; i < overlaps.length; i++) {
      expect(overlaps[i - 1].score).toBeGreaterThanOrEqual(overlaps[i].score);
    }
  });
});

describe('detectConflicts', () => {
  it('combines name collisions and description overlaps, skipping skills missing name/description', () => {
    const skills: ParsedSkill[] = [
      { frontmatter: { name: 'pdf-export', description: 'Use when exporting a report to pdf' }, body: '', filePath: 'a/SKILL.md' },
      { frontmatter: { name: 'pdf-export', description: 'Use when generating pdf reports' }, body: '', filePath: 'b/SKILL.md' },
      { frontmatter: {}, body: '', filePath: 'broken/SKILL.md' },
    ];
    const report = detectConflicts(skills, 0.2);
    expect(report.nameCollisions).toHaveLength(1);
    expect(report.descriptionOverlaps).toHaveLength(1);
  });

  it('returns empty arrays for a clean, non-overlapping set', () => {
    const skills: ParsedSkill[] = [
      { frontmatter: { name: 'a', description: 'Use when writing SQL migrations' }, body: '', filePath: 'a/SKILL.md' },
      { frontmatter: { name: 'b', description: 'Use when drafting a tweet' }, body: '', filePath: 'b/SKILL.md' },
    ];
    const report = detectConflicts(skills);
    expect(report.nameCollisions).toEqual([]);
    expect(report.descriptionOverlaps).toEqual([]);
  });
});
