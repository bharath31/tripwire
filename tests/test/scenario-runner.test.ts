import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import * as yaml from 'js-yaml';
import type { ScenariosFile, AgentAdapter, TranscriptResult } from '../../src/types.js';
import { runScenariosFromFile } from '../../src/test/scenario-runner.js';

const mockAdapter: AgentAdapter = {
  run: vi.fn().mockImplementation(async (p: string): Promise<TranscriptResult> => {
    const activated = p.includes('feature');
    return { activated, skillName: activated ? 'brainstorming' : undefined, rawOutput: '' };
  }),
};

const baseFile: ScenariosFile = {
  skillName: 'brainstorming',
  generatedAt: '2026-06-27T00:00:00Z',
  scenarios: [
    { prompt: 'build a new feature', zone: 'core', expectedActivation: true },
    { prompt: 'fix a bug', zone: 'negative', expectedActivation: false },
  ],
};

describe('runScenariosFromFile', () => {
  let tmpDir: string;
  let scenariosPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'tripwire-sr-'));
    scenariosPath = join(tmpDir, 'tripwire-scenarios.yaml');
    await writeFile(scenariosPath, yaml.dump(baseFile), 'utf-8');
  });

  afterEach(async () => { await rm(tmpDir, { recursive: true }); });

  it('returns one result per scenario', async () => {
    const results = await runScenariosFromFile(scenariosPath, mockAdapter, () => {});
    expect(results).toHaveLength(2);
  });

  it('preserves zone from scenario file', async () => {
    const results = await runScenariosFromFile(scenariosPath, mockAdapter, () => {});
    expect(results[0].prompt.zone).toBe('core');
    expect(results[1].prompt.zone).toBe('negative');
  });

  it('preserves the explicit activation expectation from the scenario file', async () => {
    const results = await runScenariosFromFile(scenariosPath, mockAdapter, () => {});
    expect(results[0].prompt.expectedActivation).toBe(true);
    expect(results[1].prompt.expectedActivation).toBe(false);
  });

  it('calls onProgress with (done, total) after each run', async () => {
    const calls: [number, number][] = [];
    await runScenariosFromFile(scenariosPath, mockAdapter, (d, t) => calls.push([d, t]));
    expect(calls).toEqual([[1, 2], [2, 2]]);
  });

  it('throws a friendly error when file not found', async () => {
    await expect(runScenariosFromFile('/no/file.yaml', mockAdapter, () => {})).rejects.toThrow(/no scenarios file found at \/no\/file\.yaml/);
    await expect(runScenariosFromFile('/no/file.yaml', mockAdapter, () => {})).rejects.toThrow(/tripwire analyze/);
  });

  it('rejects malformed scenario files with a clear error', async () => {
    const malformed = join(tmpDir, 'malformed.yaml');
    await writeFile(malformed, 'skillName: demo\nscenarios: nope\n', 'utf-8');
    await expect(runScenariosFromFile(malformed, mockAdapter, () => {})).rejects.toThrow(
      'expected a top-level `scenarios` array',
    );
  });

  it('wraps YAML parse errors with the file path', async () => {
    const bad = join(tmpDir, 'bad.yaml');
    await writeFile(bad, 'scenarios: [this is: not valid yaml\n', 'utf-8');
    await expect(runScenariosFromFile(bad, mockAdapter, () => {})).rejects.toThrow(/invalid YAML in .*bad\.yaml/);
  });

  it('never runs agent sessions for an invalid scenarios file', async () => {
    const bad = join(tmpDir, 'invalid.yaml');
    await writeFile(bad, yaml.dump({ ...baseFile, scenarios: [{ prompt: 'hi', zone: 'negitive' }] }), 'utf-8');
    const freshAdapter: AgentAdapter = { run: vi.fn() };
    await expect(runScenariosFromFile(bad, freshAdapter, () => {})).rejects.toThrow(/scenario/i);
    expect(freshAdapter.run).not.toHaveBeenCalled();
  });

  it('reports every invalid scenario before running any sessions', async () => {
    const bad = join(tmpDir, 'multiple-invalid.yaml');
    await writeFile(bad, yaml.dump({
      ...baseFile,
      scenarios: [
        { zone: 'core', expectedActivation: 'yes' },
        { prompt: 'bad expectation type', zone: 'negative', expectedActivation: 'false' },
        { prompt: 'unknown zone', zone: 'negitive', expectedActivation: false },
      ],
    }), 'utf-8');
    const freshAdapter: AgentAdapter = { run: vi.fn() };

    let error: Error | undefined;
    try {
      await runScenariosFromFile(bad, freshAdapter, () => {});
    } catch (err) {
      error = err as Error;
    }

    expect(error?.message).toContain('index 0: `prompt` must be a non-empty string');
    expect(error?.message).toContain('index 0: `expectedActivation` must be a boolean');
    expect(error?.message).toContain('index 1: `expectedActivation` must be a boolean');
    expect(error?.message).toContain('index 2: unknown `zone` "negitive"');
    expect(freshAdapter.run).not.toHaveBeenCalled();
  });

  it('keeps legacy scenarios without expectedActivation runnable', async () => {
    const legacy = join(tmpDir, 'legacy.yaml');
    await writeFile(legacy, yaml.dump({
      ...baseFile,
      scenarios: [
        { prompt: 'core prompt', zone: 'core' },
        { prompt: 'negative prompt', zone: 'negative' },
      ],
    }), 'utf-8');

    const results = await runScenariosFromFile(legacy, mockAdapter, () => {});
    expect(results.map((result) => result.prompt.expectedActivation)).toEqual([true, false]);
  });

  it('rejects an empty scenarios list', async () => {
    const empty = join(tmpDir, 'empty-scenarios.yaml');
    await writeFile(empty, yaml.dump({ ...baseFile, scenarios: [] }), 'utf-8');
    await expect(runScenariosFromFile(empty, mockAdapter, () => {}))
      .rejects.toThrow(/must contain at least one entry/);
  });

  it('rejects a missing or empty skillName', async () => {
    const noName = { generatedAt: '', scenarios: baseFile.scenarios };
    const p = join(tmpDir, 'noname.yaml');
    await writeFile(p, yaml.dump(noName), 'utf-8');
    await expect(runScenariosFromFile(p, mockAdapter, () => {})).rejects.toThrow(/missing `skillName`/);

    const empty = join(tmpDir, 'emptyname.yaml');
    await writeFile(empty, yaml.dump({ ...baseFile, skillName: '' }), 'utf-8');
    await expect(runScenariosFromFile(empty, mockAdapter, () => {})).rejects.toThrow(/missing `skillName`/);
  });

  it('rejects a file whose skillName does not match the skill under test', async () => {
    const freshAdapter: AgentAdapter = { run: vi.fn() };
    await expect(runScenariosFromFile(scenariosPath, freshAdapter, () => {}, 3, 'pricing-helper'))
      .rejects.toThrow(/belongs to skill "brainstorming", but you are testing "pricing-helper"/);
    expect(freshAdapter.run).not.toHaveBeenCalled();
  });

  it('accepts the matching skillName', async () => {
    await expect(runScenariosFromFile(scenariosPath, mockAdapter, () => {}, 3, 'brainstorming')).resolves.toHaveLength(2);
  });
});
