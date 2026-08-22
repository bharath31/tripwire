import { describe, expect, it } from 'vitest';
import { CodexCliReviewAdapter } from '../../../src/review/adapters/codex-cli.js';
import type { LocatedRecord } from '../../../src/review/adapters/types.js';

function record(value: unknown, line = 1): LocatedRecord {
  return { value, line, byteStart: line * 100, byteEnd: line * 100 + 99 };
}

function adapter(format = 'exec-json'): CodexCliReviewAdapter {
  return new CodexCliReviewAdapter({ sourceId: 'codex-source', fallbackSessionId: 'fallback' }, format);
}

describe('CodexCliReviewAdapter', () => {
  it('normalizes exec command, file-change, MCP, and web-search items', () => {
    const review = adapter();
    review.push(record({ type: 'thread.started', thread_id: 'thread-1' }));
    review.push(record({
      type: 'item.completed',
      item: { id: 'cmd-1', type: 'command_execution', command: 'npm test', cwd: '/repo', aggregated_output: 'ok', exit_code: 0 },
    }, 2));
    review.push(record({
      type: 'item.completed',
      item: { id: 'edit-1', type: 'file_change', changes: [{ path: 'src/a.ts', kind: 'update' }], status: 'completed' },
    }, 3));
    review.push(record({
      type: 'item.completed',
      item: { id: 'mcp-1', type: 'mcp_tool_call', server: 'linear', tool: 'get_issue', arguments: { id: 'BAT-1' }, status: 'failed', error: 'denied' },
    }, 4));
    review.push(record({
      type: 'item.completed',
      item: { id: 'web-1', type: 'web_search', query: 'Tripwire', status: 'completed' },
    }, 5));

    const output = review.finish();
    expect(output.metadata.sessionId).toBe('thread-1');
    expect(output.events.map((event) => [event.toolName, event.outcome])).toEqual([
      ['command_execution', 'success'],
      ['file_change', 'success'],
      ['linear.get_issue', 'error'],
      ['web_search', 'success'],
    ]);
    expect(output.events[0].input).toEqual({ command: 'npm test', cwd: '/repo' });
    expect(output.events[0].result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(output.events[1].input).toEqual({ changes: [{ path: 'src/a.ts', kind: 'update' }] });
    expect(output.events[2].input).toEqual({ id: 'BAT-1' });
    expect(output.events[3].input).toEqual({ query: 'Tripwire' });
  });

  it('keeps outcomes unknown when only output text is present', () => {
    const review = adapter();
    review.push(record({
      type: 'item.completed',
      item: { id: 'cmd-1', type: 'command_execution', command: 'echo ok', aggregated_output: 'ok' },
    }));

    const event = review.finish().events[0];
    expect(event.outcome).toBe('unknown');
    expect(event.result.fingerprint).not.toBeNull();
  });

  it('emits heuristic skill activation separately from its command evidence', () => {
    const review = adapter();
    review.push(record({
      type: 'item.completed',
      item: {
        id: 'cmd-1',
        type: 'command_execution',
        command: 'sed -n 1,200p /repo/.codex/skills/review-pr/SKILL.md',
        exit_code: 0,
      },
    }));

    const output = review.finish();
    expect(output.events).toHaveLength(2);
    expect(output.events[0]).toMatchObject({ kind: 'tool', toolName: 'command_execution' });
    expect(output.events[1]).toMatchObject({
      kind: 'skill_activation',
      activation: { skillName: 'review-pr', signal: 'heuristic', confidence: 'low' },
    });
  });

  it('reads persisted rollout metadata, calls, outputs, and usage', () => {
    const review = adapter('persisted-rollout');
    review.push(record({
      timestamp: '2026-08-22T00:00:00Z',
      type: 'session_meta',
      payload: {
        id: 'segment-2',
        previous_session_id: 'segment-1',
        cwd: '/repo',
        project_hash: 'project-1',
        cli_version: '0.99.0',
      },
    }));
    review.push(record({
      timestamp: '2026-08-22T00:01:00Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"git status"}', call_id: 'call-1' },
    }, 2));
    review.push(record({
      timestamp: '2026-08-22T00:01:01Z',
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'call-1', output: 'clean' },
    }, 3));
    review.push(record({
      type: 'event_msg',
      payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 3 } } },
    }, 4));

    const output = review.finish();
    expect(output.metadata).toMatchObject({
      sessionId: 'segment-2',
      logicalSessionId: 'segment-1',
      continuedFromSessionId: 'segment-1',
      projectRoot: '/repo',
      projectIdentity: 'project-1',
      formatVersion: '0.99.0',
      usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 3 },
    });
    expect(output.events[0]).toMatchObject({
      toolName: 'exec_command',
      input: { cmd: 'git status' },
      outcome: 'unknown',
    });
    expect(output.events[0].result.fingerprint).not.toBeNull();
  });
});
