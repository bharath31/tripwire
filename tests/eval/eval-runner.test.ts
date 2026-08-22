import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import * as yaml from 'js-yaml';
import type { AgentAdapter, TranscriptResult } from '../../src/types.js';
import type { EvalsFile } from '../../src/eval/types.js';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"passed":true,"reasoning":"looks good"}' }],
      }),
    },
    };
  }),
}));

const stubAdapter = (output: string): AgentAdapter => ({
  run: vi.fn().mockImplementation(async (): Promise<TranscriptResult> => ({ activated: true, rawOutput: output })),
});

describe('runEvalCase', () => {
  it('passes when all assertions pass and there is no rubric', async () => {
    const { runEvalCase } = await import('../../src/eval/eval-runner.js');
    const result = await runEvalCase(
      { name: 'basic', prompt: 'x', assertions: [{ type: 'contains', value: 'hello' }] },
      stubAdapter('hello world'),
    );
    expect(result.passed).toBe(true);
  });

  it('fails when any assertion fails', async () => {
    const { runEvalCase } = await import('../../src/eval/eval-runner.js');
    const result = await runEvalCase(
      { name: 'basic', prompt: 'x', assertions: [{ type: 'contains', value: 'missing' }] },
      stubAdapter('hello world'),
    );
    expect(result.passed).toBe(false);
  });

  it('skips the rubric and does not block passing when no API key is provided', async () => {
    const { runEvalCase } = await import('../../src/eval/eval-runner.js');
    const result = await runEvalCase(
      { name: 'rubric-case', prompt: 'x', rubric: 'must be polite' },
      stubAdapter('anything'),
      {},
    );
    expect(result.rubricSkipped).toBe('no ANTHROPIC_API_KEY');
    expect(result.rubricResult).toBeUndefined();
    expect(result.passed).toBe(true);
  });

  it('runs the rubric judge when an API key is provided and factors it into pass/fail', async () => {
    const { runEvalCase } = await import('../../src/eval/eval-runner.js');
    const result = await runEvalCase(
      { name: 'rubric-case', prompt: 'x', rubric: 'must be polite' },
      stubAdapter('anything'),
      { apiKey: 'key' },
    );
    expect(result.rubricResult).toEqual({ passed: true, reasoning: 'looks good' });
    expect(result.passed).toBe(true);
  });

  it('fails overall when assertions pass but the rubric judge fails', async () => {
    const Sdk = (await import('@anthropic-ai/sdk')).default as ReturnType<typeof vi.fn>;
    Sdk.mockImplementationOnce(function () {
      return {
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"passed":false,"reasoning":"too terse"}' }] }) },
      };
    });
    const { runEvalCase } = await import('../../src/eval/eval-runner.js');
    const result = await runEvalCase(
      { name: 'rubric-case', prompt: 'x', assertions: [{ type: 'contains', value: 'anything' }], rubric: 'must be polite' },
      stubAdapter('anything'),
      { apiKey: 'key' },
    );
    expect(result.assertionResults.every((r) => r.passed)).toBe(true);
    expect(result.rubricResult?.passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('reports an agent infrastructure failure without grading its error text', async () => {
    const { runEvalCase } = await import('../../src/eval/eval-runner.js');
    const adapter: AgentAdapter = {
      run: vi.fn().mockResolvedValue({
        activated: false,
        rawOutput: '[adapter error] timeout',
        error: 'timeout',
      }),
    };
    const result = await runEvalCase(
      { name: 'infra', prompt: 'x', assertions: [{ type: 'contains', value: 'timeout' }] },
      adapter,
    );
    expect(result.passed).toBe(false);
    expect(result.infrastructureError).toBe('timeout');
    expect(result.assertionResults).toEqual([]);
  });
});

describe('runEvalsFromFile', () => {
  let tmpDir: string;
  let evalsPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'tripwire-eval-'));
    const file: EvalsFile = {
      skillName: 'brainstorming',
      cases: [
        { name: 'case one', prompt: 'p1', assertions: [{ type: 'contains', value: 'hello' }] },
        { name: 'case two', prompt: 'p2', assertions: [{ type: 'contains', value: 'hello' }] },
      ],
    };
    evalsPath = join(tmpDir, 'tripwire-evals.yaml');
    await writeFile(evalsPath, yaml.dump(file), 'utf-8');
  });

  afterEach(async () => { await rm(tmpDir, { recursive: true }); });

  it('returns one result per eval case', async () => {
    const { runEvalsFromFile } = await import('../../src/eval/eval-runner.js');
    const results = await runEvalsFromFile(evalsPath, stubAdapter('hello world'), {}, () => {});
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('calls onProgress with (done, total) after each case', async () => {
    const { runEvalsFromFile } = await import('../../src/eval/eval-runner.js');
    const calls: [number, number][] = [];
    await runEvalsFromFile(evalsPath, stubAdapter('hello world'), {}, (d, t) => calls.push([d, t]));
    expect(calls).toEqual([[1, 2], [2, 2]]);
  });

  it('throws a friendly error when the file is not found', async () => {
    const { runEvalsFromFile } = await import('../../src/eval/eval-runner.js');
    await expect(runEvalsFromFile('/no/file.yaml', stubAdapter(''), {}, () => {})).rejects.toThrow(/no evals file found at \/no\/file\.yaml/);
  });

  it('wraps YAML parse errors with the file path', async () => {
    const { runEvalsFromFile } = await import('../../src/eval/eval-runner.js');
    const bad = join(tmpDir, 'bad-evals.yaml');
    await writeFile(bad, 'cases: [oops: nope\n', 'utf-8');
    await expect(runEvalsFromFile(bad, stubAdapter(''), {}, () => {})).rejects.toThrow(/invalid YAML in .*bad-evals\.yaml/);
  });

  it('rejects cases missing a prompt before running any sessions', async () => {
    const { runEvalsFromFile } = await import('../../src/eval/eval-runner.js');
    const adapter = stubAdapter('hello world');
    const bad = join(tmpDir, 'no-prompt.yaml');
    await writeFile(bad, yaml.dump({ skillName: 'x', cases: [{ name: 'no prompt here' }] }), 'utf-8');
    await expect(runEvalsFromFile(bad, adapter, {}, () => {})).rejects.toThrow(/"no prompt here": missing `prompt`/);
    expect(adapter.run).not.toHaveBeenCalled();
  });

  it('rejects cases with no assertions and no rubric — they could only ever pass', async () => {
    const { validateEvalsFile } = await import('../../src/eval/eval-runner.js');
    let err: Error | undefined;
    try {
      validateEvalsFile({ skillName: 'x', cases: [{ name: 'empty check', prompt: 'p' }] });
    } catch (e) { err = e as Error; }
    expect(err?.message).toMatch(/"empty check": has no `assertions` and no `rubric`/);
  });

  it('requires a non-empty skillName', async () => {
    const { validateEvalsFile } = await import('../../src/eval/eval-runner.js');
    expect(() => validateEvalsFile({
      cases: [{ name: 'checked', prompt: 'p', assertions: [{ type: 'contains', value: 'x' }] }],
    })).toThrow(/missing `skillName`/);
  });

  it('rejects an evals file for a different skill before running sessions', async () => {
    const { runEvalsFromFile } = await import('../../src/eval/eval-runner.js');
    const adapter = stubAdapter('hello world');
    await expect(runEvalsFromFile(evalsPath, adapter, {}, () => {}, 'another-skill'))
      .rejects.toThrow(/belongs to skill "brainstorming", but you are evaluating "another-skill"/);
    expect(adapter.run).not.toHaveBeenCalled();
  });

  it('rejects malformed assertion entries instead of silently inverting their meaning', async () => {
    const { validateEvalsFile } = await import('../../src/eval/eval-runner.js');
    const cases = [{
      name: 'typo type',
      prompt: 'p',
      assertions: [
        { type: 'containsx', value: 'hello' },
        { type: 'contains' },
        { type: 'not_contains', value: '' },
      ],
    }];
    let err: Error | undefined;
    try {
      validateEvalsFile({ skillName: 'x', cases } as never);
    } catch (e) { err = e as Error; }
    const msg = err!.message;
    expect(msg).toMatch(/assertion 1 has `type` "containsx"/);
    expect(msg).toMatch(/assertion 2 is missing `value`/);
    expect(msg).toMatch(/assertion 3 is missing `value`/);
  });
});
