import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ingestTranscript,
  ingestTranscripts,
  ReviewInputError,
} from '../../src/review/ingestion.js';

const temporaryDirectories: string[] = [];

async function fixture(name: string, lines: Array<string | object>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tripwire-review-ingestion-'));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  await writeFile(path, lines.map((line) => typeof line === 'string' ? line : JSON.stringify(line)).join('\n') + '\n');
  return path;
}

function claudeCall(id: string, path = '/repo/a.ts', offset = 1) {
  return {
    type: 'assistant',
    sessionId: 'session-a',
    cwd: '/repo',
    timestamp: '2026-08-22T00:00:00.000Z',
    message: {
      id: `message-${id}`,
      usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 3 },
      content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: path, offset, limit: 20 } }],
    },
  };
}

function claudeResult(id: string, isError = false) {
  return {
    type: 'user',
    sessionId: 'session-a',
    timestamp: '2026-08-22T00:00:01.000Z',
    message: {
      content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'result' }],
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('bounded review ingestion', () => {
  it('normalizes a supported transcript with evidence, full input, and explicit outcome', async () => {
    const path = await fixture('claude.jsonl', [claudeCall('tool-1'), claudeResult('tool-1')]);
    const session = await ingestTranscript(path);

    expect(session.adapter.harness).toBe('claude-code');
    expect(session.adapter.detectionConfidence).not.toBe('low');
    expect(session.sessionId).toBe('session-a');
    expect(session.project).toMatchObject({ root: '/repo', source: 'transcript', confidence: 'high' });
    expect(session.events).toHaveLength(1);
    expect(session.events[0]).toMatchObject({
      toolName: 'Read',
      input: { file_path: '/repo/a.ts', offset: 1, limit: 20 },
      outcome: 'success',
      evidence: { line: 1, sequence: 0, sessionId: 'session-a' },
    });
    expect(session.events[0].result.sizeBytes).toBeGreaterThan(0);
    expect(session.events[0].result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(session.events[0].signature.subject).toBe('./a.ts');
    expect(session.usage).toEqual({ inputTokens: 10, outputTokens: 2, cachedInputTokens: 3 });
  });

  it('keeps source-session order when ingesting multiple paths', async () => {
    const first = await fixture('first.jsonl', [claudeCall('first')]);
    const second = await fixture('second.jsonl', [claudeCall('second')]);
    const sessions = await ingestTranscripts([second, first]);

    expect(sessions.map((session) => session.source.path)).toEqual([second, first]);
  });

  it('warns before processing an unusually large but permitted file', async () => {
    const path = await fixture('large.jsonl', [claudeCall('tool-1')]);
    const warnings: string[] = [];
    await ingestTranscript(path, {
      limits: { warnFileBytes: 1, maxFileBytes: 1024 * 1024 },
      onWarning: (warning) => warnings.push(warning),
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('processing locally');
  });

  it('retains bounded evidence while preserving total event counts', async () => {
    const path = await fixture('many.jsonl', [
      claudeCall('one'), claudeCall('two'), claudeCall('three'),
    ]);
    const session = await ingestTranscript(path, { limits: { maxEvents: 2 } });

    expect(session.events).toHaveLength(2);
    expect(session.stats).toMatchObject({ toolEventsSeen: 3, retainedEvents: 2, droppedEvents: 1 });
    expect(session.diagnostics.some((diagnostic) => diagnostic.code === 'retention-limit')).toBe(true);
  });

  it('reports a few malformed records without hiding valid evidence', async () => {
    const path = await fixture('partial.jsonl', ['not json', claudeCall('tool-1')]);
    const session = await ingestTranscript(path);

    expect(session.stats.invalidRecords).toBe(1);
    expect(session.diagnostics[0]).toMatchObject({ code: 'invalid-json', line: 1 });
  });

  it.each([
    ['empty', [], 'empty'],
    ['unsupported', [{ hello: 'world' }], 'unsupported-format'],
    ['no tools', [{ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'hello' }] } }], 'no-tool-calls'],
  ] as const)('fails clearly for %s input', async (_name, lines, code) => {
    const path = await fixture('bad.jsonl', [...lines]);
    await expect(ingestTranscript(path)).rejects.toMatchObject({ code });
  });

  it('rejects substantially malformed input with counts, not transcript contents', async () => {
    const path = await fixture('malformed.jsonl', [
      'secret-one', 'secret-two', 'secret-three', 'secret-four', 'secret-five', claudeCall('tool-1'),
    ]);
    let caught: unknown;
    try {
      await ingestTranscript(path);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ReviewInputError);
    expect(caught).toMatchObject({ code: 'substantially-malformed' });
    expect((caught as Error).message).not.toContain('secret');
    expect((caught as Error).message).toContain('5 invalid JSON records');
  });

  it('enforces file and line limits before unbounded retention', async () => {
    const path = await fixture('bounded.jsonl', [claudeCall('tool-1')]);
    await expect(ingestTranscript(path, { limits: { maxFileBytes: 2 } }))
      .rejects.toMatchObject({ code: 'oversized' });

    const longLine = await fixture('line.jsonl', ['x'.repeat(40)]);
    await expect(ingestTranscript(longLine, { limits: { maxLineBytes: 10, maxFileBytes: 100 } }))
      .rejects.toMatchObject({ code: 'line-too-large' });
  });
});
