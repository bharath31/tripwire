import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot, scaffoldWorkflow, scaffoldDriftWorkflow } from '../../src/init/scaffold.js';

const dirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tripwire-init-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('findRepoRoot', () => {
  it('walks up to find a .git directory', async () => {
    const root = await makeTmpDir();
    await mkdir(join(root, '.git'));
    const nested = join(root, 'a', 'b', 'c');
    await mkdir(nested, { recursive: true });

    expect(await findRepoRoot(nested)).toBe(root);
  });

  it('falls back to the start dir when no .git is found', async () => {
    const dir = await makeTmpDir();
    expect(await findRepoRoot(dir)).toBe(dir);
  });
});

describe('scaffoldWorkflow', () => {
  it('creates .github/workflows/tripwire.yml when absent', async () => {
    const root = await makeTmpDir();
    const result = await scaffoldWorkflow(root);

    expect(result.created).toBe(true);
    const contents = await readFile(result.path, 'utf-8');
    expect(contents).toContain('uses: bharath31/tripwire@v1');
    expect(contents).toContain('on: pull_request');
  });

  it('does not overwrite an existing workflow file', async () => {
    const root = await makeTmpDir();
    const workflowDir = join(root, '.github', 'workflows');
    await mkdir(workflowDir, { recursive: true });
    await writeFile(join(workflowDir, 'tripwire.yml'), 'custom: true\n', 'utf-8');

    const result = await scaffoldWorkflow(root);

    expect(result.created).toBe(false);
    const contents = await readFile(result.path, 'utf-8');
    expect(contents).toBe('custom: true\n');
  });
});

describe('scaffoldDriftWorkflow', () => {
  it('creates .github/workflows/tripwire-drift.yml with a schedule trigger', async () => {
    const root = await makeTmpDir();
    const result = await scaffoldDriftWorkflow(root);

    expect(result.created).toBe(true);
    expect(result.path).toContain('tripwire-drift.yml');
    const contents = await readFile(result.path, 'utf-8');
    expect(contents).toContain('schedule:');
    expect(contents).toContain('cron:');
    expect(contents).toContain('tripwire-skills test-all');
  });

  it('does not overwrite an existing drift workflow file', async () => {
    const root = await makeTmpDir();
    const workflowDir = join(root, '.github', 'workflows');
    await mkdir(workflowDir, { recursive: true });
    await writeFile(join(workflowDir, 'tripwire-drift.yml'), 'custom: true\n', 'utf-8');

    const result = await scaffoldDriftWorkflow(root);

    expect(result.created).toBe(false);
    expect(await readFile(result.path, 'utf-8')).toBe('custom: true\n');
  });

  it('coexists with the PR-gate workflow without touching it', async () => {
    const root = await makeTmpDir();
    await scaffoldWorkflow(root);
    const drift = await scaffoldDriftWorkflow(root);

    expect(drift.created).toBe(true);
    const prWorkflow = await readFile(join(root, '.github', 'workflows', 'tripwire.yml'), 'utf-8');
    expect(prWorkflow).toContain('on: pull_request');
  });
});
