import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSemanticSignature } from './semantic-signature.js';
import { REVIEW_SCHEMA_VERSION, type NormalizedSession, type ParseDiagnostic } from './types.js';
import { createAdapter, detectAdapter, type AdapterDetection, type LocatedRecord, type ReviewAdapter } from './adapters/index.js';

export const DEFAULT_INGESTION_LIMITS = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  warnFileBytes: 16 * 1024 * 1024,
  maxLineBytes: 4 * 1024 * 1024,
  maxEvents: 50_000,
  detectionRecords: 40,
  maxInvalidFraction: 0.2,
  substantiallyMalformedMinimum: 5,
  maxDiagnostics: 20,
});

export type ReviewInputErrorCode =
  | 'inaccessible'
  | 'not-a-file'
  | 'oversized'
  | 'line-too-large'
  | 'empty'
  | 'unsupported-format'
  | 'substantially-malformed'
  | 'no-tool-calls'
  | 'aborted';

export class ReviewInputError extends Error {
  readonly code: ReviewInputErrorCode;
  readonly sourcePath: string;

  constructor(code: ReviewInputErrorCode, sourcePath: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReviewInputError';
    this.code = code;
    this.sourcePath = sourcePath;
  }
}

export interface IngestionOptions {
  projectRoot?: string | null;
  limits?: Partial<typeof DEFAULT_INGESTION_LIMITS>;
  signal?: AbortSignal;
  onWarning?: (message: string) => void;
}

interface JsonLine {
  raw: string;
  line: number;
  byteStart: number;
  byteEnd: number;
}

function sourceDigest(domain: string, value: string): string {
  return createHash('sha256').update(`tripwire-review-${domain}:v1\0${value}`).digest('hex');
}

function mergedLimits(options: IngestionOptions) {
  const limits = { ...DEFAULT_INGESTION_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`review ingestion limit ${key} must be a positive finite number`);
    }
  }
  if (limits.warnFileBytes > limits.maxFileBytes) limits.warnFileBytes = limits.maxFileBytes;
  if (limits.maxInvalidFraction > 1) {
    throw new Error('review ingestion limit maxInvalidFraction must be at most 1');
  }
  return limits;
}

async function* streamLines(
  sourcePath: string,
  maxLineBytes: number,
  signal?: AbortSignal,
): AsyncGenerator<JsonLine> {
  const input = createReadStream(sourcePath, { highWaterMark: 64 * 1024, signal });
  let carry = Buffer.alloc(0);
  let bytesRead = 0;
  let line = 0;

  for await (const value of input) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const baseOffset = bytesRead - carry.length;
    bytesRead += chunk.length;
    const data = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
    let start = 0;
    let newline: number;
    while ((newline = data.indexOf(0x0a, start)) !== -1) {
      line += 1;
      let end = newline;
      if (end > start && data[end - 1] === 0x0d) end -= 1;
      if (end - start > maxLineBytes) {
        throw new ReviewInputError(
          'line-too-large',
          sourcePath,
          `transcript line ${line} exceeds the ${maxLineBytes}-byte safety limit`,
        );
      }
      yield {
        raw: data.toString('utf8', start, end),
        line,
        byteStart: baseOffset + start,
        byteEnd: baseOffset + end,
      };
      start = newline + 1;
    }
    carry = Buffer.from(data.subarray(start));
    if (carry.length > maxLineBytes) {
      throw new ReviewInputError(
        'line-too-large',
        sourcePath,
        `transcript line ${line + 1} exceeds the ${maxLineBytes}-byte safety limit`,
      );
    }
  }

  if (carry.length > 0) {
    line += 1;
    const baseOffset = bytesRead - carry.length;
    const end = carry.length > 0 && carry[carry.length - 1] === 0x0d ? carry.length - 1 : carry.length;
    yield {
      raw: carry.toString('utf8', 0, end),
      line,
      byteStart: baseOffset,
      byteEnd: baseOffset + end,
    };
  }
}

function actionableError(error: unknown, sourcePath: string): ReviewInputError {
  if (error instanceof ReviewInputError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new ReviewInputError('aborted', sourcePath, `review canceled while reading ${sourcePath}`, { cause: error });
  }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const hint = code === 'EACCES' || code === 'EPERM'
    ? 'permission denied'
    : code === 'ENOENT' ? 'file does not exist' : error instanceof Error ? error.message : String(error);
  return new ReviewInputError('inaccessible', sourcePath, `cannot read transcript ${sourcePath}: ${hint}`, { cause: error });
}

function malformedError(sourcePath: string, invalid: number, records: number): ReviewInputError {
  return new ReviewInputError(
    'substantially-malformed',
    sourcePath,
    `transcript is substantially malformed (${invalid} invalid JSON record${invalid === 1 ? '' : 's'} of ${records})`,
  );
}

export async function ingestTranscript(path: string, options: IngestionOptions = {}): Promise<NormalizedSession> {
  const sourcePath = resolve(path);
  const limits = mergedLimits(options);
  let file;
  try {
    file = await stat(sourcePath);
  } catch (error) {
    throw actionableError(error, sourcePath);
  }
  if (!file.isFile()) {
    throw new ReviewInputError('not-a-file', sourcePath, `transcript path is not a regular file: ${sourcePath}`);
  }
  if (file.size === 0) {
    throw new ReviewInputError('empty', sourcePath, `transcript is empty: ${sourcePath}`);
  }
  if (file.size > limits.maxFileBytes) {
    throw new ReviewInputError(
      'oversized',
      sourcePath,
      `transcript is ${file.size} bytes; the configured maximum is ${limits.maxFileBytes} bytes`,
    );
  }
  if (file.size >= limits.warnFileBytes) {
    options.onWarning?.(
      `large transcript (${file.size} bytes): processing locally with bounded event and line retention`,
    );
  }

  const sourceId = sourceDigest('source', `${sourcePath}\0${file.size}\0${file.mtimeMs}`);
  const fallbackSessionId = sourceDigest('session', sourceId).slice(0, 32);
  const detectionBuffer: LocatedRecord[] = [];
  const ingestionDiagnostics: ParseDiagnostic[] = [];
  const adapterState: { current: ReviewAdapter | null } = { current: null };
  let detection: AdapterDetection | null = null;
  let nonEmptyLines = 0;
  let recordsSeen = 0;
  let invalidRecords = 0;

  const noteInvalid = (line: number) => {
    invalidRecords += 1;
    if (ingestionDiagnostics.length < limits.maxDiagnostics) {
      ingestionDiagnostics.push({
        code: 'invalid-json',
        severity: 'warning',
        message: 'Invalid JSON record skipped.',
        line,
      });
    }
  };

  const startAdapter = () => {
    detection = detectAdapter(detectionBuffer);
    if (!detection) return false;
    if (detection.format.endsWith('-unsupported')) {
      throw new ReviewInputError(
        'unsupported-format',
        sourcePath,
        'OpenAI Responses/Agents traces are not supported; provide documented Chat Completions or role/tool-call JSONL',
      );
    }
    adapterState.current = createAdapter(detection, {
      sourceId,
      fallbackSessionId,
      projectRoot: options.projectRoot,
      maxEvents: limits.maxEvents,
    });
    for (const record of detectionBuffer) adapterState.current.push(record);
    detectionBuffer.length = 0;
    return true;
  };

  try {
    for await (const jsonLine of streamLines(sourcePath, limits.maxLineBytes, options.signal)) {
      const raw = jsonLine.raw.trim();
      if (raw === '') continue;
      nonEmptyLines += 1;
      recordsSeen += 1;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        noteInvalid(jsonLine.line);
        continue;
      }
      const located: LocatedRecord = {
        value,
        line: jsonLine.line,
        byteStart: jsonLine.byteStart,
        byteEnd: jsonLine.byteEnd,
      };
      if (adapterState.current) adapterState.current.push(located);
      else {
        detectionBuffer.push(located);
        if (detectionBuffer.length >= limits.detectionRecords && !startAdapter()) {
          throw new ReviewInputError(
            'unsupported-format',
            sourcePath,
            'unsupported transcript format; expected Claude Code, Codex CLI, Gemini CLI, or documented OpenAI tool-call JSONL',
          );
        }
      }
    }
  } catch (error) {
    throw actionableError(error, sourcePath);
  }

  if (nonEmptyLines === 0) {
    throw new ReviewInputError('empty', sourcePath, `transcript contains no records: ${sourcePath}`);
  }
  const invalidFraction = invalidRecords / recordsSeen;
  if (invalidRecords >= limits.substantiallyMalformedMinimum && invalidFraction > limits.maxInvalidFraction) {
    throw malformedError(sourcePath, invalidRecords, recordsSeen);
  }
  if (!adapterState.current && !startAdapter()) {
    throw new ReviewInputError(
      'unsupported-format',
      sourcePath,
      'unsupported transcript format; expected Claude Code, Codex CLI, Gemini CLI, or documented OpenAI tool-call JSONL',
    );
  }

  const parsed = adapterState.current!.finish();
  if (parsed.eventsSeen === 0) {
    throw new ReviewInputError(
      'no-tool-calls',
      sourcePath,
      `supported ${parsed.identity.harness} transcript contains no reviewable tool calls`,
    );
  }

  const projectRoot = parsed.metadata.projectRoot ?? options.projectRoot ?? null;
  const projectId = parsed.metadata.projectIdentity
    ?? (projectRoot ? sourceDigest('project', resolve(projectRoot)).slice(0, 32) : null);
  const finalSessionId = parsed.metadata.sessionId || fallbackSessionId;
  const events = parsed.events.map((event) => {
    const signature = buildSemanticSignature(event.toolName, event.input, {
      cwd: projectRoot,
      projectRoot,
    });
    return {
      id: event.eventId,
      sequence: event.sequence,
      timestamp: event.timestamp,
      kind: event.kind,
      toolName: event.toolName,
      input: event.input,
      callId: event.callId,
      signature,
      outcome: event.outcome,
      result: event.result,
      operation: signature.operationKind,
      operationConfidence: event.operationConfidenceHint ?? signature.confidence,
      state: { epoch: 0, subject: signature.subject, confidence: signature.confidence },
      activation: event.activation,
      evidence: {
        sourceId,
        sessionId: finalSessionId,
        eventId: event.eventId,
        sequence: event.sequence,
        line: event.line,
        byteStart: event.byteStart,
        byteEnd: event.byteEnd,
      },
    };
  });

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    sessionId: finalSessionId,
    logicalSessionId: parsed.metadata.logicalSessionId || finalSessionId,
    segmentId: parsed.metadata.segmentId || finalSessionId,
    continuedFromSessionId: parsed.metadata.continuedFromSessionId,
    source: {
      id: sourceId,
      path: sourcePath,
      sizeBytes: file.size,
      modifiedAt: Number.isFinite(file.mtimeMs) ? file.mtime.toISOString() : null,
    },
    project: {
      id: projectId,
      root: projectRoot,
      source: parsed.metadata.projectRoot ? 'transcript' : options.projectRoot ? 'path' : 'unknown',
      confidence: parsed.metadata.projectRoot ? 'high' : options.projectRoot ? 'medium' : 'low',
    },
    adapter: {
      ...parsed.identity,
      detectionConfidence: detection!.confidence,
    },
    startedAt: parsed.metadata.startedAt,
    endedAt: parsed.metadata.endedAt,
    usage: parsed.metadata.usage,
    events,
    diagnostics: [...ingestionDiagnostics, ...parsed.diagnostics].slice(0, limits.maxDiagnostics),
    stats: {
      recordsSeen,
      invalidRecords,
      unsupportedRecords: parsed.unsupportedRecords,
      toolEventsSeen: parsed.eventsSeen,
      retainedEvents: parsed.events.length,
      droppedEvents: parsed.droppedEvents,
    },
  };
}

/** Sequential by design: multiple large transcripts must not multiply peak memory. */
export async function ingestTranscripts(paths: string[], options: IngestionOptions = {}): Promise<NormalizedSession[]> {
  const sessions: NormalizedSession[] = [];
  for (const path of paths) sessions.push(await ingestTranscript(path, options));
  return sessions;
}
