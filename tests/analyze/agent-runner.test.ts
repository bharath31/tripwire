import { describe, it, expect, vi } from 'vitest';
import type { ProbeMatrix, AgentAdapter, TranscriptResult } from '../../src/types.js';
import { runProbes } from '../../src/analyze/agent-runner.js';

function makeMatrix(): ProbeMatrix {
  return {
    skillName: 'brainstorming',
    prompts: [
      { zone: 'core', prompt: 'help me build a feature' },
      { zone: 'negative', prompt: 'fix this bug' },
      { zone: 'variants', prompt: 'brainstorm some ideas' },
    ],
  };
}

function makeAdapter(activatedIndices: number[]): AgentAdapter {
  let call = 0;
  return {
    run: vi.fn().mockImplementation(async (): Promise<TranscriptResult> => {
      const idx = call++;
      const activated = activatedIndices.includes(idx);
      return {
        activated,
        skillName: activated ? 'brainstorming' : undefined,
        rawOutput: activated ? 'Launching skill: brainstorming\nContent' : 'Just content',
      };
    }),
  };
}

describe('runProbes', () => {
  it('calls adapter once per prompt', async () => {
    const matrix = makeMatrix();
    const adapter = makeAdapter([]);
    await runProbes(matrix, adapter, () => {});
    expect(adapter.run).toHaveBeenCalledTimes(3);
  });

  it('returns one result per prompt', async () => {
    const matrix = makeMatrix();
    const results = await runProbes(matrix, makeAdapter([]), () => {});
    expect(results).toHaveLength(3);
  });

  it('marks activated results correctly', async () => {
    const results = await runProbes(makeMatrix(), makeAdapter([0]), () => {});
    expect(results[0].transcript.activated).toBe(true);
    expect(results[1].transcript.activated).toBe(false);
    expect(results[2].transcript.activated).toBe(false);
  });

  it('preserves prompt zone in each result', async () => {
    const results = await runProbes(makeMatrix(), makeAdapter([]), () => {});
    expect(results[0].prompt.zone).toBe('core');
    expect(results[1].prompt.zone).toBe('negative');
    expect(results[2].prompt.zone).toBe('variants');
  });

  it('calls onProgress after each probe with (done, total)', async () => {
    const progress: [number, number][] = [];
    await runProbes(makeMatrix(), makeAdapter([]), (done, total) => progress.push([done, total]));
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
});
