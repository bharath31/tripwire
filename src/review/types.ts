/**
 * Public, harness-neutral contracts for the experimental run-review workflow.
 *
 * These types intentionally remain separate from `TranscriptResult`, which is
 * the much smaller activation-only contract used by Tripwire's probe runner.
 */

export const REVIEW_SCHEMA_VERSION = '1.0' as const;
export const SEMANTIC_SIGNATURE_VERSION = '1' as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ReviewHarness = 'claude-code' | 'codex-cli' | 'gemini-cli' | 'openai';
export type Confidence = 'high' | 'medium' | 'low';
export type ToolOutcome = 'success' | 'error' | 'unknown';
export type CapabilityLevel = 'structured' | 'heuristic' | 'unavailable';
export type OperationKind = 'read' | 'mutation' | 'verification' | 'other' | 'unknown';

export interface AdapterCapabilities {
  toolCalls: CapabilityLevel;
  toolResults: CapabilityLevel;
  timestamps: CapabilityLevel;
  usage: CapabilityLevel;
  mutations: CapabilityLevel;
  skillActivation: CapabilityLevel;
}

export interface AdapterIdentity {
  harness: ReviewHarness;
  adapterVersion: string;
  format: string;
  formatVersion: string | null;
  detectionConfidence: Confidence;
  capabilities: AdapterCapabilities;
}

/** A compact pointer to evidence; it never includes transcript contents. */
export interface EvidenceRef {
  sourceId: string;
  sessionId: string;
  eventId: string;
  sequence: number;
  line: number;
  byteStart?: number;
  byteEnd?: number;
}

export interface SemanticSignature {
  version: typeof SEMANTIC_SIGNATURE_VERSION;
  /** Domain-separated SHA-256 digest of `canonical`. */
  digest: string;
  /** Stable JSON used for exact grouping and debugging local results. */
  canonical: string;
  /** Bounded, control-character-free local display text. */
  display: string;
  subject: string | null;
  operationKind: OperationKind;
  confidence: Confidence;
}

export interface ResultSummary {
  /** UTF-8 byte length when a result was available, otherwise null. */
  sizeBytes: number | null;
  /** Domain-separated content digest; raw result content is never retained. */
  fingerprint: string | null;
}

export interface OperationState {
  /** Assigned by mutation-aware analysis. Adapters initialize this to zero. */
  epoch: number;
  /** Exact file/tree/repository subject when it is known. */
  subject: string | null;
  confidence: Confidence;
}

export interface SkillActivation {
  skillName: string;
  signal: 'structured' | 'heuristic';
  confidence: Confidence;
}

export interface NormalizedEvent {
  id: string;
  sequence: number;
  timestamp: string | null;
  kind: 'tool' | 'skill_activation';
  toolName: string;
  /** Complete structured input as emitted by the supported adapter. */
  input: JsonValue;
  callId: string | null;
  signature: SemanticSignature;
  outcome: ToolOutcome;
  result: ResultSummary;
  operation: OperationKind;
  operationConfidence: Confidence;
  state: OperationState;
  activation: SkillActivation | null;
  evidence: EvidenceRef;
}

export type ParseDiagnosticCode =
  | 'invalid-json'
  | 'unsupported-record'
  | 'unsupported-signal'
  | 'missing-field'
  | 'truncated-input'
  | 'retention-limit';

export interface ParseDiagnostic {
  code: ParseDiagnosticCode;
  severity: 'warning' | 'error';
  message: string;
  line: number | null;
  count?: number;
}

export interface TranscriptSource {
  id: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface ProjectIdentity {
  /** Stable local identifier; it may be a digest when a repository path is used. */
  id: string | null;
  root: string | null;
  source: 'transcript' | 'path' | 'unknown';
  confidence: Confidence;
}

export interface SessionUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

export interface SessionStats {
  recordsSeen: number;
  invalidRecords: number;
  unsupportedRecords: number;
  toolEventsSeen: number;
  retainedEvents: number;
  droppedEvents: number;
}

export interface NormalizedSession {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION;
  /** Physical segment identity from the transcript or a stable source digest. */
  sessionId: string;
  /** Shared across resumed transcript segments when the harness exposes it. */
  logicalSessionId: string;
  segmentId: string;
  continuedFromSessionId: string | null;
  source: TranscriptSource;
  project: ProjectIdentity;
  adapter: AdapterIdentity;
  startedAt: string | null;
  endedAt: string | null;
  usage: SessionUsage;
  events: NormalizedEvent[];
  diagnostics: ParseDiagnostic[];
  stats: SessionStats;
}

export function unavailableCapabilities(): AdapterCapabilities {
  return {
    toolCalls: 'unavailable',
    toolResults: 'unavailable',
    timestamps: 'unavailable',
    usage: 'unavailable',
    mutations: 'unavailable',
    skillActivation: 'unavailable',
  };
}
