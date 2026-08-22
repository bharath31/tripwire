import { stableCanonicalize } from '../semantic-signature.js';
import type { ToolOutcome } from '../types.js';
import { BaseReviewAdapter, recordObject, timestampOf } from './base.js';
import type {
  AdapterContext,
  AdapterDetection,
  AdapterOutput,
  LocatedRecord,
} from './types.js';

export const CLAUDE_CODE_REVIEW_FORMAT = 'claude-code-jsonl';

interface PendingResult {
  outcome: ToolOutcome;
  result: unknown;
  record: LocatedRecord;
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

function toolOutcome(block: Record<string, any>): ToolOutcome {
  if (block.is_error === true) return 'error';
  if (block.is_error === false) return 'success';
  if (block.status === 'error' || block.status === 'failed') return 'error';
  if (block.status === 'success' || block.status === 'completed') return 'success';
  return 'unknown';
}

function usageValues(usage: Record<string, any>): [unknown, unknown, unknown] {
  return [
    usage.input_tokens ?? usage.inputTokens,
    usage.output_tokens ?? usage.outputTokens,
    usage.cache_read_input_tokens ?? usage.cached_input_tokens ?? usage.cachedInputTokens,
  ];
}

/** A positive score means the record belongs to Claude Code's local/stream JSONL shape. */
export function detectClaudeCodeRecord(value: unknown): AdapterDetection | null {
  const record = objectValue(value);
  if (!record) return null;
  let score = 0;
  if (record.type === 'assistant' || record.type === 'user') score += 3;
  if (objectValue(record.message) && ('sessionId' in record || 'session_id' in record)) score += 2;
  if (record.type === 'system' && record.subtype === 'init') score += 4;
  const content = objectValue(record.message)?.content;
  if (Array.isArray(content) && content.some((block) => objectValue(block)?.type === 'tool_use')) score += 3;
  return score === 0
    ? null
    : {
        id: 'claude-code',
        format: CLAUDE_CODE_REVIEW_FORMAT,
        score,
        confidence: score >= 4 ? 'high' : 'medium',
      };
}

export class ClaudeCodeReviewAdapter extends BaseReviewAdapter {
  private readonly seenUsageMessages = new Set<string>();
  private readonly pendingResults = new Map<string, PendingResult>();
  private fallbackUsage: [unknown, unknown, unknown] | null = null;
  private fallbackUsageApplied = false;
  private sawMessageUsage = false;

  constructor(context: AdapterContext, format = CLAUDE_CODE_REVIEW_FORMAT) {
    super({
      harness: 'claude-code',
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
        skillActivation: 'structured',
      },
    }, context);
  }

  push(located: LocatedRecord): void {
    const record = recordObject(located);
    if (!record) return;

    this.captureMetadata(record);
    this.noteRecordTimestamp(record.timestamp ?? record.created_at ?? record.createdAt);

    const message = objectValue(record.message);
    if (record.type === 'assistant' && message) {
      this.captureMessageUsage(message, located);
      this.captureAssistantContent(message, record, located);
      return;
    }
    if (record.type === 'user' && message) {
      this.captureToolResults(message, located);
      return;
    }
    if (record.type === 'result') {
      const usage = objectValue(record.usage);
      if (usage) this.fallbackUsage = usageValues(usage);
      return;
    }

    // Progress, rate-limit, queue, and ordinary system records are valid
    // diagnostics around a Claude stream and intentionally produce no event.
  }

  override finish(): AdapterOutput {
    if (!this.sawMessageUsage && this.fallbackUsage && !this.fallbackUsageApplied) {
      this.addUsage(...this.fallbackUsage);
      this.fallbackUsageApplied = true;
    }
    return super.finish();
  }

  private captureMetadata(record: Record<string, any>): void {
    const sessionId = stringValue(record.session_id, record.sessionId);
    const logicalSessionId = stringValue(
      record.logical_session_id,
      record.logicalSessionId,
      sessionId,
    );
    if (sessionId) this.setSessionIdentity(sessionId, logicalSessionId);

    const segmentId = stringValue(record.segment_id, record.segmentId);
    if (segmentId) this.metadata.segmentId = segmentId;
    this.setContinuation(
      stringValue(
        record.continued_from_session_id,
        record.continuedFromSessionId,
        record.resumed_from_session_id,
        record.resumedFromSessionId,
      ),
    );

    const cwd = stringValue(record.cwd, record.project_root, record.projectRoot);
    const project = stringValue(record.project_id, record.projectId);
    if (cwd || project) this.setProject(cwd, project);

    const version = stringValue(record.claude_code_version, record.claudeCodeVersion, record.version);
    if (version) this.metadata.formatVersion = version;
  }

  private noteRecordTimestamp(value: unknown): void {
    const timestamp = timestampOf(value);
    if (!timestamp) return;
    if (!this.metadata.startedAt || timestamp < this.metadata.startedAt) this.metadata.startedAt = timestamp;
    if (!this.metadata.endedAt || timestamp > this.metadata.endedAt) this.metadata.endedAt = timestamp;
  }

  private captureMessageUsage(message: Record<string, any>, located: LocatedRecord): void {
    const usage = objectValue(message.usage);
    if (!usage) return;
    const messageId = stringValue(message.id) ?? `line:${located.line}`;
    if (this.seenUsageMessages.has(messageId)) return;
    this.seenUsageMessages.add(messageId);
    this.sawMessageUsage = true;
    this.addUsage(...usageValues(usage));
  }

  private captureAssistantContent(
    message: Record<string, any>,
    record: Record<string, any>,
    located: LocatedRecord,
  ): void {
    if (!Array.isArray(message.content)) return;
    const messageId = stringValue(message.id);
    for (let index = 0; index < message.content.length; index += 1) {
      const block = objectValue(message.content[index]);
      if (!block || block.type !== 'tool_use') continue;
      const toolName = stringValue(block.name) ?? 'unknown';
      const input = block.input ?? {};
      const callId = stringValue(block.id);
      const fallbackKey = messageId
        ? `message:${messageId}:tool:${index}:${toolName}:${stableCanonicalize(input)}`
        : null;
      const activationName = toolName === 'Skill'
        ? stringValue(objectValue(input)?.skill, objectValue(input)?.name)
        : null;
      const event = this.addEvent(located, {
        eventId: callId ?? (messageId ? `${messageId}:tool:${index}` : null),
        dedupeKey: callId ? `call:${callId}` : fallbackKey,
        timestamp: block.timestamp ?? record.timestamp,
        kind: activationName ? 'skill_activation' : 'tool',
        toolName,
        input,
        callId,
        activation: activationName
          ? { skillName: activationName, signal: 'structured', confidence: 'high' }
          : null,
      });

      if (event && callId) {
        const pending = this.pendingResults.get(callId);
        if (pending) {
          this.updateResult(callId, pending.outcome, pending.result, pending.record);
          this.pendingResults.delete(callId);
        }
      }
      if (toolName === 'Skill' && !activationName) {
        this.addDiagnostic({
          code: 'missing-field',
          severity: 'warning',
          message: 'Claude Code Skill activation is missing a structured skill name.',
          line: located.line,
        });
      }
    }
  }

  private captureToolResults(message: Record<string, any>, located: LocatedRecord): void {
    if (!Array.isArray(message.content)) return;
    for (const value of message.content) {
      const block = objectValue(value);
      if (!block || block.type !== 'tool_result') continue;
      const callId = stringValue(block.tool_use_id, block.toolUseId);
      if (!callId) {
        this.addDiagnostic({
          code: 'missing-field',
          severity: 'warning',
          message: 'Claude Code tool result is missing its tool-use ID.',
          line: located.line,
        });
        continue;
      }
      const pending = { outcome: toolOutcome(block), result: block.content, record: located };
      if (!this.updateResult(callId, pending.outcome, pending.result, located)) {
        this.pendingResults.set(callId, pending);
      }
    }
  }
}
