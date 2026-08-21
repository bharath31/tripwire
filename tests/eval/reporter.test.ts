import { describe, it, expect } from 'vitest';
import { renderEvalReport, evalExitCode } from '../../src/eval/reporter.js';
import type { EvalCaseResult } from '../../src/eval/types.js';

const passingCase: EvalCaseResult = {
  case: { name: 'passes', prompt: 'p' },
  rawOutput: 'x',
  assertionResults: [{ assertion: { type: 'contains', value: 'x' }, passed: true }],
  passed: true,
};

const failingCase: EvalCaseResult = {
  case: { name: 'fails', prompt: 'p' },
  rawOutput: 'x',
  assertionResults: [{ assertion: { type: 'contains', value: 'missing' }, passed: false }],
  passed: false,
};

describe('renderEvalReport', () => {
  it('shows a checkmark for a passing case and no failure detail', () => {
    const out = renderEvalReport('my-skill', [passingCase]);
    expect(out).toContain('✓ passes');
    expect(out).toContain('1/1 case passed');
  });

  it('shows the failed assertion detail for a failing case', () => {
    const out = renderEvalReport('my-skill', [failingCase]);
    expect(out).toContain('✗ fails');
    expect(out).toContain('expected output to contain "missing"');
  });

  it('shows not_contains assertion failures with the right wording', () => {
    const result: EvalCaseResult = {
      case: { name: 'no-code', prompt: 'p' },
      rawOutput: '```js\ncode\n```',
      assertionResults: [{ assertion: { type: 'not_contains', value: '```' }, passed: false }],
      passed: false,
    };
    const out = renderEvalReport('my-skill', [result]);
    expect(out).toContain('expected output NOT to contain "```"');
  });

  it('shows the rubric reasoning when the rubric judge fails', () => {
    const result: EvalCaseResult = {
      case: { name: 'polite', prompt: 'p', rubric: 'must be polite' },
      rawOutput: 'x',
      assertionResults: [],
      rubricResult: { passed: false, reasoning: 'too curt' },
      passed: false,
    };
    const out = renderEvalReport('my-skill', [result]);
    expect(out).toContain('rubric: too curt');
  });

  it('notes when a rubric was skipped', () => {
    const result: EvalCaseResult = {
      case: { name: 'polite', prompt: 'p', rubric: 'must be polite' },
      rawOutput: 'x',
      assertionResults: [],
      rubricSkipped: 'no ANTHROPIC_API_KEY',
      passed: true,
    };
    const out = renderEvalReport('my-skill', [result]);
    expect(out).toContain('rubric skipped (no ANTHROPIC_API_KEY)');
  });

  it('shows infrastructure failures separately from assertion failures', () => {
    const result: EvalCaseResult = {
      case: { name: 'agent run', prompt: 'p' },
      rawOutput: '',
      assertionResults: [],
      infrastructureError: 'agent timed out',
      passed: false,
    };
    const out = renderEvalReport('my-skill', [result]);
    expect(out).toContain('infrastructure: agent timed out');
  });

  it('summarizes pass count out of total across mixed results', () => {
    const out = renderEvalReport('my-skill', [passingCase, failingCase]);
    expect(out).toContain('1/2 cases passed');
  });
});

describe('evalExitCode', () => {
  it('returns 0 when every case passed', () => {
    expect(evalExitCode([passingCase])).toBe(0);
  });

  it('returns 1 when any case failed', () => {
    expect(evalExitCode([passingCase, failingCase])).toBe(1);
  });
});
