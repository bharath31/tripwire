import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCustomRules } from '../../src/lint/plugin-loader.js';

const dirs: string[] = [];
async function tmpFile(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tripwire-plugin-'));
  dirs.push(dir);
  const filePath = join(dir, 'custom-rules.mjs');
  await writeFile(filePath, contents, 'utf-8');
  return filePath;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('loadCustomRules', () => {
  it('loads valid rules from a named `rules` export', async () => {
    const file = await tmpFile(`
      export const rules = [
        { id: 'custom-one', defaultLevel: 'warning', check: (skill) => skill.body.includes('bad') ? 'found bad' : null },
      ];
    `);
    const rules = await loadCustomRules(file);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('custom-one');
    expect(rules[0].check({ frontmatter: {}, body: 'this is bad', filePath: 'x' })).toBe('found bad');
  });

  it('loads valid rules from a default export', async () => {
    const file = await tmpFile(`
      export default [{ id: 'default-export-rule', defaultLevel: 'error', check: () => null }];
    `);
    const rules = await loadCustomRules(file);
    expect(rules.map((r) => r.id)).toEqual(['default-export-rule']);
  });

  it('accepts a single default-exported rule object, not just an array', async () => {
    const file = await tmpFile(`
      export default { id: 'single-rule', defaultLevel: 'error', check: () => null };
    `);
    const rules = await loadCustomRules(file);
    expect(rules.map((r) => r.id)).toEqual(['single-rule']);
  });

  it('skips malformed entries and keeps valid ones from the same file', async () => {
    const file = await tmpFile(`
      export const rules = [
        { id: 'good-rule', defaultLevel: 'error', check: () => null },
        { id: 'missing-check', defaultLevel: 'error' },
        { id: 'bad-level', defaultLevel: 'critical', check: () => null },
        'not even an object',
      ];
    `);
    const rules = await loadCustomRules(file);
    expect(rules.map((r) => r.id)).toEqual(['good-rule']);
  });

  it('returns an empty array for a file with no recognizable export', async () => {
    const file = await tmpFile(`export const somethingElse = 42;`);
    expect(await loadCustomRules(file)).toEqual([]);
  });
});
