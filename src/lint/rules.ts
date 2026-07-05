import type { ParsedSkill, LintResult } from '../types.js';
import type { Rule } from './rule-types.js';
import { builtInRules } from './built-in-rules.js';
import { runRules, type RuleConfig } from './registry.js';

export { builtInRules } from './built-in-rules.js';
export type { Rule } from './rule-types.js';
export type { RuleConfig, RuleLevel } from './registry.js';

/**
 * Runs the built-in rule set (plus any `extraRules`) against a skill, with
 * optional per-rule level overrides — e.g. `{ 'description-use-when': 'off' }`.
 * Called with no config, this behaves exactly as the original monolithic
 * `lint()` always did: every built-in rule, at its default level.
 */
export function lint(skill: ParsedSkill, ruleConfig?: RuleConfig, extraRules: Rule[] = []): LintResult {
  return runRules(skill, [...builtInRules, ...extraRules], ruleConfig);
}
