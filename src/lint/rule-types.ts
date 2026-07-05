import type { ParsedSkill } from '../types.js';

export interface Rule {
  id: string;
  defaultLevel: 'error' | 'warning';
  /** Returns a message if the rule fires on this skill, or null if it's clean. */
  check(skill: ParsedSkill): string | null;
}
