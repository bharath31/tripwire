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

  it('reads current paginated rollout identity, item completion, and cumulative usage', () => {
    const review = adapter('persisted-rollout');
    review.push(record({
      timestamp: '2026-08-22T00:00:00Z',
      type: 'session_meta',
      payload: {
        id: 'child-thread',
        session_id: 'session-tree',
        forked_from_id: 'source-thread',
        parent_thread_id: 'control-parent',
        cwd: '/repo',
        project_hash: 'project-1',
        cli_version: '0.99.0',
        history_mode: 'paginated',
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
      timestamp: '2026-08-22T00:01:02Z',
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        thread_id: 'child-thread',
        turn_id: 'turn-1',
        item: {
          id: 'call-1',
          type: 'command_execution',
          command: 'git status',
          cwd: '/repo',
          status: 'completed',
          exit_code: 0,
          aggregated_output: 'clean',
        },
      },
    }, 4));
    review.push(record({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 3 },
          last_token_usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 3 },
        },
      },
    }, 5));
    const finalUsage = {
      total_token_usage: { input_tokens: 14, output_tokens: 5, cached_input_tokens: 4 },
      last_token_usage: { input_tokens: 4, output_tokens: 3, cached_input_tokens: 1 },
    };
    review.push(record({ type: 'event_msg', payload: { type: 'token_count', info: finalUsage } }, 6));
    // Replayed token snapshots must not be added a second time.
    review.push(record({ type: 'event_msg', payload: { type: 'token_count', info: finalUsage } }, 7));
    // Forked rollouts can retain a copied source SessionMeta after the canonical first one.
    review.push(record({
      type: 'session_meta',
      payload: {
        id: 'copied-parent-thread',
        session_id: 'copied-parent-session',
        parent_thread_id: 'grandparent',
        cwd: '/wrong-repo',
      },
    }, 8));

    const output = review.finish();
    expect(output.metadata).toMatchObject({
      sessionId: 'child-thread',
      logicalSessionId: 'session-tree',
      continuedFromSessionId: 'source-thread',
      projectRoot: '/repo',
      projectIdentity: 'project-1',
      formatVersion: '0.99.0',
      usage: { inputTokens: 14, outputTokens: 5, cachedInputTokens: 4 },
    });
    expect(output.events[0]).toMatchObject({
      toolName: 'exec_command',
      input: { cmd: 'git status' },
      outcome: 'success',
    });
    expect(output.events[0].result.fingerprint).not.toBeNull();
  });

  it('correlates legacy terminal command, patch, MCP, and web-search events', () => {
    const review = adapter('codex-rollout-jsonl');
    review.push(record({
      type: 'response_item',
      payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch', call_id: 'patch-1' },
    }, 1));
    review.push(record({
      type: 'event_msg',
      payload: {
        type: 'patch_apply_end', call_id: 'patch-1', success: false, status: 'declined',
        stdout: '', stderr: 'approval request aborted', changes: { 'src/a.ts': { type: 'update' } },
      },
    }, 2));
    review.push(record({
      type: 'event_msg',
      payload: {
        type: 'exec_command_end', call_id: 'exec-1', command: ['npm', 'test'], cwd: '/repo',
        parsed_cmd: [], source: 'agent', exit_code: 0, status: 'completed', aggregated_output: 'passed',
      },
    }, 3));
    review.push(record({
      type: 'event_msg',
      payload: {
        type: 'mcp_tool_call_end', call_id: 'mcp-1',
        invocation: { server: 'docs', tool: 'lookup', arguments: { query: 'x' } },
        result: { Ok: { is_error: false, content: [{ type: 'text', text: 'found' }] } },
      },
    }, 4));
    review.push(record({
      type: 'event_msg',
      payload: {
        type: 'web_search_end', call_id: 'web-1', query: 'tripwire', action: { type: 'search' }, results: [],
      },
    }, 5));

    const output = review.finish();
    expect(output.events.map((event) => [event.toolName, event.outcome])).toEqual([
      ['apply_patch', 'error'],
      ['command_execution', 'success'],
      ['docs.lookup', 'success'],
      ['web_search', 'unknown'],
    ]);
    expect(output.events[0].input).toBe('*** Begin Patch');
    expect(output.events[1].input).toMatchObject({ command: ['npm', 'test'], cwd: '/repo' });
    expect(output.events[2].input).toEqual({ query: 'x' });
  });

  it('bounds and strips control characters from unsupported type diagnostics', () => {
    const review = adapter();
    review.push(record({ type: `bad\n\u0000${'x'.repeat(300)}` }));

    const message = review.finish().diagnostics[0].message;
    expect(message).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(message.length).toBeLessThanOrEqual(152);
  });
});
