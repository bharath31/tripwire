import type { ParsedSkill, LintError, LintResult } from '../types.js';
import type { Rule } from './rule-types.js';

export type RuleLevel = 'off' | 'warning' | 'error';
export type RuleConfig = Record<string, RuleLevel>;

export function runRules(skill: ParsedSkill, rules: Rule[], overrides: RuleConfig = {}): LintResult {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];

  for (const rule of rules) {
    const level = overrides[rule.id] ?? rule.defaultLevel;
    if (level === 'off') continue;

    const message = rule.check(skill);
    if (message === null) continue;

    const entry: LintError = { level, rule: rule.id, message };
    if (level === 'error') errors.push(entry);
    else warnings.push(entry);
  }

  return { errors, warnings };
}
