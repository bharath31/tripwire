import { describe, it, expect } from 'vitest';
import { lint } from '../../src/lint/rules.js';
import type { ParsedSkill } from '../../src/types.js';

function makeSkill(overrides: {
  name?: string | undefined;
  description?: string | undefined;
  body?: string;
}): ParsedSkill {
  const longEnoughBody = 'word '.repeat(25) + 'Run `npm test` to verify everything passes correctly.';
  return {
    frontmatter: {
      ...('name' in overrides
        ? (overrides.name !== undefined ? { name: overrides.name } : {})
        : { name: 'my-skill' }),
      ...('description' in overrides
        ? (overrides.description !== undefined ? { description: overrides.description } : {})
        : { description: 'Use when doing something specific' }),
    },
    body: overrides.body ?? longEnoughBody,
    filePath: '/fake/skill.md',
  };
}

describe('lint errors', () => {
  it('passes a valid skill with no errors', () => {
    expect(lint(makeSkill({})).errors).toHaveLength(0);
  });

  it('errors when name is missing', () => {
    const result = lint(makeSkill({ name: undefined }));
    expect(result.errors.some(e => e.rule === 'name-present')).toBe(true);
  });

  it('errors when name contains uppercase letters', () => {
    const result = lint(makeSkill({ name: 'MySkill' }));
    expect(result.errors.some(e => e.rule === 'name-kebab-case')).toBe(true);
  });

  it('errors when name contains spaces', () => {
    const result = lint(makeSkill({ name: 'my skill' }));
    expect(result.errors.some(e => e.rule === 'name-kebab-case')).toBe(true);
  });

  it('allows numbers and hyphens in name', () => {
    const result = lint(makeSkill({ name: 'my-skill-2' }));
    expect(result.errors.some(e => e.rule === 'name-kebab-case')).toBe(false);
  });

  it('errors when description is missing', () => {
    const result = lint(makeSkill({ description: undefined }));
    expect(result.errors.some(e => e.rule === 'description-present')).toBe(true);
  });

  it('errors when description does not start with "Use when"', () => {
    const result = lint(makeSkill({ description: 'This skill handles something.' }));
    expect(result.errors.some(e => e.rule === 'description-use-when')).toBe(true);
  });

  it('passes when description starts with "Use when"', () => {
    const result = lint(makeSkill({ description: 'Use when fixing bugs.' }));
    expect(result.errors.some(e => e.rule === 'description-use-when')).toBe(false);
  });

  it('errors when description exceeds 1024 characters', () => {
    const result = lint(makeSkill({ description: 'Use when ' + 'x'.repeat(1020) }));
    expect(result.errors.some(e => e.rule === 'description-length')).toBe(true);
  });

  it('passes when description is exactly 1024 characters', () => {
    const result = lint(makeSkill({ description: 'Use when ' + 'x'.repeat(1015) }));
    expect(result.errors.some(e => e.rule === 'description-length')).toBe(false);
  });

  it('errors on "step 1" in description', () => {
    const result = lint(makeSkill({ description: 'Use when step 1 is needed' }));
    expect(result.errors.some(e => e.rule === 'description-no-workflow')).toBe(true);
  });

  it('errors on "will then" in description', () => {
    const result = lint(makeSkill({ description: 'Use when X and will then do Y' }));
    expect(result.errors.some(e => e.rule === 'description-no-workflow')).toBe(true);
  });

  it('errors on "first do" in description', () => {
    const result = lint(makeSkill({ description: 'Use when first do X then Y' }));
    expect(result.errors.some(e => e.rule === 'description-no-workflow')).toBe(true);
  });

  it('errors on "then it will" in description', () => {
    const result = lint(makeSkill({ description: 'Use when then it will produce output' }));
    expect(result.errors.some(e => e.rule === 'description-no-workflow')).toBe(true);
  });
});

describe('lint warnings', () => {
  const longBody = 'word '.repeat(25) + '`cmd`';

  it('warns when body contains TBD', () => {
    const result = lint(makeSkill({ body: longBody + ' TBD' }));
    expect(result.warnings.some(w => w.rule === 'no-placeholders')).toBe(true);
  });

  it('warns when body contains TODO', () => {
    const result = lint(makeSkill({ body: longBody + ' TODO: fix this' }));
    expect(result.warnings.some(w => w.rule === 'no-placeholders')).toBe(true);
  });

  it('warns when body contains "implement later"', () => {
    const result = lint(makeSkill({ body: longBody + ' implement later' }));
    expect(result.warnings.some(w => w.rule === 'no-placeholders')).toBe(true);
  });

  it('warns when body contains "see task"', () => {
    const result = lint(makeSkill({ body: longBody + ' see task #123' }));
    expect(result.warnings.some(w => w.rule === 'no-placeholders')).toBe(true);
  });

  it('warns when body has 3+ consecutive // comment lines', () => {
    const body = longBody + '\n// line one\n// line two\n// line three';
    const result = lint(makeSkill({ body }));
    expect(result.warnings.some(w => w.rule === 'no-comment-blocks')).toBe(true);
  });

  it('does not warn for 2 consecutive comment lines', () => {
    const body = longBody + '\n// line one\n// line two\nNormal line';
    const result = lint(makeSkill({ body }));
    expect(result.warnings.some(w => w.rule === 'no-comment-blocks')).toBe(false);
  });

  it('warns when body is under 100 words', () => {
    const result = lint(makeSkill({ body: 'Short body. `cmd`' }));
    expect(result.warnings.some(w => w.rule === 'body-too-short')).toBe(true);
  });

  it('does not warn about length when body >= 100 words', () => {
    const result = lint(makeSkill({ body: 'word '.repeat(100) + '`cmd`' }));
    expect(result.warnings.some(w => w.rule === 'body-too-short')).toBe(false);
  });

  it('warns when no code example found (no backticks or fenced blocks)', () => {
    const body = 'word '.repeat(25);
    const result = lint(makeSkill({ body }));
    expect(result.warnings.some(w => w.rule === 'no-code-example')).toBe(true);
  });

  it('does not warn when inline backtick code present', () => {
    const result = lint(makeSkill({ body: 'word '.repeat(25) + '`npm run build`' }));
    expect(result.warnings.some(w => w.rule === 'no-code-example')).toBe(false);
  });

  it('does not warn when fenced code block present', () => {
    const result = lint(makeSkill({ body: 'word '.repeat(25) + '\n```bash\nnpm install\n```' }));
    expect(result.warnings.some(w => w.rule === 'no-code-example')).toBe(false);
  });
});
