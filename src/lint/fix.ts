import matter from 'gray-matter';
import { lint } from './rules.js';
import type { ParsedSkill } from '../types.js';

// Deliberately narrow: only `name-kebab-case` is safe to auto-fix without
// changing meaning. Every other rule (description wording, missing examples,
// placeholder text, body length) requires human or LLM judgment about intent
// — silently rewriting those would misrepresent what the skill actually says.
export function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}

export interface FixChange {
  rule: string;
  message: string;
}

export interface FixResult {
  fixed: string;
  changed: boolean;
  changes: FixChange[];
}

export function fixSkill(raw: string): FixResult {
  const parsed = matter(raw);
  const skill: ParsedSkill = {
    frontmatter: parsed.data as ParsedSkill['frontmatter'],
    body: parsed.content.trim(),
    filePath: '',
  };
  const result = lint(skill);
  const changes: FixChange[] = [];

  const hasKebabError = result.errors.some((e) => e.rule === 'name-kebab-case');
  if (hasKebabError && typeof parsed.data.name === 'string') {
    const before = parsed.data.name;
    const after = toKebabCase(before);
    if (after && after !== before) {
      parsed.data.name = after;
      changes.push({ rule: 'name-kebab-case', message: `\`name\`: "${before}" → "${after}"` });
    }
  }

  if (changes.length === 0) {
    return { fixed: raw, changed: false, changes: [] };
  }

  const fixed = matter.stringify(parsed.content, parsed.data);
  return { fixed, changed: true, changes };
}
