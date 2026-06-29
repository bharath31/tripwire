import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../../dist/cli.js');
const fixture = (n: string) => join(__dirname, '../fixtures', n);

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
