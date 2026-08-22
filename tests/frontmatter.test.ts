import { describe, it, expect } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses a fenced block and keeps the body', () => {
    const parsed = parseFrontmatter('---\nname: x\ndescription: y\n---\n\nBody here.\n');
    expect(parsed.data).toEqual({ name: 'x', description: 'y' });
    expect(parsed.content).toBe('\nBody here.\n');
  });

  it('treats missing frontmatter as empty data with the input as content', () => {
    const parsed = parseFrontmatter('no frontmatter at all');
    expect(parsed.data).toEqual({});
    expect(parsed.content).toBe('no frontmatter at all');
  });

  it('does not treat ---- as a delimiter', () => {
    const parsed = parseFrontmatter('----\nnot frontmatter\n');
    expect(parsed.data).toEqual({});
    expect(parsed.content).toBe('----\nnot frontmatter\n');
  });

  it('handles an empty block', () => {
    const parsed = parseFrontmatter('---\n---\nbody');
    expect(parsed.data).toEqual({});
    expect(parsed.content).toBe('body');
  });

  it('returns empty content when the closing fence is missing', () => {
    const parsed = parseFrontmatter('---\nname: x\n');
    expect(parsed.data).toEqual({ name: 'x' });
    expect(parsed.content).toBe('');
  });

  it('ignores comment-only blocks instead of asking js-yaml to parse them', () => {
    const parsed = parseFrontmatter('---\n# just a comment\n---\nbody\n');
    expect(parsed.data).toEqual({});
    expect(parsed.content).toBe('body\n');
  });

  it('strips a UTF-8 BOM', () => {
    const parsed = parseFrontmatter('\uFEFF---\nname: bom\n---\nb\n');
    expect(parsed.data).toEqual({ name: 'bom' });
  });

  it('throws on an unsupported language tag, like gray-matter did', () => {
    expect(() => parseFrontmatter('--- toml\nx = 1\n---\nb')).toThrow(/unsupported front-matter language "toml"/);
  });

  it('accepts an explicit yaml language tag', () => {
    const parsed = parseFrontmatter('--- yaml\nname: x\n---\nb');
    expect(parsed.data).toEqual({ name: 'x' });
  });
});

describe('stringifyFrontmatter', () => {
  it('emits gray-matter-compatible output for changed data', () => {
    expect(stringifyFrontmatter({ name: 'my-helper', custom: 'value' }, 'Body text.\n'))
      .toBe('---\nname: my-helper\ncustom: value\n---\nBody text.\n');
  });

  it('appends a trailing newline to bodies that lack one', () => {
    expect(stringifyFrontmatter({ name: 'x' }, 'no newline')).toBe('---\nname: x\n---\nno newline\n');
  });

  it('emits only the body when there is no data (gray-matter skips an empty block)', () => {
    expect(stringifyFrontmatter({}, 'just body')).toBe('just body\n');
  });
});
