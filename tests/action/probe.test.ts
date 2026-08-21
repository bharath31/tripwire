import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile, stat } from 'node:fs/promises';
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
      skillFilePath: skillPath, skillName: 'demo', scenariosPath,
      adapterFactory: fakeAdapterFactory(),
    });
    expect(r.results).toHaveLength(4);
  });

  it('classifies a missed non-negative prompt as a gap', async () => {
    const r = await probeSkill({
      skillFilePath: skillPath, skillName: 'demo', scenariosPath,
      adapterFactory: fakeAdapterFactory(),
    });
    const gaps = r.regressions.filter((x) => x.kind === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].prompt).toBe('no thanks');
  });

  it('classifies an activated negative prompt as a false-positive', async () => {
    const r = await probeSkill({
      skillFilePath: skillPath, skillName: 'demo', scenariosPath,
      adapterFactory: fakeAdapterFactory(),
    });
    const fps = r.regressions.filter((x) => x.kind === 'false-positive');
    expect(fps).toHaveLength(1);
    expect(fps[0].prompt).toBe('yes do unrelated');
  });

  it('uses expectedActivation even when it overrides the zone convention', async () => {
    const file: ScenariosFile = {
      skillName: 'demo',
      generatedAt: '2026-06-29T00:00:00Z',
      scenarios: [
        { prompt: 'yes supported boundary case', zone: 'negative', expectedActivation: true },
      ],
    };
    await writeFile(scenariosPath, yaml.dump(file));
    const r = await probeSkill({
      skillFilePath: skillPath,
      skillName: 'demo',
      scenariosPath,
      adapterFactory: fakeAdapterFactory(),
    });
    expect(r.regressions).toEqual([]);
  });

  it('classifies adapter failures as infrastructure errors, not gaps', async () => {
    const r = await probeSkill({
      skillFilePath: skillPath,
      skillName: 'demo',
      scenariosPath,
      adapterFactory: () => ({
        run: async () => ({
          activated: false,
          rawOutput: '',
          error: 'agent timed out',
        }),
      }),
    });
    expect(r.regressions).toHaveLength(4);
    expect(r.regressions.every((x) => x.kind === 'infrastructure')).toBe(true);
    expect(r.regressions[0].error).toBe('agent timed out');
  });

  it('stages the skill in an isolated Claude workspace, then removes it', async () => {
    let observedCwd = '';
    let observedContent = '';
    await probeSkill({
      skillFilePath: skillPath,
      skillName: 'demo',
      scenariosPath,
      adapterFactory: (_skill, cwd) => {
        observedCwd = cwd;
        return {
          run: async () => {
            observedContent = await readFile(join(cwd, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf-8');
            return { activated: false, rawOutput: '' };
          },
        };
      },
    });
    expect(observedCwd).not.toBe(dir);
    expect(observedContent).toContain('name: demo');
    await expect(stat(observedCwd)).rejects.toThrow();
  });

  it('does not mutate the checked-out workspace', async () => {
    await probeSkill({
      skillFilePath: skillPath,
      skillName: 'demo',
      scenariosPath,
      adapterFactory: fakeAdapterFactory(),
    });
    await expect(stat(join(dir, '.claude'))).rejects.toThrow();
  });
});
