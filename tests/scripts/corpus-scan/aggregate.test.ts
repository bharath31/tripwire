import { describe, it, expect } from 'vitest';
import { lintRaw, summarize, renderMarkdownReport, type CorpusEntry } from '../../../scripts/corpus-scan/aggregate.js';

describe('lintRaw', () => {
  it('lints raw fetched markdown the same way the CLI lints a file', () => {
    const raw = '---\nname: my-skill\ndescription: Use when doing X\n---\n\nSome real body content that is long enough to pass the length floor and includes a `code example`.\n'.repeat(2);
    const result = lintRaw(raw, 'some-repo/SKILL.md');
    expect(result.errors).toEqual([]);
  });

  it('flags a skill with no frontmatter at all', () => {
    const result = lintRaw('just body text, no frontmatter', 'some-repo/SKILL.md');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('summarize', () => {
  const entry = (file: string, repo: string, errors: number, warnings: number): CorpusEntry => ({
    file, repo, url: `https://github.com/${repo}`,
    result: {
      errors: Array.from({ length: errors }, (_, i) => ({ level: 'error' as const, rule: `rule-e${i}`, message: 'x' })),
      warnings: Array.from({ length: warnings }, (_, i) => ({ level: 'warning' as const, rule: `rule-w${i}`, message: 'x' })),
    },
  });

  it('buckets entries into errors / warnings-only / clean', () => {
    const entries = [
      entry('a.md', 'a/a', 1, 0),
      entry('b.md', 'b/b', 0, 1),
      entry('c.md', 'c/c', 0, 0),
    ];
    const summary = summarize(entries);
    expect(summary.totalScanned).toBe(3);
    expect(summary.withErrors).toBe(1);
    expect(summary.withWarnings).toBe(1);
    expect(summary.clean).toBe(1);
  });

  it('counts an entry with both errors and warnings only under withErrors', () => {
    const summary = summarize([entry('a.md', 'a/a', 1, 2)]);
    expect(summary.withErrors).toBe(1);
    expect(summary.withWarnings).toBe(0);
  });

  it('builds a rule frequency histogram across the whole corpus', () => {
    const entries: CorpusEntry[] = [
      { file: 'a.md', repo: 'a/a', url: '', result: { errors: [{ level: 'error', rule: 'name-kebab-case', message: 'x' }], warnings: [] } },
      { file: 'b.md', repo: 'b/b', url: '', result: { errors: [{ level: 'error', rule: 'name-kebab-case', message: 'x' }], warnings: [] } },
      { file: 'c.md', repo: 'c/c', url: '', result: { errors: [], warnings: [{ level: 'warning', rule: 'body-too-short', message: 'x' }] } },
    ];
    const summary = summarize(entries);
    expect(summary.ruleFrequency['name-kebab-case']).toBe(2);
    expect(summary.ruleFrequency['body-too-short']).toBe(1);
  });

  it('ranks worst offenders by error count first, then warning count', () => {
    const entries = [
      entry('low.md', 'low/low', 0, 3),
      entry('high.md', 'high/high', 2, 0),
    ];
    const summary = summarize(entries);
    expect(summary.worstOffenders[0].repo).toBe('high/high');
  });

  it('handles an empty corpus without dividing by zero', () => {
    const summary = summarize([]);
    expect(summary.totalScanned).toBe(0);
    expect(summary.worstOffenders).toEqual([]);
  });
});

describe('renderMarkdownReport', () => {
  it('renders percentages and a rule table from a summary', () => {
    const summary = {
      totalScanned: 4, withErrors: 1, withWarnings: 1, clean: 2,
      ruleFrequency: { 'name-kebab-case': 3, 'body-too-short': 1 },
      worstOffenders: [],
    };
    const md = renderMarkdownReport(summary);
    expect(md).toContain('Scanned **4**');
    expect(md).toContain('25%');
    expect(md).toContain('50%');
    expect(md).toContain('`name-kebab-case`');
  });

  it('does not throw on a zero-scan summary', () => {
    const md = renderMarkdownReport({ totalScanned: 0, withErrors: 0, withWarnings: 0, clean: 0, ruleFrequency: {}, worstOffenders: [] });
    expect(md).toContain('0%');
  });
});
