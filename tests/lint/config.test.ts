import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLintConfig } from '../../src/lint/config.js';

const dirs: string[] = [];
async function tmpDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'tripwire-lintconfig-'));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('loadLintConfig', () => {
  it('returns no overrides and no custom rules when tripwire.yaml is absent', async () => {
    const dir = await tmpDir();
    expect(await loadLintConfig(dir)).toEqual({ ruleConfig: {}, customRules: [] });
  });

  it('resolves the tripwire:recommended preset to no overrides', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'tripwire.yaml'), 'extends: tripwire:recommended\n');
    expect(await loadLintConfig(dir)).toEqual({ ruleConfig: {}, customRules: [] });
  });

  it('applies explicit rule-level overrides', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'tripwire.yaml'), 'rules:\n  description-use-when: off\n  no-code-example: error\n');
    const { ruleConfig } = await loadLintConfig(dir);
    expect(ruleConfig).toEqual({ 'description-use-when': 'off', 'no-code-example': 'error' });
  });

  it('lets explicit rules override what a preset would set', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'tripwire.yaml'), 'extends: tripwire:recommended\nrules:\n  body-too-short: off\n');
    const { ruleConfig } = await loadLintConfig(dir);
    expect(ruleConfig).toEqual({ 'body-too-short': 'off' });
  });

  it('throws a clear error for an unknown preset name', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'tripwire.yaml'), 'extends: tripwire:made-up\n');
    await expect(loadLintConfig(dir)).rejects.toThrow('Unknown preset "tripwire:made-up"');
  });

  it('loads custom rules from a plugins path, relative to the config file', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'my-rules.mjs'), `
      export const rules = [{ id: 'org-specific', defaultLevel: 'warning', check: () => 'org rule fired' }];
    `);
    await writeFile(join(dir, 'tripwire.yaml'), 'plugins:\n  - ./my-rules.mjs\n');
    const { customRules } = await loadLintConfig(dir);
    expect(customRules.map((r) => r.id)).toEqual(['org-specific']);
  });

  it('combines a preset, rule overrides, and custom rules all at once', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'my-rules.mjs'), `
      export const rules = [{ id: 'org-specific', defaultLevel: 'error', check: () => null }];
    `);
    await writeFile(
      join(dir, 'tripwire.yaml'),
      'extends: tripwire:recommended\nrules:\n  name-kebab-case: warning\nplugins:\n  - ./my-rules.mjs\n',
    );
    const { ruleConfig, customRules } = await loadLintConfig(dir);
    expect(ruleConfig).toEqual({ 'name-kebab-case': 'warning' });
    expect(customRules.map((r) => r.id)).toEqual(['org-specific']);
  });

  it('discovers ancestor config and resolves plugins from that config directory', async () => {
    const dir = await tmpDir();
    const nested = join(dir, 'skills', 'review');
    await mkdir(nested, { recursive: true });
    await writeFile(join(dir, 'my-rules.mjs'), `
      export const rules = [{ id: 'root-rule', defaultLevel: 'warning', check: () => null }];
    `);
    await writeFile(join(dir, 'tripwire.yaml'), 'plugins:\n  - ./my-rules.mjs\n');
    const { customRules } = await loadLintConfig(nested);
    expect(customRules.map((rule) => rule.id)).toEqual(['root-rule']);
  });

  it('rejects a non-mapping config instead of ignoring it', async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, 'tripwire.yaml'), 'invalid scalar');
    await expect(loadLintConfig(dir)).rejects.toThrow('expected a YAML mapping');
  });
});
