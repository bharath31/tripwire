import { describe, it, expect } from 'vitest';
import { renderComment, computeExitCode } from '../../src/action/report.js';
import { MARKER } from '../../src/action/comment.js';
import type { SkillReport } from '../../src/action/types.js';

const clean: SkillReport = {
  skillName: 'good', file: 'skills/good/SKILL.md',
  lint: { errors: [], warnings: [] },
};
const withError: SkillReport = {
  skillName: 'bad', file: 'skills/bad/SKILL.md',
  lint: { errors: [{ level: 'error', rule: 'name-present', message: 'name missing' }], warnings: [] },
};
const withWarning: SkillReport = {
  skillName: 'meh', file: 'skills/meh/SKILL.md',
  lint: { errors: [], warnings: [{ level: 'warning', rule: 'no-code-example', message: 'no code' }] },
};
const withRegression: SkillReport = {
  skillName: 'reg', file: 'skills/reg/SKILL.md',
  lint: { errors: [], warnings: [] },
  probe: { skillName: 'reg', results: [], regressions: [{ prompt: 'do x', zone: 'core', kind: 'gap' }] },
};

describe('renderComment', () => {
  it('includes the sticky marker', () => {
    expect(renderComment([clean])).toContain(MARKER);
  });

  it('shows a pass line when everything is clean', () => {
    expect(renderComment([clean])).toMatch(/passed|no issues/i);
  });

  it('lists errors with file and rule', () => {
    const out = renderComment([withError]);
    expect(out).toContain('skills/bad/SKILL.md');
    expect(out).toContain('name-present');
  });

  it('reports regressions in the probe section', () => {
    const out = renderComment([withRegression]);
    expect(out).toContain('do x');
    expect(out.toLowerCase()).toContain('gap');
  });

  it('notes skipped probes', () => {
    const out = renderComment([{ ...clean, probeSkipped: 'no scenarios file' }]);
    expect(out).toContain('no scenarios file');
  });
});

describe('computeExitCode', () => {
  it('returns 0 when all clean', () => {
    expect(computeExitCode([clean], false)).toBe(0);
  });

  it('returns 1 on a lint error', () => {
    expect(computeExitCode([withError], false)).toBe(1);
  });

  it('returns 0 on warnings when failOnWarning is false', () => {
    expect(computeExitCode([withWarning], false)).toBe(0);
  });

  it('returns 1 on warnings when failOnWarning is true', () => {
    expect(computeExitCode([withWarning], true)).toBe(1);
  });

  it('returns 1 on a coverage regression', () => {
    expect(computeExitCode([withRegression], false)).toBe(1);
  });
});
