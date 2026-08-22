import { describe, expect, it } from 'vitest';
import { OpenAIReviewAdapter, detectOpenAIRecord } from '../../../src/review/adapters/openai.js';
import { detectAdapter } from '../../../src/review/adapters/index.js';
import type { LocatedRecord } from '../../../src/review/adapters/types.js';

function located(value: unknown, line: number): LocatedRecord {
  return { value, line, byteStart: line * 100, byteEnd: line * 100 + 99 };
}

describe('OpenAIReviewAdapter', () => {
  it('parses chat completions, dedupes snapshots and usage, and keeps implicit outcomes unknown', () => {
    const adapter = new OpenAIReviewAdapter({ sourceId: 'openai-run', fallbackSessionId: 'fallback' });
    const completion = {
      id: 'chatcmpl-1', object: 'chat.completion', created: 1_787_392_800,
      session_id: 'session-1', usage: { prompt_tokens: 10, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 3 } },
      choices: [{ index: 0, message: { role: 'assistant', tool_calls: [{
        id: 'call-1', type: 'function', function: { name: 'lookup_widget', arguments: '{"z":2,"a":1}' },
      }] } }],
    };
    adapter.push(located(completion, 1));
    adapter.push(located(completion, 2));
    adapter.push(located({ role: 'tool', tool_call_id: 'call-1', content: 'Error-looking prose is not status.' }, 3));

    const output = adapter.finish();
    expect(output.events).toHaveLength(1);
    expect(output.events[0]).toMatchObject({
      toolName: 'lookup_widget', input: { a: 1, z: 2 }, outcome: 'unknown',
    });
    expect(output.events[0].result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(output.metadata.usage).toEqual({ inputTokens: 10, outputTokens: 4, cachedInputTokens: 3 });
    expect(output.metadata.sessionId).toBe('session-1');
  });

  it('dedupes prior calls in cumulative message wrappers and honors explicit result status', () => {
    const adapter = new OpenAIReviewAdapter({ sourceId: 'openai-run', fallbackSessionId: 'session' });
    const first = { role: 'assistant', tool_calls: [
      { id: 'call-a', function: { name: 'search_docs', arguments: { query: 'x', options: { b: 2, a: 1 } } } },
    ] };
    adapter.push(located({ session_id: 'session', messages: [first] }, 1));
    adapter.push(located({ session_id: 'session', messages: [
      first,
      { role: 'tool', tool_call_id: 'call-a', status: 'error', content: { message: 'not found' } },
      { role: 'assistant', tool_calls: [
        { id: 'call-b', function: { name: 'search_docs', arguments: '{"query":"y"}' } },
      ] },
    ] }, 2));

    const output = adapter.finish();
    expect(output.events.map((event) => event.callId)).toEqual(['call-a', 'call-b']);
    expect(output.events[0].outcome).toBe('error');
    expect(output.events[1].outcome).toBe('unknown');
  });

  it('scopes reused raw call IDs to their completion and correlates each result independently', () => {
    const adapter = new OpenAIReviewAdapter({ sourceId: 'openai-run', fallbackSessionId: 'session' });
    const completion = (id: string, query: string) => ({
      id, object: 'chat.completion', choices: [{ message: { role: 'assistant', tool_calls: [
        { id: 'reused-call', function: { name: 'search', arguments: { query } } },
      ] } }],
    });
    adapter.push(located(completion('completion-a', 'a'), 1));
    adapter.push(located({ role: 'tool', tool_call_id: 'reused-call', status: 'success', content: 'a' }, 2));
    adapter.push(located(completion('completion-b', 'b'), 3));
    adapter.push(located({ role: 'tool', tool_call_id: 'reused-call', status: 'error', content: 'b' }, 4));

    const output = adapter.finish();
    expect(output.events.map((event) => event.eventId)).toEqual([
      'completion:completion-a:choice:0:call:reused-call',
      'completion:completion-b:choice:0:call:reused-call',
    ]);
    expect(output.events.map((event) => event.callId)).toEqual(['reused-call', 'reused-call']);
    expect(output.events.map((event) => event.outcome)).toEqual(['success', 'error']);
    expect(output.events.map((event) => event.resultLocation?.line)).toEqual([2, 4]);
  });

  it('adds only the delta from cumulative message-wrapper usage snapshots', () => {
    const adapter = new OpenAIReviewAdapter({ sourceId: 'openai-run', fallbackSessionId: 'session' });
    adapter.push(located({ session_id: 'session', messages: [], usage: {
      input_tokens: 10, output_tokens: 2, cached_input_tokens: 1,
    } }, 1));
    adapter.push(located({ session_id: 'session', messages: [], usage: {
      input_tokens: 15, output_tokens: 5, cached_input_tokens: 4,
    } }, 2));
    adapter.push(located({ session_id: 'session', messages: [], usage: {
      input_tokens: 15, output_tokens: 5, cached_input_tokens: 4,
    } }, 3));

    expect(adapter.finish().metadata.usage).toEqual({
      inputTokens: 15, outputTokens: 5, cachedInputTokens: 4,
    });
  });

  it('reports optional metadata capabilities truthfully for each supported format', () => {
    const context = { sourceId: 'openai-run', fallbackSessionId: 'session' };
    const completions = new OpenAIReviewAdapter(context, 'openai-chat-completions-jsonl');
    const messages = new OpenAIReviewAdapter(context, 'openai-chat-messages-jsonl');

    expect(completions.identity.capabilities).toMatchObject({ timestamps: 'structured', usage: 'structured' });
    expect(messages.identity.capabilities).toMatchObject({ timestamps: 'unavailable', usage: 'unavailable' });
  });

  it('preserves malformed argument strings and warns without exposing them in the warning', () => {
    const adapter = new OpenAIReviewAdapter({ sourceId: 'openai-run', fallbackSessionId: 'session' });
    adapter.push(located({ role: 'assistant', tool_calls: [
      { id: 'bad-args', function: { name: 'custom', arguments: '{secret: nope}' } },
    ] }, 1));
    const output = adapter.finish();

    expect(output.events[0].input).toEqual({ _rawArguments: '{secret: nope}' });
    expect(output.diagnostics[0]).toMatchObject({ code: 'invalid-json', line: 1 });
    expect(output.diagnostics[0].message).not.toContain('secret');
  });

  it('warns clearly on unsupported Responses/Agents shapes', () => {
    const adapter = new OpenAIReviewAdapter({ sourceId: 'openai-run', fallbackSessionId: 'session' });
    adapter.push(located({ object: 'response', id: 'resp_1', output: [] }, 1));
    adapter.push(located({ type: 'response.output_item.added', item: {} }, 2));
    const output = adapter.finish();

    expect(output.events).toHaveLength(0);
    expect(output.unsupportedRecords).toBe(2);
    expect(output.diagnostics).toHaveLength(1);
    expect(output.diagnostics[0].message).toContain('not supported');
    expect(detectOpenAIRecord({ object: 'response', output: [] })).toBeNull();
    expect(detectOpenAIRecord({ object: 'chat.completion', choices: [] })?.confidence).toBe('high');
  });

  it('classifies streaming Chat Completions chunks as unsupported format', () => {
    const chunk = located({ object: 'chat.completion.chunk', choices: [] }, 1);
    expect(detectOpenAIRecord(chunk.value)?.format).toBe('openai-chat-completions-unsupported');
    expect(detectAdapter([chunk])?.format).toBe('openai-chat-completions-unsupported');
  });
});
