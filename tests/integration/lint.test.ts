import { describe, it, expect, afterEach } from 'vitest';
import { execa } from 'execa';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../../dist/cli.js');
const fixture = (n: string) => join(__dirname, '../fixtures', n);

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('tripwire lint (integration)', () => {
  it('exits 0 and shows ✓ for a valid skill', async () => {
    const result = await execa('node', [CLI, 'lint', fixture('valid-skill.md')], { reject: false });
    expect(result.stdout).toContain('✓');
    expect(result.exitCode).toBe(0);
  });

  it('exits 1 and shows ✗ for a skill missing name and description', async () => {
    const result = await execa('node', [CLI, 'lint', fixture('invalid-skill.md')], { reject: false });
    expect(result.stdout).toContain('✗');
    expect(result.exitCode).toBe(1);
  });

  it('shows --help without error', async () => {
    const result = await execa('node', [CLI, '--help'], { reject: false });
    expect(result.stdout).toContain('tripwire');
    expect(result.exitCode).toBe(0);
  });
});

describe('tripwire lint --fix (integration)', () => {
  async function withCopiedFixture(name: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'tripwire-fix-'));
    tmpDirs.push(dir);
    const target = join(dir, 'SKILL.md');
    await copyFile(fixture(name), target);
    return target;
  }

  it('rewrites a non-kebab-case name in place and reports the change', async () => {
    const target = await withCopiedFixture('non-kebab-name-skill.md');
    const result = await execa('node', [CLI, 'lint', '--fix', target], { reject: false });

    expect(result.stdout).toContain('Fixed:');
    expect(result.stdout).toContain('"MyHelper" → "my-helper"');

    const after = await readFile(target, 'utf-8');
    expect(after).toContain('name: my-helper');
  });

  it('leaves an already-valid skill unchanged and says so', async () => {
    const target = await withCopiedFixture('valid-skill.md');
    const before = await readFile(target, 'utf-8');
    const result = await execa('node', [CLI, 'lint', '--fix', target], { reject: false });

    expect(result.stdout).toContain('No auto-fixable issues found.');
    const after = await readFile(target, 'utf-8');
    expect(after).toBe(before);
  });
});
