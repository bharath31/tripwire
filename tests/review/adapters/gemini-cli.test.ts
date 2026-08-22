import { describe, expect, it } from 'vitest';
import { GeminiCliReviewAdapter } from '../../../src/review/adapters/gemini-cli.js';
import type { LocatedRecord } from '../../../src/review/adapters/types.js';

function record(value: unknown, line = 1): LocatedRecord {
  return { value, line, byteStart: line * 100, byteEnd: line * 100 + 99 };
}

function adapter(format = 'stream-json'): GeminiCliReviewAdapter {
  return new GeminiCliReviewAdapter({ sourceId: 'gemini-source', fallbackSessionId: 'fallback' }, format);
}

describe('GeminiCliReviewAdapter', () => {
  it('correlates stream-json tool calls and explicit results', () => {
    const review = adapter();
    review.push(record({ type: 'init', session_id: 'session-1', version: '1.2.3' }));
    review.push(record({
      type: 'tool_use', tool_id: 'tool-1', tool_name: 'run_shell_command', parameters: { command: 'npm test' },
    }, 2));
    review.push(record({
      type: 'tool_result', tool_id: 'tool-1', status: 'success', output: 'passed',
    }, 3));
    review.push(record({
      type: 'result', stats: { input_tokens: 7, output_tokens: 4, cached_input_tokens: 2 },
    }, 4));

    const output = review.finish();
    expect(output.metadata.sessionId).toBe('session-1');
    expect(output.metadata.formatVersion).toBe('1.2.3');
    expect(output.metadata.usage).toEqual({ inputTokens: 7, outputTokens: 4, cachedInputTokens: 2 });
    expect(output.events[0]).toMatchObject({
      toolName: 'run_shell_command',
      input: { command: 'npm test' },
      outcome: 'success',
    });
    expect(output.events[0].result.fingerprint).not.toBeNull();
  });

  it('records dedicated activate_skill calls as structured activation', () => {
    const review = adapter();
    review.push(record({
      type: 'tool_use', tool_id: 'skill-1', tool_name: 'activate_skill', parameters: { name: 'brainstorming' },
    }));

    expect(review.finish().events[0]).toMatchObject({
      kind: 'skill_activation',
      toolName: 'activate_skill',
      outcome: 'unknown',
      activation: { skillName: 'brainstorming', signal: 'structured', confidence: 'high' },
    });
  });

  it('does not infer success from a result body without explicit status', () => {
    const review = adapter();
    review.push(record({ type: 'tool_use', tool_id: 'tool-1', tool_name: 'read_file', parameters: { path: 'a.ts' } }));
    review.push(record({ type: 'tool_result', tool_id: 'tool-1', output: 'contents' }, 2));

    const event = review.finish().events[0];
    expect(event.outcome).toBe('unknown');
    expect(event.result.fingerprint).not.toBeNull();
  });

  it('normalizes current saved-session metadata, messages, and toolCalls', () => {
    const review = adapter('saved-session');
    review.push(record({
      sessionId: 'saved-2',
      previousSessionId: 'saved-1',
      projectHash: 'project-hash',
      projectPath: '/repo',
      version: '0.25.0',
      startTime: '2026-08-22T00:00:00Z',
      lastUpdated: '2026-08-22T00:05:00Z',
      messages: [{
        timestamp: '2026-08-22T00:01:00Z',
        toolCalls: [
          { id: 'read-1', name: 'read_file', args: { path: 'README.md' }, status: 'success', result: 'text' },
          { id: 'custom-1', name: 'custom_lookup', args: { z: 1 }, result: { value: 2 } },
        ],
      }],
    }));

    const output = review.finish();
    expect(output.metadata).toMatchObject({
      sessionId: 'saved-2',
      logicalSessionId: 'saved-1',
      continuedFromSessionId: 'saved-1',
      projectRoot: '/repo',
      projectIdentity: 'project-hash',
      formatVersion: '0.25.0',
    });
    expect(output.events).toHaveLength(2);
    expect(output.events[0]).toMatchObject({ toolName: 'read_file', input: { path: 'README.md' }, outcome: 'success' });
    expect(output.events[1]).toMatchObject({ toolName: 'custom_lookup', input: { z: 1 }, outcome: 'unknown' });
    expect(output.metadata.usage).toEqual({ inputTokens: null, outputTokens: null, cachedInputTokens: null });
  });

  it('warns when a result cannot be correlated to a tool call', () => {
    const review = adapter();
    review.push(record({ type: 'tool_result', tool_id: 'missing', status: 'error', output: 'nope' }));

    expect(review.finish().diagnostics).toContainEqual(expect.objectContaining({
      code: 'unsupported-signal',
      line: 1,
    }));
  });
});
