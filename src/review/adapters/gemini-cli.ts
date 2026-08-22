import { BaseReviewAdapter, recordObject, timestampOf } from './base.js';
import type { AdapterContext, AdapterOutput, LocatedRecord } from './types.js';
import type { AdapterCapabilities, AdapterIdentity, SkillActivation, ToolOutcome } from '../types.js';

const ADAPTER_VERSION = '1';

const GEMINI_CAPABILITIES: AdapterCapabilities = {
  toolCalls: 'structured',
  toolResults: 'structured',
  timestamps: 'structured',
  usage: 'structured',
  mutations: 'structured',
  skillActivation: 'structured',
};

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function explicitOutcome(value: Record<string, any>): ToolOutcome {
  if (value.error !== undefined && value.error !== null) return 'error';
  const exitCode = Object.hasOwn(value, 'exit_code') ? value.exit_code : value.exitCode;
  if (typeof exitCode === 'number' && Number.isFinite(exitCode)) return exitCode === 0 ? 'success' : 'error';

  const status = typeof value.status === 'string' ? value.status.toLowerCase() : null;
  if (status && ['success', 'succeeded', 'completed', 'complete', 'done'].includes(status)) return 'success';
  if (status && ['error', 'failed', 'failure', 'cancelled', 'canceled', 'rejected'].includes(status)) return 'error';
  return 'unknown';
}

function diagnosticType(value: unknown): string {
  if (typeof value !== 'string') return value === undefined || value === null ? 'missing' : typeof value;
  const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?').slice(0, 120);
  return sanitized || 'missing';
}

function objectValue(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function activationFor(toolName: string, input: unknown): SkillActivation | null {
  if (toolName !== 'activate_skill') return null;
  const object = objectValue(input);
  const skillName = stringValue(object?.name, object?.skill, object?.skillName);
  return skillName ? { skillName, signal: 'structured', confidence: 'high' } : null;
}

function usageFields(value: Record<string, any>): [unknown, unknown, unknown] {
  return [
    value.input_tokens ?? value.inputTokens ?? value.prompt_tokens ?? value.promptTokenCount ?? value.input,
    value.output_tokens ?? value.outputTokens ?? value.candidates_tokens ?? value.candidatesTokenCount ?? value.output,
    value.cached_input_tokens ?? value.cachedInputTokens ?? value.cached_tokens ?? value.cachedContentTokenCount ?? value.cached,
  ];
}

interface BufferedSavedMessage {
  message: Record<string, any>;
  record: LocatedRecord;
}

interface SavedToolCall {
  id: string | null;
  name: string;
  input: unknown;
  result: unknown;
  outcome: ToolOutcome;
  timestamp: unknown;
}

function normalizeSavedToolCall(raw: Record<string, any>, fallbackTimestamp: unknown): SavedToolCall | null {
  const functionCall = objectValue(raw.functionCall) ?? objectValue(raw.function_call);
  const call = functionCall ?? raw;
  const name = stringValue(call.name, call.toolName, call.tool_name);
  if (!name) return null;
  const resultContainer = objectValue(raw.functionResponse) ?? objectValue(raw.function_response);
  return {
    id: stringValue(call.id, call.toolCallId, call.tool_call_id, raw.id),
    name,
    input: call.args ?? call.arguments ?? call.parameters ?? call.input ?? {},
    result: raw.result ?? raw.output ?? raw.response ?? resultContainer?.response,
    outcome: explicitOutcome(raw),
    timestamp: raw.timestamp ?? call.timestamp ?? fallbackTimestamp,
  };
}

/** Review adapter for Gemini stream-json and saved-session JSON records. */
export class GeminiCliReviewAdapter extends BaseReviewAdapter {
  private readonly savedMessages = new Map<string, BufferedSavedMessage>();
  private readonly savedMessageOrder: string[] = [];
  private savedMessagesMaterialized = false;

  constructor(context: AdapterContext, format = 'gemini-json') {
    const identity: AdapterIdentity = {
      harness: 'gemini-cli',
      adapterVersion: ADAPTER_VERSION,
      format,
      formatVersion: null,
      detectionConfidence: 'high',
      capabilities: { ...GEMINI_CAPABILITIES },
    };
    super(identity, context);
  }

  push(record: LocatedRecord): void {
    const object = recordObject(record);
    if (!object) {
      this.markUnsupported(record, 'Gemini record is not a JSON object.');
      return;
    }
    const metadataUpdate = objectValue(object.$set);
    if (metadataUpdate) {
      this.handleSavedMetadata(record, metadataUpdate);
      if (Array.isArray(metadataUpdate.messages)) this.replaceSavedMessages(record, metadataUpdate.messages);
      return;
    }

    if (typeof object.$rewindTo === 'string') {
      this.rewindSavedMessages(object.$rewindTo);
      return;
    }

    if (Array.isArray(object.messages) || object.sessionId || object.session_id) {
      this.handleSavedSession(record, object);
      return;
    }

    if (typeof object.id === 'string' && ['message', 'user', 'gemini', 'info', 'error', 'warning'].includes(String(object.type))) {
      this.bufferSavedMessage(record, object);
      return;
    }

    this.noteTimestamp(timestampOf(object.timestamp ?? object.createdAt));

    switch (object.type) {
      case 'init':
        this.setSessionIdentity(object.session_id ?? object.sessionId);
        this.setProject(object.cwd ?? object.projectPath, object.projectHash ?? object.project_id);
        if (typeof object.version === 'string') this.metadata.formatVersion = object.version;
        return;
      case 'tool_use':
        this.addToolCall(record, {
          id: stringValue(object.tool_id, object.id),
          name: stringValue(object.tool_name, object.name) ?? 'unknown',
          input: object.parameters ?? object.args ?? object.input ?? {},
          result: undefined,
          outcome: explicitOutcome(object),
          timestamp: object.timestamp,
        });
        return;
      case 'tool_result':
        this.handleToolResult(record, object, object.timestamp);
        return;
      case 'result':
        this.readUsage(object.stats ?? object.usage);
        return;
      case 'message':
      case 'user':
      case 'gemini':
        this.handleSavedMessage(record, object);
        return;
      default:
        this.markUnsupported(record, `Unsupported Gemini record type: ${diagnosticType(object.type)}`);
    }
  }

  override finish(): AdapterOutput {
    if (!this.savedMessagesMaterialized) {
      for (const id of this.savedMessageOrder) {
        const buffered = this.savedMessages.get(id);
        if (buffered) this.handleSavedMessage(buffered.record, buffered.message);
      }
      this.savedMessagesMaterialized = true;
    }
    return super.finish();
  }

  private handleSavedSession(record: LocatedRecord, session: Record<string, any>): void {
    this.handleSavedMetadata(record, session);
    if (Array.isArray(session.messages)) this.replaceSavedMessages(record, session.messages);
  }

  private handleSavedMetadata(_record: LocatedRecord, session: Record<string, any>): void {
    const metadata = objectValue(session.metadata) ?? {};
    const previous = stringValue(
      session.continuedFromSessionId,
      session.previousSessionId,
      metadata.continuedFromSessionId,
      metadata.previousSessionId,
    );
    const sessionId = stringValue(session.sessionId, session.session_id, session.id, metadata.sessionId);
    this.setSessionIdentity(
      sessionId,
      session.logicalSessionId ?? metadata.logicalSessionId ?? previous ?? sessionId,
    );
    this.setContinuation(previous);
    const directories = Array.isArray(session.directories)
      ? session.directories
      : Array.isArray(metadata.directories)
        ? metadata.directories
        : [];
    this.setProject(
      session.projectPath ?? session.cwd ?? metadata.projectPath ?? metadata.cwd
        ?? directories.find((value: unknown) => typeof value === 'string'),
      session.projectHash ?? session.projectId ?? metadata.projectHash ?? metadata.projectId,
    );
    const version = stringValue(session.version, session.formatVersion, metadata.version, metadata.cliVersion);
    if (version) this.metadata.formatVersion = version;
    this.noteTimestamp(timestampOf(session.startTime ?? session.createdAt ?? metadata.startTime));
    this.noteTimestamp(timestampOf(session.lastUpdated ?? session.updatedAt ?? metadata.lastUpdated));
    this.readUsage(session.usage ?? session.tokens ?? metadata.usage);
  }

  private replaceSavedMessages(record: LocatedRecord, rawMessages: unknown[]): void {
    this.savedMessages.clear();
    this.savedMessageOrder.length = 0;
    rawMessages.forEach((rawMessage, index) => {
      const message = objectValue(rawMessage);
      if (message) this.bufferSavedMessage(record, message, `checkpoint:${record.line}:${index}`);
    });
  }

  private bufferSavedMessage(record: LocatedRecord, message: Record<string, any>, fallbackId?: string): void {
    const id = stringValue(message.id) ?? fallbackId ?? `line:${record.line}`;
    if (!this.savedMessages.has(id)) this.savedMessageOrder.push(id);
    this.savedMessages.set(id, { message, record });
  }

  private rewindSavedMessages(messageId: string): void {
    const index = this.savedMessageOrder.indexOf(messageId);
    const removed = index >= 0
      ? this.savedMessageOrder.splice(index)
      : this.savedMessageOrder.splice(0);
    for (const id of removed) this.savedMessages.delete(id);
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

  private handleSavedMessage(record: LocatedRecord, message: Record<string, any>): void {
    const timestamp = message.timestamp ?? message.createdAt;
    this.noteTimestamp(timestampOf(timestamp));
    this.readUsage(message.usage ?? message.tokens);

    if (Array.isArray(message.toolCalls)) {
      for (const rawCall of message.toolCalls) {
        const callObject = objectValue(rawCall);
        const call = callObject ? normalizeSavedToolCall(callObject, timestamp) : null;
        if (call) this.addToolCall(record, call);
        else this.markUnsupported(record, 'Gemini saved-session toolCall is missing a tool name.');
      }
    }

    const content = objectValue(message.content);
    const parts = Array.isArray(message.parts)
      ? message.parts
      : Array.isArray(message.content)
        ? message.content
        : Array.isArray(content?.parts)
          ? content.parts
          : [];
    for (const rawPart of parts) {
      const part = objectValue(rawPart);
      if (!part) continue;
      const functionResponse = objectValue(part.functionResponse) ?? objectValue(part.function_response);
      if (functionResponse) {
        this.handleToolResult(record, functionResponse, timestamp);
        continue;
      }
      const call = normalizeSavedToolCall(part, timestamp);
      if (call) this.addToolCall(record, call);
    }
  }

  private addToolCall(record: LocatedRecord, call: SavedToolCall): void {
    if (call.id && this.mergeResult(call.id, call.outcome, call.result, record)) {
      this.noteTimestamp(timestampOf(call.timestamp));
      return;
    }
    const activation = activationFor(call.name, call.input);
    if (call.name === 'activate_skill' && !activation) {
      this.addDiagnostic({
        code: 'missing-field',
        severity: 'warning',
        message: 'Gemini activate_skill call is missing the skill name.',
        line: record.line,
      });
    }
    this.addEvent(record, {
      eventId: call.id,
      callId: call.id,
      timestamp: call.timestamp,
      kind: activation ? 'skill_activation' : 'tool',
      toolName: call.name,
      input: call.input,
      outcome: call.outcome,
      result: call.result,
      activation,
    });
  }

  private handleToolResult(record: LocatedRecord, value: Record<string, any>, timestamp: unknown): void {
    const callId = stringValue(value.tool_id, value.toolCallId, value.tool_call_id, value.id);
    const result = value.output ?? value.result ?? value.response;
    const outcome = explicitOutcome(value);
    if (!callId || !this.mergeResult(callId, outcome, result, record)) {
      this.addDiagnostic({
        code: 'unsupported-signal',
        severity: 'warning',
        message: 'Gemini tool result did not match a retained tool call.',
        line: record.line,
      });
    }
    this.noteTimestamp(timestampOf(timestamp));
  }

  private readUsage(rawUsage: unknown): void {
    const usage = objectValue(rawUsage);
    if (!usage) return;
    this.addUsage(...usageFields(usage));
  }
}

export function geminiReviewAdapterIdentity(format = 'gemini-json'): AdapterIdentity {
  return {
    harness: 'gemini-cli',
    adapterVersion: ADAPTER_VERSION,
    format,
    formatVersion: null,
    detectionConfidence: 'high',
    capabilities: { ...GEMINI_CAPABILITIES },
  };
}
