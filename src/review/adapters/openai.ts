import { stableCanonicalize } from '../semantic-signature.js';
import type { ToolOutcome } from '../types.js';
import { BaseReviewAdapter, recordObject, timestampOf } from './base.js';
import type {
  AdapterContext,
  AdapterDetection,
  AdapterOutput,
  LocatedRecord,
} from './types.js';

export const OPENAI_REVIEW_FORMAT = 'openai-chat-tool-jsonl';

interface PendingResult {
  outcome: ToolOutcome;
  result: unknown;
}

interface MessageContext {
  scope: string;
  cumulative: boolean;
  timestamp: unknown;
}

function objectValue(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

function explicitOutcome(message: Record<string, any>): ToolOutcome {
  if (message.is_error === true || message.isError === true) return 'error';
  if (message.is_error === false || message.isError === false) return 'success';
  const status = typeof message.status === 'string' ? message.status.toLowerCase() : null;
  if (status === 'error' || status === 'failed' || status === 'failure') return 'error';
  if (status === 'success' || status === 'completed' || status === 'ok') return 'success';
  if (Object.hasOwn(message, 'error') && message.error !== null && message.error !== undefined) return 'error';
  return 'unknown';
}

function isResponsesOrAgentsShape(record: Record<string, any>): boolean {
  const object = typeof record.object === 'string' ? record.object.toLowerCase() : '';
  const type = typeof record.type === 'string' ? record.type.toLowerCase() : '';
  if (object === 'response' || object.startsWith('response.') || type.startsWith('response.')) return true;
  if (object.startsWith('thread.') || object.startsWith('run.') || type.startsWith('thread.')) return true;
  if ((type === 'function_call' || type === 'function_call_output') && !record.role) return true;
  return Array.isArray(record.output) && !Array.isArray(record.choices) && !Array.isArray(record.messages);
}

/** A positive score means the record is in the documented OpenAI compatibility subset. */
export function detectOpenAIRecord(value: unknown): AdapterDetection | null {
  const record = objectValue(value);
  if (!record || isResponsesOrAgentsShape(record)) return null;
  let score = 0;
  if (record.object === 'chat.completion' && Array.isArray(record.choices)) score += 6;
  if (Array.isArray(record.choices)) score += 2;
  if (Array.isArray(record.messages)) score += 4;
  if (typeof record.role === 'string') score += 3;
  if (Array.isArray(record.tool_calls) || typeof record.tool_call_id === 'string') score += 3;
  return score === 0
    ? null
    : {
        id: 'openai',
        format: OPENAI_REVIEW_FORMAT,
        score,
        confidence: score >= 5 ? 'high' : 'medium',
      };
}

export class OpenAIReviewAdapter extends BaseReviewAdapter {
  private readonly pendingResults = new Map<string, PendingResult>();
  private readonly seenUsageRecords = new Set<string>();
  private warnedUnsupportedModernShape = false;

  constructor(context: AdapterContext, format = OPENAI_REVIEW_FORMAT) {
    super({
      harness: 'openai',
      adapterVersion: '1',
      format,
      formatVersion: null,
      detectionConfidence: 'high',
      capabilities: {
        toolCalls: 'structured',
        toolResults: 'structured',
        timestamps: 'structured',
        usage: 'structured',
        mutations: 'heuristic',
        skillActivation: 'unavailable',
      },
    }, context);
  }

  push(located: LocatedRecord): void {
    const record = recordObject(located);
    if (!record) return;
    if (isResponsesOrAgentsShape(record)) {
      this.markUnsupported(
        located,
        this.warnedUnsupportedModernShape
          ? undefined
          : 'OpenAI Responses and Agents trace records are not supported; use Chat Completions or role/tool-call JSONL.',
      );
      this.warnedUnsupportedModernShape = true;
      return;
    }
    if (record.object === 'chat.completion.chunk') {
      this.markUnsupported(
        located,
        'Streaming Chat Completions chunks are not supported; provide completed messages or role/tool-call JSONL.',
      );
      return;
    }

    this.captureMetadata(record);
    this.noteRecordTimestamp(record.timestamp ?? record.created_at ?? record.created);
    this.captureUsage(record, located);

    if (Array.isArray(record.choices)) {
      record.choices.forEach((choice: unknown, index: number) => {
        const parsed = objectValue(choice);
        const message = objectValue(parsed?.message);
        if (!message) return;
        const recordId = stringValue(record.id) ?? `line:${located.line}`;
        this.captureMessage(message, located, {
          scope: `completion:${recordId}:choice:${parsed?.index ?? index}`,
          cumulative: typeof record.id === 'string',
          timestamp: record.timestamp ?? record.created,
        });
      });
      return;
    }

    if (Array.isArray(record.messages)) {
      record.messages.forEach((message: unknown, index: number) => {
        const parsed = objectValue(message);
        if (!parsed) return;
        const wrapperId = stringValue(record.id, record.session_id, record.sessionId)
          ?? this.context.fallbackSessionId;
        this.captureMessage(parsed, located, {
          scope: `messages:${wrapperId}:message:${index}`,
          cumulative: true,
          timestamp: parsed.timestamp ?? parsed.created_at ?? record.timestamp ?? record.created,
        });
      });
      return;
    }

    if (typeof record.role === 'string') {
      this.captureMessage(record, located, {
        scope: `bare:${located.line}`,
        cumulative: false,
        timestamp: record.timestamp ?? record.created_at ?? record.created,
      });
    }
  }

  override finish(): AdapterOutput {
    return super.finish();
  }

  private captureMetadata(record: Record<string, any>): void {
    const sessionId = stringValue(record.session_id, record.sessionId, record.conversation_id, record.conversationId);
    const logicalSessionId = stringValue(record.logical_session_id, record.logicalSessionId, sessionId);
    if (sessionId) this.setSessionIdentity(sessionId, logicalSessionId);
    this.setContinuation(stringValue(
      record.continued_from_session_id,
      record.continuedFromSessionId,
      record.resumed_from_session_id,
      record.resumedFromSessionId,
    ));
    const projectRoot = stringValue(record.cwd, record.project_root, record.projectRoot);
    const projectId = stringValue(record.project_id, record.projectId);
    if (projectRoot || projectId) this.setProject(projectRoot, projectId);
    const version = stringValue(record.format_version, record.api_version, record.apiVersion);
    if (version) this.metadata.formatVersion = version;
  }

  private noteRecordTimestamp(value: unknown): void {
    const timestamp = timestampOf(value);
    if (!timestamp) return;
    if (!this.metadata.startedAt || timestamp < this.metadata.startedAt) this.metadata.startedAt = timestamp;
    if (!this.metadata.endedAt || timestamp > this.metadata.endedAt) this.metadata.endedAt = timestamp;
  }

  private captureUsage(record: Record<string, any>, located: LocatedRecord): void {
    const usage = objectValue(record.usage);
    if (!usage) return;
    const stableId = stringValue(record.id);
    const key = stableId ? `record:${stableId}` : `line:${located.line}`;
    if (this.seenUsageRecords.has(key)) return;
    this.seenUsageRecords.add(key);
    this.addUsage(
      usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens,
      usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens,
      objectValue(usage.prompt_tokens_details)?.cached_tokens
        ?? usage.cached_input_tokens
        ?? usage.cachedInputTokens,
    );
  }

  private captureMessage(message: Record<string, any>, located: LocatedRecord, context: MessageContext): void {
    this.noteRecordTimestamp(context.timestamp);
    if (message.role === 'assistant') this.captureToolCalls(message, located, context);
    if (message.role === 'tool' || message.role === 'function') this.captureToolResult(message, located);
  }

  private captureToolCalls(message: Record<string, any>, located: LocatedRecord, context: MessageContext): void {
    if (!Array.isArray(message.tool_calls)) return;
    message.tool_calls.forEach((rawCall: unknown, index: number) => {
      const call = objectValue(rawCall);
      if (!call) return;
      const fn = objectValue(call.function) ?? call;
      const toolName = stringValue(fn.name, call.name) ?? 'unknown';
      const input = this.parseArguments(fn.arguments ?? call.arguments, located);
      const callId = stringValue(call.id, call.tool_call_id);
      const fallbackKey = context.cumulative
        ? `${context.scope}:tool:${index}:${toolName}:${stableCanonicalize(input)}`
        : null;
      const event = this.addEvent(located, {
        eventId: callId ?? `${context.scope}:tool:${index}`,
        dedupeKey: callId ? `call:${callId}` : fallbackKey,
        timestamp: call.timestamp ?? context.timestamp,
        toolName,
        input,
        callId,
      });
      if (event && callId) {
        const pending = this.pendingResults.get(callId);
        if (pending) {
          this.updateResult(callId, pending.outcome, pending.result);
          this.pendingResults.delete(callId);
        }
      }
    });
  }

  private parseArguments(value: unknown, located: LocatedRecord): unknown {
    if (value === undefined || value === null || value === '') return {};
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      this.addDiagnostic({
        code: 'invalid-json',
        severity: 'warning',
        message: 'OpenAI tool arguments are not valid JSON; the raw argument string was preserved.',
        line: located.line,
      });
      return { _rawArguments: value };
    }
  }

  private captureToolResult(message: Record<string, any>, located: LocatedRecord): void {
    const callId = stringValue(message.tool_call_id, message.toolCallId, message.call_id, message.callId);
    if (!callId) {
      this.addDiagnostic({
        code: 'missing-field',
        severity: 'warning',
        message: 'OpenAI tool result is missing its tool-call ID.',
        line: located.line,
      });
      return;
    }
    const pending = { outcome: explicitOutcome(message), result: message.content ?? message.output };
    if (!this.updateResult(callId, pending.outcome, pending.result)) {
      this.pendingResults.set(callId, pending);
    }
  }
}
