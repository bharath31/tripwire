import { describe, it, expect, vi } from 'vitest';
import { formatAnnotation, emitAnnotations } from '../../src/action/annotate.js';
import type { LintError, LintResult } from '../../src/types.js';

describe('formatAnnotation', () => {
  it('formats an error workflow command', () => {
    const f: LintError = { level: 'error', rule: 'name-present', message: 'name is missing' };
    expect(formatAnnotation('skills/a/SKILL.md', 2, f)).toBe(
      '::error file=skills/a/SKILL.md,line=2,title=tripwire/name-present::name is missing',
    );
  });

  it('formats a warning workflow command', () => {
    const f: LintError = { level: 'warning', rule: 'body-too-short', message: 'too short' };
    expect(formatAnnotation('SKILL.md', 6, f)).toBe(
      '::warning file=SKILL.md,line=6,title=tripwire/body-too-short::too short',
    );
  });

  it('escapes newlines in the message', () => {
    const f: LintError = { level: 'error', rule: 'r', message: 'line1\nline2' };
    expect(formatAnnotation('f', 1, f)).toContain('line1%0Aline2');
  });
});

describe('emitAnnotations', () => {
  it('emits one line per finding via the injected logger', () => {
    const raw = '---\nname: x\ndescription: This is wrong\n---\n\nbody';
    const result: LintResult = {
      errors: [{ level: 'error', rule: 'description-use-when', message: 'must start with Use when' }],
      warnings: [{ level: 'warning', rule: 'no-code-example', message: 'no code' }],
    };
    const lines: string[] = [];
    emitAnnotations('SKILL.md', raw, result, (s) => lines.push(s));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('::error');
    expect(lines[0]).toContain('description-use-when');
    expect(lines[1]).toContain('::warning');
  });
});
