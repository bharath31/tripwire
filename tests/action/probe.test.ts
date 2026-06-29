import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { probeSkill } from '../../src/action/probe.js';
import type { AgentAdapter, ScenariosFile, TranscriptResult } from '../../src/types.js';

// Adapter that activates iff the prompt contains the word "yes".
function fakeAdapterFactory() {
  return (_skill: string): AgentAdapter => ({
    run: async (prompt: string): Promise<TranscriptResult> => ({
      activated: prompt.includes('yes'),
      rawOutput: '',
    }),
  });
}

describe('probeSkill', () => {
  let dir: string;
  let skillPath: string;
  let scenariosPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(os.tmpdir(), 'tripwire-probe-'));
    skillPath = join(dir, 'SKILL.md');
    await writeFile(skillPath, '---\nname: demo\ndescription: Use when demoing\n---\nBody');
    scenariosPath = join(dir, 'tripwire-scenarios.yaml');
    const file: ScenariosFile = {
      skillName: 'demo',
      generatedAt: '2026-06-29T00:00:00Z',
      scenarios: [
        { prompt: 'yes please demo', zone: 'core', expectedActivation: true },     // activates -> ok
        { prompt: 'no thanks', zone: 'core', expectedActivation: true },           // misses -> gap
        { prompt: 'yes do unrelated', zone: 'negative', expectedActivation: false }, // activates -> false positive
        { prompt: 'no unrelated', zone: 'negative', expectedActivation: false },    // misses -> ok
      ],
    };
    await writeFile(scenariosPath, yaml.dump(file));
  });

  afterEach(async () => { await rm(dir, { recursive: true }); });

  it('returns one ProbeResult per scenario', async () => {
    const r = await probeSkill({
      skillFilePath: skillPath, skillName: 'demo', scenariosPath, workspace: dir,
      adapterFactory: fakeAdapterFactory(),
    });
    expect(r.results).toHaveLength(4);
  });

  it('classifies a missed non-negative prompt as a gap', async () => {
    const r = await probeSkill({
      skillFilePath: skillPath, skillName: 'demo', scenariosPath, workspace: dir,
      adapterFactory: fakeAdapterFactory(),
    });
    const gaps = r.regressions.filter((x) => x.kind === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].prompt).toBe('no thanks');
  });

  it('classifies an activated negative prompt as a false-positive', async () => {
    const r = await probeSkill({
      skillFilePath: skillPath, skillName: 'demo', scenariosPath, workspace: dir,
      adapterFactory: fakeAdapterFactory(),
    });
    const fps = r.regressions.filter((x) => x.kind === 'false-positive');
    expect(fps).toHaveLength(1);
    expect(fps[0].prompt).toBe('yes do unrelated');
  });

  it('stages the skill into <workspace>/.claude/skills/<name>/SKILL.md', async () => {
    await probeSkill({
      skillFilePath: skillPath, skillName: 'demo', scenariosPath, workspace: dir,
      adapterFactory: fakeAdapterFactory(),
    });
    const staged = join(dir, '.claude', 'skills', 'demo', 'SKILL.md');
    const content = await readFile(staged, 'utf-8');
    expect(content).toContain('name: demo');
  });

  it('does not throw when the skill is already in a .claude/skills layout', async () => {
    const inPlace = join(dir, '.claude', 'skills', 'demo');
    await mkdir(inPlace, { recursive: true });
    const inPlacePath = join(inPlace, 'SKILL.md');
    await writeFile(inPlacePath, '---\nname: demo\ndescription: Use when demoing\n---\nBody');
    const r = await probeSkill({
      skillFilePath: inPlacePath, skillName: 'demo', scenariosPath, workspace: dir,
      adapterFactory: fakeAdapterFactory(),
    });
    expect(r.results).toHaveLength(4);
  });
});
