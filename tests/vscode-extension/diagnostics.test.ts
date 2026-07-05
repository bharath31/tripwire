import { describe, it, expect } from 'vitest';
import { lintResultToDiagnostics } from '../../vscode-extension/src/diagnostics.js';
import { lint } from '../../src/lint/rules.js';

function realLint(raw: string) {
  const lines = raw.split('\n');
  const fmEnd = lines.slice(1).findIndex((l) => l.trim() === '---') + 1;
  const fmLines = lines.slice(1, fmEnd);
  const frontmatter: Record<string, string> = {};
  for (const l of fmLines) {
    const m = l.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (m) frontmatter[m[1]] = m[2];
  }
  const body = lines.slice(fmEnd + 1).join('\n').trim();
  return lint({ frontmatter, body, filePath: 'test' });
}

describe('lintResultToDiagnostics', () => {
  it('points a name-kebab-case error at the name: line', () => {
    const raw = '---\nname: MyHelper\ndescription: Use when doing something specific with real content here\n---\n\n' + 'word '.repeat(100) + '`cmd`';
    const result = realLint(raw);
    const diagnostics = lintResultToDiagnostics(raw, result);
    const d = diagnostics.find((d) => d.rule === 'name-kebab-case');
    expect(d).toBeDefined();
    expect(raw.split('\n')[d!.line]).toBe('name: MyHelper');
  });

  it('points description-use-when at the description: line, not the name: line', () => {
    const raw = '---\nname: my-helper\ndescription: This does not start correctly\n---\n\n' + 'word '.repeat(100) + '`cmd`';
    const result = realLint(raw);
    const diagnostics = lintResultToDiagnostics(raw, result);
    const d = diagnostics.find((d) => d.rule === 'description-use-when');
    expect(raw.split('\n')[d!.line]).toContain('description:');
  });

  it('points body-level rules at the first line of the body, after the closing ---', () => {
    const raw = '---\nname: my-helper\ndescription: Use when doing something specific\n---\nShort body.';
    const result = realLint(raw);
    const diagnostics = lintResultToDiagnostics(raw, result);
    const d = diagnostics.find((d) => d.rule === 'body-too-short');
    expect(d).toBeDefined();
    expect(raw.split('\n')[d!.line]).toBe('Short body.');
  });

  it('produces one diagnostic per lint finding, preserving severity', () => {
    const raw = '---\n---\nShort.';
    const result = realLint(raw);
    const diagnostics = lintResultToDiagnostics(raw, result);
    expect(diagnostics.length).toBe(result.errors.length + result.warnings.length);
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('falls back to line 0 when there is no frontmatter at all', () => {
    const raw = 'just plain text, no frontmatter';
    const result = realLint(raw);
    const diagnostics = lintResultToDiagnostics(raw, result);
    for (const d of diagnostics) expect(d.line).toBe(0);
  });

  it('returns no diagnostics for a fully clean skill', () => {
    const raw = '---\nname: my-helper\ndescription: Use when doing something specific with real content here\n---\n\n' + 'word '.repeat(100) + '`cmd`';
    const result = realLint(raw);
    expect(lintResultToDiagnostics(raw, result)).toEqual([]);
  });
});
