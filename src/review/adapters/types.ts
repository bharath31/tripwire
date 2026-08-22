import type {
  AdapterIdentity,
  Confidence,
  JsonValue,
  ParseDiagnostic,
  ResultSummary,
  SkillActivation,
  ToolOutcome,
} from '../types.js';

export interface LocatedRecord {
  value: unknown;
  line: number;
  byteStart: number;
  byteEnd: number;
}

export interface AdapterContext {
  sourceId: string;
  fallbackSessionId: string;
  projectRoot?: string | null;
  maxEvents?: number;
}

export interface AdapterEvent {
  eventId: string;
  sequence: number;
  timestamp: string | null;
  kind: 'tool' | 'skill_activation';
  toolName: string;
  input: JsonValue;
  callId: string | null;
  outcome: ToolOutcome;
  result: ResultSummary;
  activation: SkillActivation | null;
  operationConfidenceHint?: Confidence;
  line: number;
  byteStart: number;
  byteEnd: number;
}

export interface AdapterSessionMetadata {
  sessionId: string;
  logicalSessionId: string;
  segmentId: string;
  continuedFromSessionId: string | null;
  projectRoot: string | null;
  projectIdentity: string | null;
  formatVersion: string | null;
  startedAt: string | null;
  endedAt: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
  };
}

export interface AdapterOutput {
  identity: AdapterIdentity;
  metadata: AdapterSessionMetadata;
  events: AdapterEvent[];
  diagnostics: ParseDiagnostic[];
  unsupportedRecords: number;
  eventsSeen: number;
  droppedEvents: number;
}

export interface ReviewAdapter {
  readonly identity: AdapterIdentity;
  push(record: LocatedRecord): void;
  finish(): AdapterOutput;
}

export interface AdapterDetection {
  id: AdapterIdentity['harness'];
  format: string;
  score: number;
  confidence: Confidence;
}

export type AdapterFactory = (context: AdapterContext, format: string) => ReviewAdapter;
