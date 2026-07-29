import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import type { ScenariosFile, AgentAdapter, TranscriptResult } from '../../src/types.js';
import { runScenariosFromFile } from '../../src/test/scenario-runner.js';

const mockAdapter: AgentAdapter = {
  run: vi.fn().mockImplementation(async (p: string): Promise<TranscriptResult> => {
    const activated = p.includes('feature');
    return { activated, skillName: activated ? 'brainstorming' : undefined, rawOutput: '' };
  }),
};

describe('runScenariosFromFile', () => {
  let tmpDir: string;
  let scenariosPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'tripwire-sr-'));
    const file: ScenariosFile = {
      skillName: 'brainstorming',
      generatedAt: '2026-06-27T00:00:00Z',
      scenarios: [
        { prompt: 'build a new feature', zone: 'core', expectedActivation: true },
        { prompt: 'fix a bug', zone: 'negative', expectedActivation: false },
      ],
    };
    scenariosPath = join(tmpDir, 'tripwire-scenarios.yaml');
    await writeFile(scenariosPath, yaml.dump(file), 'utf-8');
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

  it('throws ENOENT when file not found', async () => {
    await expect(runScenariosFromFile('/no/file.yaml', mockAdapter, () => {})).rejects.toThrow('ENOENT');
  });

  it('rejects malformed scenario files with a clear error', async () => {
    const malformed = join(tmpDir, 'malformed.yaml');
    await writeFile(malformed, 'skillName: demo\nscenarios: nope\n', 'utf-8');
    await expect(runScenariosFromFile(malformed, mockAdapter, () => {})).rejects.toThrow(
      'expected a top-level `scenarios` array',
    );
  });
});
