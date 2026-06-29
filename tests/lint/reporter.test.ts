import { describe, it, expect } from 'vitest';
import { formatLintResult, lintExitCode } from '../../src/lint/reporter.js';
import type { LintResult } from '../../src/types.js';

describe('formatLintResult', () => {
  it('shows success when no issues', () => {
    const output = formatLintResult('my-skill', { errors: [], warnings: [] });
    expect(output).toContain('✓');
    expect(output).toContain('no issues');
  });

  it('shows error rule name and message', () => {
    const result: LintResult = {
      errors: [{ level: 'error', rule: 'name-present', message: 'name is missing' }],
      warnings: [],
    };
    const output = formatLintResult('my-skill', result);
    expect(output).toContain('name-present');
    expect(output).toContain('name is missing');
  });

  it('shows warning rule name and message', () => {
    const result: LintResult = {
      errors: [],
      warnings: [{ level: 'warning', rule: 'body-too-short', message: 'body is 5 words' }],
    };
    const output = formatLintResult('my-skill', result);
    expect(output).toContain('body-too-short');
    expect(output).toContain('body is 5 words');
  });

  it('shows error count in summary', () => {
    const result: LintResult = {
      errors: [
        { level: 'error', rule: 'name-present', message: 'x' },
        { level: 'error', rule: 'description-present', message: 'y' },
      ],
      warnings: [],
    };
    const output = formatLintResult('my-skill', result);
    expect(output).toContain('2 errors');
  });

  it('shows singular "error" for one error', () => {
    const result: LintResult = {
      errors: [{ level: 'error', rule: 'name-present', message: 'x' }],
      warnings: [],
    };
    const output = formatLintResult('my-skill', result);
    expect(output).toContain('1 error');
    expect(output).not.toContain('1 errors');
  });
});

describe('lintExitCode', () => {
  it('returns 0 when no errors', () => {
    expect(lintExitCode({ errors: [], warnings: [] })).toBe(0);
  });

  it('returns 0 when only warnings', () => {
    expect(lintExitCode({
      errors: [],
      warnings: [{ level: 'warning', rule: 'x', message: 'y' }],
    })).toBe(0);
  });

  it('returns 1 when errors present', () => {
    expect(lintExitCode({
      errors: [{ level: 'error', rule: 'x', message: 'y' }],
      warnings: [],
    })).toBe(1);
  });
});
