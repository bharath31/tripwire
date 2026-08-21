import { afterEach, describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '../../dist/cli.js');
const SKILL = join(here, '../fixtures/valid-skill.md');
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fakeClaudePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tripwire-inline-'));
  dirs.push(root);
  const bin = join(root, 'bin');
  await mkdir(bin);
  const executable = join(bin, 'claude');
  await writeFile(
    executable,
    `#!/usr/bin/env node
console.log(JSON.stringify({
  type: 'assistant',
  message: {
    content: [{
      type: 'tool_use',
      name: 'Skill',
      input: { skill: 'my-skill' }
    }]
  }
}));
`,
    'utf-8',
  );
  await chmod(executable, 0o755);
  return `${bin}:${process.env.PATH ?? ''}`;
}

async function lintFailingSkill(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tripwire-inline-skill-'));
  dirs.push(root);
  const skillPath = join(root, 'SKILL.md');
  await writeFile(
    skillPath,
    `---
name: MySkill
description: Use when handling code tasks
---

## Instructions

Read the relevant code carefully, follow the repository conventions, and keep the change focused.
Run \`npm run build\` and the complete test suite before reporting that the task is finished.
Consider error cases and avoid broad rewrites that make the review harder than necessary.
`,
    'utf-8',
  );
  return skillPath;
}

describe('tripwire test --prompt (integration)', () => {
  it('runs one real adapter process without a scenarios file', async () => {
    const result = await execa(
      'node',
      [CLI, 'test', SKILL, '--prompt', 'help with code', '--expect', 'activate'],
      {
        env: { PATH: await fakeClaudePath(), TRIPWIRE_TELEMETRY: '0' },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1/1 activated');
    expect(result.stdout).toContain('Keep this case in');
  });

  it('fails when the observed activation violates the inline contract', async () => {
    const result = await execa(
      'node',
      [CLI, 'test', SKILL, '--prompt', 'write release notes', '--expect', 'quiet'],
      {
        env: { PATH: await fakeClaudePath(), TRIPWIRE_TELEMETRY: '0' },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('FALSE POSITIVES');
  });

  it('fails the behavioral gate when static lint fails', async () => {
    const result = await execa(
      'node',
      [
        CLI,
        'test',
        await lintFailingSkill(),
        '--prompt',
        'help with code',
        '--expect',
        'activate',
      ],
      {
        env: { PATH: await fakeClaudePath(), TRIPWIRE_TELEMETRY: '0' },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('name-kebab-case');
  });
});
