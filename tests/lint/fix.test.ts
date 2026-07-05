import { describe, it, expect } from 'vitest';
import { toKebabCase, fixSkill } from '../../src/lint/fix.js';

describe('toKebabCase', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('MyHelper')).toBe('my-helper');
  });

  it('converts spaces and punctuation to hyphens', () => {
    expect(toKebabCase('My Cool Skill!!!')).toBe('my-cool-skill');
  });

  it('collapses multiple separators into a single hyphen', () => {
    expect(toKebabCase('my___cool   skill')).toBe('my-cool-skill');
  });

  it('strips leading and trailing hyphens', () => {
    expect(toKebabCase('-my-skill-')).toBe('my-skill');
  });

  it('leaves an already-valid kebab-case name unchanged', () => {
    expect(toKebabCase('my-skill')).toBe('my-skill');
  });

  it('returns an empty string for input with no alphanumeric characters', () => {
    expect(toKebabCase('!!!')).toBe('');
  });
});

describe('fixSkill', () => {
  it('fixes a non-kebab-case name and reports the change', () => {
    const raw = '---\nname: MyHelper\ndescription: Use when testing things\n---\n\nBody content here that is reasonably long, with a `code` example included so other rules stay quiet and only the name rule fires for this fixture on its own merits repeatedly.\n';
    const result = fixSkill(raw);

    expect(result.changed).toBe(true);
    expect(result.changes).toEqual([{ rule: 'name-kebab-case', message: '`name`: "MyHelper" → "my-helper"' }]);
    expect(result.fixed).toContain('name: my-helper');
  });

  it('preserves other frontmatter fields and the body untouched', () => {
    const raw = '---\nname: MyHelper\ndescription: Use when testing things\ncustom: value\n---\n\nBody text.\n';
    const result = fixSkill(raw);

    expect(result.fixed).toContain('custom: value');
    expect(result.fixed).toContain('Body text.');
  });

  it('makes no change when the name is already kebab-case', () => {
    const raw = '---\nname: my-helper\ndescription: Use when testing things\n---\n\nBody text with a `code` example and enough words to clear the length floor for this particular lint rule check in the fixture content used here.\n';
    const result = fixSkill(raw);

    expect(result.changed).toBe(false);
    expect(result.fixed).toBe(raw);
  });

  it('does not crash when name is missing entirely', () => {
    const raw = '---\ndescription: Use when testing things\n---\n\nBody text.\n';
    const result = fixSkill(raw);
    expect(result.changed).toBe(false);
  });
});
