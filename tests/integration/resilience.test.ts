import { describe, it, expect, afterEach } from 'vitest';
import { execa } from 'execa';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../../dist/cli.js');

const tmpDirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tripwire-resilience-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function writeSkill(root: string, name: string, content: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const p = join(dir, 'SKILL.md');
  await writeFile(p, content, 'utf-8');
  return p;
}

const GOOD_SKILL = `---
name: alpha
description: Use when the user wants to brainstorm product ideas and explore options before committing to a plan.
---

# Alpha

Help explore ideas.

## Example

\`\`\`
ask about goals first
\`\`\`

Discuss constraints, audience, and success criteria before proposing anything concrete.
`;

describe('conflicts resilience (integration)', () => {
  it('gives a clean error for a nonexistent directory', async () => {
    const result = await execa('node', [CLI, 'conflicts', './nope'], { reject: false });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error:');
    expect(result.stderr).not.toMatch(/at async|node:internal/);
  });

  it('scans past an unparseable skill and still reports conflicts among the rest', async () => {
    const root = tmp();
    await writeSkill(root, 'alpha', GOOD_SKILL);
    await writeSkill(root, 'beta', GOOD_SKILL.replace('name: alpha', 'name: beta'));
    await writeSkill(root, 'broken', '---\nname: [unclosed\n---\nbody\n');

    const result = await execa('node', [CLI, 'conflicts', root], { reject: false });
    expect(result.stdout).toContain('could not parse');
    expect(result.stdout).toContain('Description overlaps');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toMatch(/at async|node:internal/);
  });

  it('exits cleanly when only unparseable skills are present', async () => {
    const root = tmp();
    await writeSkill(root, 'broken', '---\nname: [unclosed\n---\nbody\n');

    const result = await execa('node', [CLI, 'conflicts', root], { reject: false });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('no parseable SKILL.md');
    expect(result.stderr).not.toMatch(/at async|node:internal/);
  });

  it('exits 0 when skills parse clean and no conflicts exist', async () => {
    const root = tmp();
    await writeSkill(root, 'alpha', GOOD_SKILL);
    await writeSkill(
      root,
      'gamma',
      GOOD_SKILL.replace('name: alpha', 'name: gamma').replace(
        'description: Use when the user wants to brainstorm product ideas and explore options before committing to a plan.',
        'description: Use when configuring Kubernetes clusters, tuning pod resource limits, or debugging container orchestration.',
      ),
    );

    const result = await execa('node', [CLI, 'conflicts', root], { reject: false });
    expect(result.exitCode).toBe(0);
  });

  it('fails when any skill is unparseable even if the readable ones are conflict-free', async () => {
    const root = tmp();
    await writeSkill(root, 'alpha', GOOD_SKILL);
    await writeSkill(root, 'gamma', GOOD_SKILL.replace('name: alpha', 'name: gamma'));
    await writeSkill(root, 'broken', '---\nname: [unclosed\n---\nbody\n');

    const result = await execa('node', [CLI, 'conflicts', root], { reject: false });
    expect(result.stdout).toContain('could not parse');
    expect(result.exitCode).toBe(1);
  });
});

describe('test-all resilience (integration)', () => {
  it('skips broken skills with a reason instead of aborting the drift run', async () => {
    const root = tmp();
    await writeSkill(root, 'no-scenarios', GOOD_SKILL);
    await writeSkill(root, 'broken', '---\nname: [unclosed\n---\nbody\n');

    const result = await execa('node', [CLI, 'test-all', root], { reject: false });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Skipped 2 skill(s)');
    expect(result.stdout).toContain(join('no-scenarios', 'SKILL.md'));
    expect(result.stdout).toContain(join('broken', 'SKILL.md'));
    expect(result.stderr).not.toMatch(/at async|node:internal/);
  });
});
