import { describe, it, expect } from 'vitest';
import type { ProbeResult, LintResult, ProbeZone } from '../../src/types.js';
import { buildCoverageReport, renderCoverageReport } from '../../src/analyze/coverage-report.js';

const noLint: LintResult = { errors: [], warnings: [] };

function r(zone: ProbeZone, activated: boolean, prompt = `${zone} prompt`): ProbeResult {
  return {
    prompt: { zone, prompt },
    transcript: { activated, skillName: activated ? 'brainstorming' : undefined, rawOutput: '' },
    judge: activated ? { score: 8, violations: [] } : undefined,
  };
}

describe('buildCoverageReport', () => {
  it('counts activated per zone', () => {
    const report = buildCoverageReport('brainstorming', noLint, [
      r('core', true), r('core', true), r('core', false),
      r('adjacent', false),
      r('negative', true),
      r('variants', true),
    ]);
    expect(report.zones.core).toEqual({ activated: 2, total: 3 });
    expect(report.zones.adjacent).toEqual({ activated: 0, total: 1 });
    expect(report.zones.negative).toEqual({ activated: 1, total: 1 });
    expect(report.zones.variants).toEqual({ activated: 1, total: 1 });
  });

  it('gaps are non-negative misses', () => {
    const report = buildCoverageReport('brainstorming', noLint, [
      r('core', false, 'missed core'),
      r('negative', false),
    ]);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].prompt.prompt).toBe('missed core');
  });

  it('false positives are negative zone activations', () => {
    const report = buildCoverageReport('brainstorming', noLint, [
      r('negative', true, 'refactor this'),
      r('core', true),
    ]);
    expect(report.falsePositives).toHaveLength(1);
    expect(report.falsePositives[0].prompt.prompt).toBe('refactor this');
  });

  it('quality score is average of activated session judge scores', () => {
    const results: ProbeResult[] = [
      { ...r('core', true), judge: { score: 8, violations: [] } },
      { ...r('core', true), judge: { score: 6, violations: [] } },
      r('negative', false),
    ];
    const report = buildCoverageReport('brainstorming', noLint, results);
    expect(report.qualityScore).toBe(7);
  });

  it('quality score is 0 when nothing activated', () => {
    const report = buildCoverageReport('brainstorming', noLint, [r('core', false)]);
    expect(report.qualityScore).toBe(0);
  });

  it('generates suggestions for variant gaps', () => {
    const report = buildCoverageReport('brainstorming', noLint, [r('variants', false, 'some variant')]);
    expect(report.suggestions.some(s => s.toLowerCase().includes('synonym'))).toBe(true);
  });

  it('generates suggestions for false positives', () => {
    const report = buildCoverageReport('brainstorming', noLint, [r('negative', true)]);
    expect(report.suggestions.some(s => s.toLowerCase().includes('prohibition'))).toBe(true);
  });
});

describe('renderCoverageReport', () => {
  it('includes skill name and "Coverage Report" header', () => {
    const report = buildCoverageReport('brainstorming', noLint, [r('core', true), r('negative', false)]);
    const out = renderCoverageReport(report);
    expect(out).toContain('Coverage Report');
    expect(out).toContain('brainstorming');
  });

  it('shows zone percentages', () => {
    const report = buildCoverageReport('brainstorming', noLint, [
      r('core', true), r('core', false),
    ]);
    const out = renderCoverageReport(report);
    expect(out).toContain('50%');
  });

  it('shows GAPS section for misses', () => {
    const report = buildCoverageReport('brainstorming', noLint, [r('core', false, 'missed prompt')]);
    const out = renderCoverageReport(report);
    expect(out).toContain('GAPS');
    expect(out).toContain('missed prompt');
  });

  it('shows FALSE POSITIVE section when present', () => {
    const report = buildCoverageReport('brainstorming', noLint, [r('negative', true, 'refactor')]);
    const out = renderCoverageReport(report);
    expect(out).toContain('FALSE POSITIVE');
    expect(out).toContain('refactor');
  });

  it('omits GAPS section when no gaps', () => {
    const report = buildCoverageReport('brainstorming', noLint, [r('core', true)]);
    const out = renderCoverageReport(report);
    expect(out).not.toContain('GAPS');
  });
});
