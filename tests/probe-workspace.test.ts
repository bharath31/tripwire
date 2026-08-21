import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProbeWorkspace } from '../src/probe-workspace.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tripwire-workspace-test-'));
  roots.push(root);
  const path = join(root, 'SKILL.md');
  await writeFile(path, '---\nname: demo\ndescription: Use when demoing\n---\nBody\n', 'utf-8');
  return path;
}

describe('createProbeWorkspace', () => {
  it.each([
    ['claude', ['.claude', 'skills']],
    ['gemini', ['.gemini', 'skills']],
    ['codex', ['.agents', 'skills']],
  ])('stages a %s skill at the agent discovery path', async (agent, pathParts) => {
    const source = await fixture();
    const workspace = await createProbeWorkspace(agent, source, 'demo');
    roots.push(workspace.cwd);
    expect(workspace.skillPath).toBe(join(workspace.cwd, ...pathParts, 'demo', 'SKILL.md'));
    expect(await readFile(workspace.skillPath, 'utf-8')).toContain('name: demo');
  });

  it('sanitizes the skill name before using it as a path component', async () => {
    const source = await fixture();
    const workspace = await createProbeWorkspace('claude', source, '../../escape');
    roots.push(workspace.cwd);
    expect(workspace.skillPath.startsWith(workspace.cwd)).toBe(true);
    expect(workspace.skillPath).not.toContain('../');
  });

  it('removes the disposable workspace on cleanup', async () => {
    const source = await fixture();
    const workspace = await createProbeWorkspace('claude', source, 'demo');
    await workspace.cleanup();
    await expect(access(workspace.cwd)).rejects.toThrow();
  });

  it('rejects an unknown agent before creating a workspace', async () => {
    const source = await fixture();
    await expect(createProbeWorkspace('unknown', source, 'demo')).rejects.toThrow(
      'unknown agent',
    );
  });
});
