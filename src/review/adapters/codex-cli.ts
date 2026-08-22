import { BaseReviewAdapter, recordObject, timestampOf } from './base.js';
import type { AdapterContext, AdapterEvent, LocatedRecord } from './types.js';
import type { AdapterCapabilities, AdapterIdentity, ToolOutcome } from '../types.js';

const ADAPTER_VERSION = '1';
const SKILL_PATH_RE = /(?:^|[\\/])skills[\\/]([a-z0-9][a-z0-9._-]*)[\\/]SKILL\.md\b/gi;

const CODEX_CAPABILITIES: AdapterCapabilities = {
  toolCalls: 'structured',
  toolResults: 'structured',
  timestamps: 'structured',
  usage: 'structured',
  mutations: 'structured',
  skillActivation: 'heuristic',
};

function own(object: Record<string, any>, key: string): boolean {
  return Object.hasOwn(object, key);
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function explicitOutcome(value: Record<string, any>): ToolOutcome {
  if (value.error !== undefined && value.error !== null) return 'error';
  if (value.is_error === true || value.isError === true || value.success === false) return 'error';
  if (value.is_error === false || value.isError === false || value.success === true) return 'success';
  const exitCode = own(value, 'exit_code') ? value.exit_code : value.exitCode;
  if (typeof exitCode === 'number' && Number.isFinite(exitCode)) return exitCode === 0 ? 'success' : 'error';

  const status = typeof value.status === 'string' ? value.status.toLowerCase() : null;
  if (status && ['success', 'succeeded', 'completed', 'complete', 'done'].includes(status)) return 'success';
  if (status && ['error', 'failed', 'failure', 'cancelled', 'canceled', 'rejected', 'declined'].includes(status)) return 'error';
  return 'unknown';
}

function diagnosticType(value: unknown): string {
  if (typeof value !== 'string') return value === undefined || value === null ? 'missing' : typeof value;
  const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?').slice(0, 120);
  return sanitized || 'missing';
}

function without(value: Record<string, any>, excluded: readonly string[]): Record<string, unknown> {
  const result = Object.create(null) as Record<string, unknown>;
  const skipped = new Set(excluded);
  for (const key of Object.keys(value)) {
    if (!skipped.has(key)) result[key] = value[key];
  }
  return result;
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Persist the exact opaque input when a custom tool did not use JSON.
    return value;
  }
}

function commandText(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const object = input as Record<string, unknown>;
  const command = object.command ?? object.cmd ?? object.script;
  if (typeof command === 'string') return command;
  if (Array.isArray(command) && command.every((part) => typeof part === 'string')) return command.join(' ');
  const action = object.action;
  if (action && typeof action === 'object' && !Array.isArray(action)) return commandText(action);
  return null;
}

interface NormalizedToolItem {
  callId: string | null;
  eventId: string | null;
  toolName: string;
  input: unknown;
  result: unknown;
  outcome: ToolOutcome;
}

function normalizeExecItem(item: Record<string, any>): NormalizedToolItem | null {
  const callId = stringValue(item.id, item.call_id);
  const commonExcluded = ['id', 'call_id', 'type', 'status', 'exit_code', 'exitCode', 'output', 'aggregated_output', 'result', 'error'];

  switch (item.type) {
    case 'command_execution':
      return {
        callId,
        eventId: callId,
        toolName: 'command_execution',
        input: without(item, commonExcluded),
        result: item.aggregated_output ?? item.output,
        outcome: explicitOutcome(item),
      };
    case 'file_change':
      return {
        callId,
        eventId: callId,
        toolName: 'file_change',
        input: without(item, commonExcluded),
        result: item.result,
        outcome: explicitOutcome(item),
      };
    case 'mcp_tool_call': {
      const server = stringValue(item.server, item.server_name);
      const tool = stringValue(item.tool, item.name, item.tool_name) ?? 'unknown';
      return {
        callId,
        eventId: callId,
        toolName: server ? `${server}.${tool}` : tool,
        input: parseArguments(item.arguments ?? item.args ?? item.input),
        result: item.result ?? item.output ?? item.error,
        outcome: explicitOutcome(item),
      };
    }
    case 'web_search':
      return {
        callId,
        eventId: callId,
        toolName: 'web_search',
        input: without(item, commonExcluded),
        result: item.result ?? item.output,
        outcome: explicitOutcome(item),
      };
    default:
      return null;
  }
}

function normalizeResponseItem(payload: Record<string, any>): NormalizedToolItem | null {
  const callId = stringValue(payload.call_id, payload.id);
  switch (payload.type) {
    case 'function_call':
      return {
        callId,
        eventId: callId,
        toolName: stringValue(payload.name) ?? 'unknown',
        input: parseArguments(payload.arguments),
        result: undefined,
        outcome: explicitOutcome(payload),
      };
    case 'custom_tool_call':
      return {
        callId,
        eventId: callId,
        toolName: stringValue(payload.name) ?? 'custom_tool',
        input: payload.input ?? {},
        result: undefined,
        outcome: explicitOutcome(payload),
      };
    case 'local_shell_call':
      return {
        callId,
        eventId: callId,
        toolName: 'command_execution',
        input: payload.action ?? without(payload, ['id', 'call_id', 'type', 'status']),
        result: payload.output,
        outcome: explicitOutcome(payload),
      };
    case 'web_search_call':
      return {
        callId,
        eventId: callId,
        toolName: 'web_search',
        input: payload.action ?? without(payload, ['id', 'call_id', 'type', 'status']),
        result: payload.output,
        outcome: explicitOutcome(payload),
      };
    default:
      return null;
  }
}

function responseOutput(payload: Record<string, any>): { callId: string | null; result: unknown; outcome: ToolOutcome } | null {
  if (payload.type !== 'function_call_output' && payload.type !== 'custom_tool_call_output') return null;
  return {
    callId: stringValue(payload.call_id, payload.id),
    result: payload.output ?? payload.result,
    outcome: explicitOutcome(payload),
  };
}

function mcpCompletionOutcome(payload: Record<string, any>): ToolOutcome {
  const result = payload.result;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const resultObject = result as Record<string, any>;
    if (own(resultObject, 'Err') || own(resultObject, 'err')) return 'error';
    const ok = resultObject.Ok ?? resultObject.ok;
    if (ok !== undefined) {
      if (ok && typeof ok === 'object' && !Array.isArray(ok)) {
        const okObject = ok as Record<string, any>;
        return okObject.is_error === true || okObject.isError === true ? 'error' : 'success';
      }
      return 'success';
    }
    if (resultObject.is_error === true || resultObject.isError === true) return 'error';
    if (resultObject.is_error === false || resultObject.isError === false) return 'success';
  }
  return explicitOutcome(payload);
}

function normalizeLegacyCompletion(payload: Record<string, any>): NormalizedToolItem | null {
  const callId = stringValue(payload.call_id, payload.callId, payload.id);
  switch (payload.type) {
    case 'exec_command_end':
      return {
        callId,
        eventId: callId,
        toolName: 'command_execution',
        input: without(payload, [
          'type', 'call_id', 'callId', 'id', 'status', 'exit_code', 'exitCode', 'stdout', 'stderr',
          'aggregated_output', 'formatted_output', 'duration', 'completed_at_ms', 'error',
        ]),
        result: payload.aggregated_output ?? payload.formatted_output ?? {
          stdout: payload.stdout,
          stderr: payload.stderr,
        },
        outcome: explicitOutcome(payload),
      };
    case 'patch_apply_end':
      return {
        callId,
        eventId: callId,
        toolName: 'file_change',
        input: { changes: payload.changes ?? {} },
        result: { stdout: payload.stdout, stderr: payload.stderr },
        outcome: explicitOutcome(payload),
      };
    case 'mcp_tool_call_end': {
      const invocation = payload.invocation && typeof payload.invocation === 'object' && !Array.isArray(payload.invocation)
        ? payload.invocation as Record<string, any>
        : payload;
      const server = stringValue(invocation.server, payload.server);
      const tool = stringValue(invocation.tool, invocation.name, payload.tool, payload.name) ?? 'unknown';
      return {
        callId,
        eventId: callId,
        toolName: server ? `${server}.${tool}` : tool,
        input: parseArguments(invocation.arguments ?? invocation.args ?? payload.arguments ?? payload.args),
        result: payload.result,
        outcome: mcpCompletionOutcome(payload),
      };
    }
    case 'web_search_end':
      return {
        callId,
        eventId: callId,
        toolName: 'web_search',
        input: without(payload, ['type', 'call_id', 'callId', 'id', 'status', 'result', 'results', 'error']),
        result: payload.results ?? payload.result,
        outcome: explicitOutcome(payload),
      };
    case 'dynamic_tool_call_response':
      return {
        callId,
        eventId: callId,
        toolName: stringValue(payload.tool, payload.name) ?? 'dynamic_tool',
        input: payload.arguments ?? {},
        result: payload.content_items ?? payload.result,
        outcome: explicitOutcome(payload),
      };
    default:
      return null;
  }
}

/** Review adapter for both `codex exec --json` and persisted rollout JSONL. */
export class CodexCliReviewAdapter extends BaseReviewAdapter {
  private sawCanonicalSessionMetadata = false;

  constructor(context: AdapterContext, format = 'codex-jsonl') {
    const identity: AdapterIdentity = {
      harness: 'codex-cli',
      adapterVersion: ADAPTER_VERSION,
      format,
      formatVersion: null,
      detectionConfidence: 'high',
      capabilities: { ...CODEX_CAPABILITIES },
    };
    super(identity, context);
  }

  push(record: LocatedRecord): void {
    const object = recordObject(record);
    if (!object) {
      this.markUnsupported(record, 'Codex record is not a JSON object.');
      return;
    }

    const outerTimestamp = timestampOf(object.timestamp ?? object.created_at);
    this.noteTimestamp(outerTimestamp);

    switch (object.type) {
      case 'thread.started':
        this.setSessionIdentity(object.thread_id ?? object.threadId);
        return;
      case 'turn.started':
        return;
      case 'turn.completed':
        this.readUsage(object.usage);
        return;
      case 'turn.failed':
      case 'error':
      case 'turn_context':
      case 'compacted':
        return;
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        this.handleExecItem(record, object.item, object.timestamp);
        return;
      case 'session_meta':
        this.handleSessionMetadata(object.payload ?? object, object.timestamp);
        return;
      case 'response_item':
        this.handleResponseItem(record, object.payload, object.timestamp);
        return;
      case 'event_msg':
        this.handleEventMessage(record, object.payload, object.timestamp);
        return;
      default:
        this.markUnsupported(record, `Unsupported Codex record type: ${diagnosticType(object.type)}`);
    }
  }

  private handleExecItem(record: LocatedRecord, rawItem: unknown, timestamp: unknown): void {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      this.markUnsupported(record, 'Codex item event is missing a structured item.');
      return;
    }
    const item = rawItem as Record<string, any>;
    const normalized = normalizeExecItem(item);
    if (!normalized) {
      // Reasoning, plan, and agent-message items are known but not review tool events.
      if (!['reasoning', 'todo_list', 'agent_message'].includes(String(item.type))) {
        this.markUnsupported(record, `Unsupported Codex item type: ${diagnosticType(item.type)}`);
      }
      return;
    }
    this.addOrUpdate(record, normalized, timestamp ?? item.timestamp);
  }

  private handleResponseItem(record: LocatedRecord, rawPayload: unknown, timestamp: unknown): void {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      this.markUnsupported(record, 'Codex response_item is missing a structured payload.');
      return;
    }
    const payload = rawPayload as Record<string, any>;
    const output = responseOutput(payload);
    if (output) {
      if (!output.callId || !this.mergeResult(output.callId, output.outcome, output.result, record)) {
        this.addDiagnostic({
          code: 'unsupported-signal',
          severity: 'warning',
          message: 'Codex tool output did not match a retained tool call.',
          line: record.line,
        });
      }
      this.noteTimestamp(timestampOf(timestamp));
      return;
    }

    const normalized = normalizeResponseItem(payload);
    if (normalized) {
      this.addOrUpdate(record, normalized, timestamp ?? payload.timestamp);
      return;
    }

    // Messages, reasoning, and compaction records contain no tool operation.
    if (!['message', 'reasoning', 'compaction', 'ghost_snapshot'].includes(String(payload.type))) {
      this.markUnsupported(record, `Unsupported Codex response item: ${diagnosticType(payload.type)}`);
    }
  }

  private addOrUpdate(record: LocatedRecord, item: NormalizedToolItem, timestamp: unknown): void {
    if (item.callId && this.mergeResult(item.callId, item.outcome, item.result, record)) {
      this.noteTimestamp(timestampOf(timestamp));
      return;
    }

    const event = this.addEvent(record, {
      eventId: item.eventId,
      callId: item.callId,
      timestamp,
      toolName: item.toolName,
      input: item.input,
      outcome: item.outcome,
      result: item.result,
    });
    if (event) this.addSkillActivations(record, event, timestamp);
  }

  private mergeResult(callId: string, outcome: ToolOutcome, result: unknown, record: LocatedRecord): boolean {
    const existing = this.events.find((event) => event.callId === callId);
    if (!existing) return false;
    const mergedOutcome = outcome === 'unknown' ? existing.outcome : outcome;
    if (result === undefined) {
      if (outcome !== 'unknown') {
        existing.outcome = outcome;
        existing.resultLocation = {
          line: record.line,
          byteStart: record.byteStart,
          byteEnd: record.byteEnd,
        };
      }
      return true;
    }
    return this.updateResult(callId, mergedOutcome, result, record);
  }

  private addSkillActivations(record: LocatedRecord, toolEvent: AdapterEvent, timestamp: unknown): void {
    const command = commandText(toolEvent.input);
    if (!command) return;
    const names = new Set<string>();
    for (const match of command.matchAll(SKILL_PATH_RE)) names.add(match[1]);
    for (const skillName of names) {
      this.addEvent(record, {
        dedupeKey: `skill:${toolEvent.eventId}:${skillName}`,
        timestamp,
        kind: 'skill_activation',
        toolName: 'skill_activation',
        input: { skillName, evidenceEventId: toolEvent.eventId },
        outcome: 'unknown',
        activation: { skillName, signal: 'heuristic', confidence: 'low' },
      });
    }
  }

  private handleSessionMetadata(rawPayload: unknown, timestamp: unknown): void {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (this.sawCanonicalSessionMetadata) return;
    this.sawCanonicalSessionMetadata = true;
    const payload = rawPayload as Record<string, any>;
    const previous = stringValue(
      payload.continued_from_session_id,
      payload.previous_session_id,
      payload.forked_from_id,
    );
    const sessionId = stringValue(payload.id, payload.thread_id, payload.session_id);
    const logicalSessionId = stringValue(payload.logical_session_id, payload.session_id, sessionId);
    this.setSessionIdentity(sessionId, logicalSessionId);
    this.setContinuation(previous);
    this.setProject(
      payload.cwd ?? payload.project_root,
      payload.project_id ?? payload.project_hash ?? payload.repository_id,
    );
    const version = stringValue(payload.cli_version, payload.format_version, payload.version);
    if (version) this.metadata.formatVersion = version;
    this.noteTimestamp(timestampOf(payload.timestamp ?? timestamp));
  }

  private handleEventMessage(record: LocatedRecord, rawPayload: unknown, timestamp: unknown): void {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    const payload = rawPayload as Record<string, any>;
    if (payload.type === 'item_completed') {
      this.handleExecItem(record, payload.item, timestamp ?? payload.timestamp);
      return;
    }
    const completion = normalizeLegacyCompletion(payload);
    if (completion) {
      this.addOrUpdate(record, completion, timestamp ?? payload.timestamp);
      return;
    }
    if (payload.type !== 'token_count') return;
    const info = payload.info && typeof payload.info === 'object' ? payload.info as Record<string, any> : {};
    const total = info.total_token_usage && typeof info.total_token_usage === 'object'
      ? info.total_token_usage as Record<string, any>
      : null;
    if (total) {
      this.setCumulativeUsage(total);
      return;
    }
    const last = info.last_token_usage && typeof info.last_token_usage === 'object'
      ? info.last_token_usage as Record<string, any>
      : null;
    if (last) this.addUsage(last.input_tokens, last.output_tokens, last.cached_input_tokens);
  }

  private readUsage(rawUsage: unknown): void {
    if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) return;
    const usage = rawUsage as Record<string, any>;
    this.addUsage(
      usage.input_tokens ?? usage.inputTokens,
      usage.output_tokens ?? usage.outputTokens,
      usage.cached_input_tokens ?? usage.cachedInputTokens,
    );
  }

  private setCumulativeUsage(usage: Record<string, any>): void {
    const values = [
      usage.input_tokens ?? usage.inputTokens,
      usage.output_tokens ?? usage.outputTokens,
      usage.cached_input_tokens ?? usage.cachedInputTokens,
    ];
    const keys = ['inputTokens', 'outputTokens', 'cachedInputTokens'] as const;
    keys.forEach((key, index) => {
      const value = values[index];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        this.metadata.usage[key] = value;
      }
    });
  }
}

export function codexReviewAdapterIdentity(format = 'codex-jsonl'): AdapterIdentity {
  return {
    harness: 'codex-cli',
    adapterVersion: ADAPTER_VERSION,
    format,
    formatVersion: null,
    detectionConfidence: 'high',
    capabilities: { ...CODEX_CAPABILITIES },
  };
}
