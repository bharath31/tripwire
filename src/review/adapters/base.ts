import { stableCanonicalize, fingerprintResult, toJsonValue } from '../semantic-signature.js';
import type {
  AdapterIdentity,
  ParseDiagnostic,
  SkillActivation,
  ToolOutcome,
} from '../types.js';
import type {
  AdapterContext,
  AdapterEvent,
  AdapterOutput,
  AdapterSessionMetadata,
  LocatedRecord,
  ReviewAdapter,
} from './types.js';

interface AddEventOptions {
  eventId?: string | null;
  dedupeKey?: string | null;
  timestamp?: unknown;
  kind?: AdapterEvent['kind'];
  toolName: string;
  input?: unknown;
  callId?: string | null;
  outcome?: ToolOutcome;
  result?: unknown;
  activation?: SkillActivation | null;
}

function finiteTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function timestampOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let milliseconds: number;
  if (typeof value === 'number') milliseconds = value < 1e12 ? value * 1000 : value;
  else if (typeof value === 'string') milliseconds = Date.parse(value);
  else return null;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function resultSummary(value: unknown) {
  if (value === undefined || value === null) return { sizeBytes: null, fingerprint: null };
  const serialized = typeof value === 'string' ? value : stableCanonicalize(value);
  return {
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
    fingerprint: fingerprintResult(serialized),
  };
}

export abstract class BaseReviewAdapter implements ReviewAdapter {
  readonly identity: AdapterIdentity;
  protected readonly context: AdapterContext;
  protected readonly events: AdapterEvent[] = [];
  protected readonly diagnostics: ParseDiagnostic[] = [];
  protected unsupportedRecords = 0;
  protected metadata: AdapterSessionMetadata;
  private eventsSeen = 0;
  private droppedEvents = 0;
  private readonly eventIndexByCallId = new Map<string, number>();
  private readonly seenEventKeys = new Set<string>();

  constructor(identity: AdapterIdentity, context: AdapterContext) {
    this.identity = identity;
    this.context = context;
    this.metadata = {
      sessionId: context.fallbackSessionId,
      logicalSessionId: context.fallbackSessionId,
      segmentId: context.fallbackSessionId,
      continuedFromSessionId: null,
      projectRoot: context.projectRoot ?? null,
      projectIdentity: null,
      formatVersion: identity.formatVersion,
      startedAt: null,
      endedAt: null,
      usage: { inputTokens: null, outputTokens: null, cachedInputTokens: null },
    };
  }

  abstract push(record: LocatedRecord): void;

  protected addEvent(record: LocatedRecord, options: AddEventOptions): AdapterEvent | null {
    const callId = options.callId ?? null;
    const dedupeKey = options.dedupeKey ?? (callId ? `call:${callId}` : null);
    if (dedupeKey && this.seenEventKeys.has(dedupeKey)) return null;
    if (dedupeKey) this.seenEventKeys.add(dedupeKey);
    this.eventsSeen += 1;
    if (this.events.length >= (this.context.maxEvents ?? Number.POSITIVE_INFINITY)) {
      this.droppedEvents += 1;
      if (this.droppedEvents === 1) {
        this.addDiagnostic({
          code: 'retention-limit',
          severity: 'warning',
          message: 'Event retention limit reached; remaining events were counted but not retained.',
          line: record.line,
        });
      }
      return null;
    }

    const timestamp = timestampOf(options.timestamp);
    this.noteTimestamp(timestamp);
    const sequence = this.events.length;
    const eventId = options.eventId || callId || `${this.context.sourceId}:event:${sequence}`;
    const event: AdapterEvent = {
      eventId,
      sequence,
      timestamp,
      kind: options.kind ?? 'tool',
      toolName: options.toolName || 'unknown',
      input: toJsonValue(options.input ?? {}),
      callId,
      outcome: options.outcome ?? 'unknown',
      result: resultSummary(options.result),
      activation: options.activation ?? null,
      line: record.line,
      byteStart: record.byteStart,
      byteEnd: record.byteEnd,
    };
    this.events.push(event);
    if (callId) this.eventIndexByCallId.set(callId, sequence);
    return event;
  }

  protected updateResult(callId: unknown, outcome: ToolOutcome, result?: unknown): boolean {
    if (typeof callId !== 'string' || callId === '') return false;
    const index = this.eventIndexByCallId.get(callId);
    if (index === undefined) return false;
    const event = this.events[index];
    event.outcome = outcome;
    event.result = resultSummary(result);
    return true;
  }

  protected setSessionIdentity(sessionId: unknown, logicalSessionId?: unknown): void {
    if (typeof sessionId === 'string' && sessionId !== '') {
      this.metadata.sessionId = sessionId;
      this.metadata.segmentId = sessionId;
      this.metadata.logicalSessionId = typeof logicalSessionId === 'string' && logicalSessionId !== ''
        ? logicalSessionId
        : sessionId;
    }
  }

  protected setContinuation(previous: unknown): void {
    if (typeof previous === 'string' && previous !== '') this.metadata.continuedFromSessionId = previous;
  }

  protected setProject(root: unknown, identity?: unknown): void {
    if (typeof root === 'string' && root !== '') this.metadata.projectRoot = root;
    if (typeof identity === 'string' && identity !== '') this.metadata.projectIdentity = identity;
  }

  protected addUsage(input: unknown, output: unknown, cached: unknown): void {
    const next = [finiteTokenCount(input), finiteTokenCount(output), finiteTokenCount(cached)] as const;
    const keys = ['inputTokens', 'outputTokens', 'cachedInputTokens'] as const;
    keys.forEach((key, index) => {
      const value = next[index];
      if (value !== null) this.metadata.usage[key] = (this.metadata.usage[key] ?? 0) + value;
    });
  }

  protected addDiagnostic(diagnostic: ParseDiagnostic): void {
    if (this.diagnostics.length < 50) this.diagnostics.push(diagnostic);
  }

  protected markUnsupported(record: LocatedRecord, message?: string): void {
    this.unsupportedRecords += 1;
    if (message) {
      this.addDiagnostic({
        code: 'unsupported-record',
        severity: 'warning',
        message,
        line: record.line,
      });
    }
  }

  protected noteTimestamp(timestamp: string | null): void {
    if (!timestamp) return;
    if (!this.metadata.startedAt || timestamp < this.metadata.startedAt) this.metadata.startedAt = timestamp;
    if (!this.metadata.endedAt || timestamp > this.metadata.endedAt) this.metadata.endedAt = timestamp;
  }

  finish(): AdapterOutput {
    return {
      identity: { ...this.identity, formatVersion: this.metadata.formatVersion },
      metadata: this.metadata,
      events: this.events,
      diagnostics: this.diagnostics,
      unsupportedRecords: this.unsupportedRecords,
      eventsSeen: this.eventsSeen,
      droppedEvents: this.droppedEvents,
    };
  }
}

export function recordObject(record: LocatedRecord): Record<string, any> | null {
  return record.value !== null && typeof record.value === 'object' && !Array.isArray(record.value)
    ? record.value as Record<string, any>
    : null;
}
