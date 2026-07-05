import { describe, it, expect } from 'vitest';
import { formatConflictReport, conflictExitCode } from '../../src/lint/conflict-reporter.js';
import type { ConflictReport } from '../../src/lint/conflicts.js';

const clean: ConflictReport = { nameCollisions: [], descriptionOverlaps: [] };

describe('formatConflictReport', () => {
  it('shows a clean pass message when there are no conflicts', () => {
    const out = formatConflictReport(3, clean);
    expect(out).toContain('Scanned 3 skills');
    expect(out).toContain('✓');
    expect(out).toContain('no conflicts found');
  });

  it('renders name collisions', () => {
    const report: ConflictReport = {
      nameCollisions: [{ name: 'brainstorming', files: ['a/SKILL.md', 'b/SKILL.md'] }],
      descriptionOverlaps: [],
    };
    const out = formatConflictReport(2, report);
    expect(out).toContain('"brainstorming"');
    expect(out).toContain('a/SKILL.md, b/SKILL.md');
  });

  it('renders description overlaps with percentage and shared words', () => {
    const report: ConflictReport = {
      nameCollisions: [],
      descriptionOverlaps: [{
        a: { name: 'pdf-export', description: '', filePath: 'a/SKILL.md' },
        b: { name: 'pdf-generator', description: '', filePath: 'b/SKILL.md' },
        sharedTriggerWords: ['pdf', 'report'],
        score: 0.42,
      }],
    };
    const out = formatConflictReport(2, report);
    expect(out).toContain('"pdf-export" ↔ "pdf-generator"');
    expect(out).toContain('42%');
    expect(out).toContain('pdf, report');
  });
});

describe('conflictExitCode', () => {
  it('returns 0 for a clean report', () => {
    expect(conflictExitCode(clean)).toBe(0);
  });

  it('returns 1 when name collisions are present', () => {
    const report: ConflictReport = { nameCollisions: [{ name: 'x', files: ['a', 'b'] }], descriptionOverlaps: [] };
    expect(conflictExitCode(report)).toBe(1);
  });

  it('returns 0 when only description overlaps are present (advisory, not a hard failure)', () => {
    const report: ConflictReport = {
      nameCollisions: [],
      descriptionOverlaps: [{ a: { name: 'a', description: '', filePath: 'a' }, b: { name: 'b', description: '', filePath: 'b' }, sharedTriggerWords: ['x'], score: 0.5 }],
    };
    expect(conflictExitCode(report)).toBe(0);
  });
});
