import { ClaudeCodeReviewAdapter } from './claude-code.js';
import { CodexCliReviewAdapter } from './codex-cli.js';
import { GeminiCliReviewAdapter } from './gemini-cli.js';
import { OpenAIReviewAdapter } from './openai.js';
import type { AdapterContext, AdapterDetection, LocatedRecord, ReviewAdapter } from './types.js';

function objectOf(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

interface ScoredFormat {
  id: AdapterDetection['id'];
  format: string;
  score: number;
}

/** Detect only explicitly supported formats; an ordinary JSONL file is not Claude by default. */
export function detectAdapter(records: LocatedRecord[]): AdapterDetection | null {
  const scores = new Map<string, ScoredFormat>();
  const add = (id: ScoredFormat['id'], format: string, amount: number) => {
    const key = `${id}:${format}`;
    const current = scores.get(key) ?? { id, format, score: 0 };
    current.score += amount;
    scores.set(key, current);
  };

  for (const record of records) {
    const value = objectOf(record.value);
    if (!value) continue;
    const type = typeof value.type === 'string' ? value.type : '';

    if ((type === 'assistant' || type === 'user') && objectOf(value.message)) {
      add('claude-code', 'claude-code-jsonl', 5);
      if (typeof value.sessionId === 'string' || typeof value.uuid === 'string') {
        add('claude-code', 'claude-code-jsonl', 1);
      }
    }

    if (type === 'item.started' || type === 'item.updated' || type === 'item.completed' || type.startsWith('turn.')) {
      add('codex-cli', 'codex-exec-jsonl', 4);
    }
    if (type === 'session_meta' || type === 'turn_context' || type === 'response_item' || type === 'event_msg') {
      add('codex-cli', 'codex-rollout-jsonl', 4);
    }

    if (type === 'tool_use' && (typeof value.tool_name === 'string' || typeof value.tool_id === 'string')) {
      add('gemini-cli', 'gemini-stream-json', 5);
    }
    if (type === 'tool_result' && typeof value.tool_id === 'string') {
      add('gemini-cli', 'gemini-stream-json', 4);
    }
    if (type === 'init' && (typeof value.session_id === 'string' || typeof value.model === 'string')) {
      add('gemini-cli', 'gemini-stream-json', 2);
    }
    if (typeof value.sessionId === 'string' && (typeof value.projectHash === 'string' || Array.isArray(value.messages))) {
      add('gemini-cli', 'gemini-session-jsonl', 5);
    }
    if ((type === 'gemini' || type === 'user') && (Array.isArray(value.toolCalls) || Object.hasOwn(value, 'content'))) {
      add('gemini-cli', 'gemini-session-jsonl', type === 'gemini' ? 4 : 1);
    }

    if (value.object === 'chat.completion.chunk') {
      add('openai', 'openai-chat-completions-unsupported', 7);
    } else if (Array.isArray(value.choices) || value.object === 'chat.completion') {
      add('openai', 'openai-chat-completions-jsonl', 5);
    }
    if (Array.isArray(value.messages)) add('openai', 'openai-chat-messages-jsonl', 2);
    if (typeof value.role === 'string' && (Array.isArray(value.tool_calls) || typeof value.tool_call_id === 'string')) {
      add('openai', 'openai-chat-messages-jsonl', 4);
    }
    if (value.object === 'response' || type.startsWith('response.') || Array.isArray(value.output)) {
      add('openai', 'openai-responses-unsupported', 6);
    }
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score || a.format.localeCompare(b.format));
  const best = ranked[0];
  if (!best || best.score < 2) return null;
  const runnerUp = ranked[1]?.score ?? 0;
  const confidence = best.score >= 8 && best.score - runnerUp >= 3
    ? 'high'
    : best.score > runnerUp && (runnerUp === 0 || best.score - runnerUp >= 2) ? 'medium' : 'low';
  return { ...best, confidence };
}

export function createAdapter(detection: AdapterDetection, context: AdapterContext): ReviewAdapter {
  switch (detection.id) {
    case 'claude-code': return new ClaudeCodeReviewAdapter(context, detection.format);
    case 'codex-cli': return new CodexCliReviewAdapter(context, detection.format);
    case 'gemini-cli': return new GeminiCliReviewAdapter(context, detection.format);
    case 'openai': return new OpenAIReviewAdapter(context, detection.format);
  }
}

export type {
  AdapterContext,
  AdapterDetection,
  AdapterEvent,
  AdapterOutput,
  LocatedRecord,
  ReviewAdapter,
} from './types.js';
