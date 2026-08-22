import { describe, expect, it } from 'vitest';
import { ClaudeCodeReviewAdapter, detectClaudeCodeRecord } from '../../../src/review/adapters/claude-code.js';
import type { LocatedRecord } from '../../../src/review/adapters/types.js';

function located(value: unknown, line: number): LocatedRecord {
  return { value, line, byteStart: line * 100, byteEnd: line * 100 + 99 };
}

describe('ClaudeCodeReviewAdapter', () => {
  it('normalizes calls, results, metadata, split records, usage, and Skill activation', () => {
    const adapter = new ClaudeCodeReviewAdapter({ sourceId: 'claude-run', fallbackSessionId: 'fallback' });
    adapter.push(located({
      type: 'system', subtype: 'init', session_id: 'session-1', cwd: '/repo', claude_code_version: '2.1.238',
      timestamp: '2026-08-22T10:00:00Z',
    }, 1));
    const readBlock = { type: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: '/repo/a.ts', offset: 10, limit: 20 } };
    adapter.push(located({
      type: 'assistant', session_id: 'session-1', timestamp: '2026-08-22T10:00:01Z',
      message: { id: 'message-1', usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 11 }, content: [readBlock] },
    }, 2));
    adapter.push(located({
      type: 'assistant', session_id: 'session-1', timestamp: '2026-08-22T10:00:02Z',
      message: { id: 'message-1', usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 11 }, content: [{ type: 'text', text: 'reading' }, readBlock] },
    }, 3));
    adapter.push(located({
      type: 'user', session_id: 'session-1', timestamp: '2026-08-22T10:00:03Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'read-1', is_error: false, content: 'contents' }] },
    }, 4));
    adapter.push(located({
      type: 'assistant', session_id: 'session-1', timestamp: '2026-08-22T10:00:04Z',
      message: {
        id: 'message-2',
        usage: { input_tokens: 2, output_tokens: 3 },
        content: [{ type: 'tool_use', id: 'skill-1', name: 'Skill', input: { skill: 'review-work' } }],
      },
    }, 5));

    const output = adapter.finish();
    expect(output.events).toHaveLength(2);
    expect(output.events[0]).toMatchObject({
      eventId: 'read-1', toolName: 'Read', input: { file_path: '/repo/a.ts', offset: 10, limit: 20 }, outcome: 'success',
    });
    expect(output.events[0].result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(output.events[1]).toMatchObject({
      kind: 'skill_activation',
      activation: { skillName: 'review-work', signal: 'structured', confidence: 'high' },
    });
    expect(output.metadata).toMatchObject({
      sessionId: 'session-1', projectRoot: '/repo', formatVersion: '2.1.238',
      startedAt: '2026-08-22T10:00:00.000Z', endedAt: '2026-08-22T10:00:04.000Z',
      usage: { inputTokens: 7, outputTokens: 10, cachedInputTokens: 11 },
    });
  });

  it('attaches explicit errors even when a result appears before its call', () => {
    const adapter = new ClaudeCodeReviewAdapter({ sourceId: 'claude-run', fallbackSessionId: 'session' });
    adapter.push(located({ type: 'user', message: { content: [
      { type: 'tool_result', tool_use_id: 'bash-1', is_error: true, content: 'failed' },
    ] } }, 1));
    adapter.push(located({ type: 'assistant', message: { id: 'm1', content: [
      { type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'npm test' } },
    ] } }, 2));

    expect(adapter.finish().events[0]).toMatchObject({ outcome: 'error', result: { sizeBytes: 6 } });
  });

  it('recognizes Claude records without treating ordinary diagnostics as tool events', () => {
    expect(detectClaudeCodeRecord({ type: 'system', subtype: 'init', session_id: 's' })?.confidence).toBe('high');
    expect(detectClaudeCodeRecord({ type: 'assistant', message: { content: [] } })?.id).toBe('claude-code');
    expect(detectClaudeCodeRecord({ role: 'assistant', tool_calls: [] })).toBeNull();
  });
});
