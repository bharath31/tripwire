import { describe, it, expect } from 'vitest';
import { summarizeDrift, renderDriftSummary } from '../../src/test/drift.js';

describe('summarizeDrift', () => {
  it('reports no drift when every checked skill is clean', () => {
    const summary = summarizeDrift(
      [{ skillName: 'a', filePath: 'a/SKILL.md', gaps: 0, falsePositives: 0 }],
      [],
    );
    expect(summary.hasDrift).toBe(false);
  });

  it('reports drift when any skill has gaps', () => {
    const summary = summarizeDrift(
      [{ skillName: 'a', filePath: 'a/SKILL.md', gaps: 1, falsePositives: 0 }],
      [],
    );
    expect(summary.hasDrift).toBe(true);
  });

  it('reports drift when any skill has false positives', () => {
    const summary = summarizeDrift(
      [{ skillName: 'a', filePath: 'a/SKILL.md', gaps: 0, falsePositives: 2 }],
      [],
    );
    expect(summary.hasDrift).toBe(true);
  });

  it('fails the drift run on infrastructure errors', () => {
    const summary = summarizeDrift(
      [{
        skillName: 'a',
        filePath: 'a/SKILL.md',
        gaps: 0,
        falsePositives: 0,
        infrastructureErrors: 1,
      }],
      [],
    );
    expect(summary.hasDrift).toBe(true);
    expect(renderDriftSummary(summary)).toContain('1 infrastructure error');
  });

  it('fails the drift run on static lint errors', () => {
    const summary = summarizeDrift(
      [{
        skillName: 'a',
        filePath: 'a/SKILL.md',
        gaps: 0,
        falsePositives: 0,
        infrastructureErrors: 0,
        lintErrors: 2,
      }],
      [],
    );
    expect(summary.hasDrift).toBe(true);
    expect(renderDriftSummary(summary)).toContain('2 lint errors');
  });

  it('carries through skipped skills unchanged', () => {
    const skipped = [{ filePath: 'b/SKILL.md', reason: 'no scenarios' }];
    const summary = summarizeDrift([], skipped);
    expect(summary.skipped).toEqual(skipped);
    expect(summary.hasDrift).toBe(false);
  });
});

describe('renderDriftSummary', () => {
  it('renders a clean pass message when nothing drifted', () => {
    const out = renderDriftSummary(summarizeDrift(
      [{ skillName: 'a', filePath: 'a/SKILL.md', gaps: 0, falsePositives: 0 }],
      [],
    ));
    expect(out).toContain('✓ No drift');
    expect(out).toContain('all 1 skill(s)');
  });

  it('renders drifted skills with gap and false-positive counts', () => {
    const out = renderDriftSummary(summarizeDrift(
      [{ skillName: 'brainstorming', filePath: 'skills/brainstorming/SKILL.md', gaps: 2, falsePositives: 1 }],
      [],
    ));
    expect(out).toContain('✗ 1 skill(s) drifted');
    expect(out).toContain('brainstorming');
    expect(out).toContain('2 gaps');
    expect(out).toContain('1 false positive');
    expect(out).toContain('Re-run `tripwire analyze`');
  });

  it('lists skipped skills with no committed scenarios', () => {
    const out = renderDriftSummary(summarizeDrift(
      [],
      [{ filePath: 'skills/no-scenarios/SKILL.md', reason: 'no committed scenarios' }],
    ));
    expect(out).toContain('Skipped 1 skill(s)');
    expect(out).toContain('skills/no-scenarios/SKILL.md');
  });

  it('uses singular wording for a single gap and single false positive', () => {
    const out = renderDriftSummary(summarizeDrift(
      [{ skillName: 'a', filePath: 'a/SKILL.md', gaps: 1, falsePositives: 1 }],
      [],
    ));
    expect(out).toContain('1 gap,');
    expect(out).toContain('1 false positive');
    expect(out).not.toContain('1 gaps');
    expect(out).not.toContain('1 false positives');
  });
});
