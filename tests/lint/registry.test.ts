import { describe, it, expect } from 'vitest';
import { runRules } from '../../src/lint/registry.js';
import type { Rule } from '../../src/lint/rule-types.js';
import type { ParsedSkill } from '../../src/types.js';

const skill: ParsedSkill = { frontmatter: { name: 'x' }, body: '', filePath: 'x' };

const alwaysFiresError: Rule = { id: 'always-error', defaultLevel: 'error', check: () => 'fired' };
const alwaysFiresWarning: Rule = { id: 'always-warning', defaultLevel: 'warning', check: () => 'fired' };
const neverFires: Rule = { id: 'never', defaultLevel: 'error', check: () => null };

describe('runRules', () => {
  it('runs a rule at its default level with no overrides', () => {
    const result = runRules(skill, [alwaysFiresError]);
    expect(result.errors).toEqual([{ level: 'error', rule: 'always-error', message: 'fired' }]);
  });

  it('omits a rule entirely when its check returns null', () => {
    const result = runRules(skill, [neverFires]);
    expect(result.errors).toEqual([]);
  });

  it('disables a rule when overridden to "off"', () => {
    const result = runRules(skill, [alwaysFiresError], { 'always-error': 'off' });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('downgrades an error-level rule to a warning via override', () => {
    const result = runRules(skill, [alwaysFiresError], { 'always-error': 'warning' });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([{ level: 'warning', rule: 'always-error', message: 'fired' }]);
  });

  it('upgrades a warning-level rule to an error via override', () => {
    const result = runRules(skill, [alwaysFiresWarning], { 'always-warning': 'error' });
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([{ level: 'error', rule: 'always-warning', message: 'fired' }]);
  });

  it('runs custom rules alongside built-ins and buckets them the same way', () => {
    const custom: Rule = { id: 'custom-rule', defaultLevel: 'warning', check: () => 'custom message' };
    const result = runRules(skill, [alwaysFiresError, custom]);
    expect(result.errors).toEqual([{ level: 'error', rule: 'always-error', message: 'fired' }]);
    expect(result.warnings).toEqual([{ level: 'warning', rule: 'custom-rule', message: 'custom message' }]);
  });

  it('preserves rule array order in the output', () => {
    const a: Rule = { id: 'a', defaultLevel: 'error', check: () => 'a fired' };
    const b: Rule = { id: 'b', defaultLevel: 'error', check: () => 'b fired' };
    const result = runRules(skill, [b, a]);
    expect(result.errors.map((e) => e.rule)).toEqual(['b', 'a']);
  });

  it('ignores overrides for rules that are not in the active rule set', () => {
    const result = runRules(skill, [alwaysFiresError], { 'some-other-rule': 'off' });
    expect(result.errors).toHaveLength(1);
  });
});
