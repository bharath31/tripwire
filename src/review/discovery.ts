import { constants } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import {
  access,
  lstat,
  readdir,
  realpath,
  stat,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ingestTranscript, ReviewInputError } from './ingestion.js';
import type { ReviewHarness } from './types.js';

export type DiscoveryAdapter = Extract<
  ReviewHarness,
  'claude-code' | 'codex-cli' | 'gemini-cli'
>;

export type DiscoverySource =
  | 'claude-projects'
  | 'codex-sessions'
  | 'codex-archived-sessions'
  | 'gemini-chats';

export interface DiscoveryRoot {
  adapter: DiscoveryAdapter;
  source: DiscoverySource;
  path: string;
}

export interface DiscoveredTranscript {
  adapter: DiscoveryAdapter;
  source: DiscoverySource;
  /** Harness-provided project directory identifier when one is available. */
  project: string | null;
  /** Canonical absolute path. */
  path: string;
  /** Filesystem modification time serialized for stable JSON output. */
  mtime: string;
  /** File size in bytes. */
  size: number;
}

export type DiscoveryWarningCode =
  | 'unreadable-directory'
  | 'unreadable-file'
  | 'invalid-root'
  | 'canonical-path-failed'
  | 'empty-file'
  | 'outside-root'
  | 'depth-limit-reached'
  | 'entry-limit-reached'
  | 'candidate-limit-reached'
  | 'warnings-truncated';

export interface DiscoveryWarning {
  code: DiscoveryWarningCode;
  path: string;
  adapter: DiscoveryAdapter;
  source: DiscoverySource;
  message: string;
}

export interface DiscoveryResult {
  transcripts: DiscoveredTranscript[];
  warnings: DiscoveryWarning[];
}

export const DEFAULT_DISCOVERY_LIMITS = Object.freeze({
  /** Directories below a configured root. Root-level files have depth zero. */
  maxDepth: 32,
  /** Directory entries examined across all configured roots. */
  maxEntries: 100_000,
  /** Matching transcript candidates retained before canonical-path deduplication. */
  maxCandidates: 10_000,
  /** Warning records retained, including a warning-truncation summary. */
  maxWarnings: 100,
});

export interface DiscoveryLimits {
  maxDepth: number;
  maxEntries: number;
  maxCandidates: number;
  maxWarnings: number;
}

/** Narrow filesystem seam used to make permission/race failures testable. */
export interface DiscoveryFileSystem {
  access(path: string, mode: number): Promise<void>;
  lstat(path: string): Promise<Stats>;
  readdir(path: string): Promise<Dirent[]>;
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<Stats>;
}

const nodeFileSystem: DiscoveryFileSystem = {
  access,
  lstat,
  readdir: (path) => readdir(path, { withFileTypes: true }),
  realpath,
  stat,
};

export interface DiscoveryOptions {
  /** Supplying roots replaces all default agent locations. */
  roots?: readonly DiscoveryRoot[];
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  fileSystem?: DiscoveryFileSystem;
  limits?: Partial<DiscoveryLimits>;
  signal?: AbortSignal;
}

export interface LatestReadyOptions {
  /** Explicit CLI operands always take precedence over discovered runs. */
  explicitPaths?: readonly string[];
  adapter?: DiscoveryAdapter;
  /** Return null when ready, otherwise a content-free reason for skipping the run. */
  probe?: (transcript: DiscoveredTranscript, signal?: AbortSignal) => Promise<string | null>;
  signal?: AbortSignal;
}

export interface SkippedTranscript {
  transcript: DiscoveredTranscript;
  reason: string;
}

export type LatestReadySelection =
  | { kind: 'explicit'; paths: string[]; transcript: null; skipped: [] }
  | { kind: 'latest'; paths: [string]; transcript: DiscoveredTranscript; skipped: SkippedTranscript[] }
  | { kind: 'none'; paths: []; transcript: null; skipped: SkippedTranscript[] };

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mergedDiscoveryLimits(options: DiscoveryOptions): DiscoveryLimits {
  const limits: DiscoveryLimits = { ...DEFAULT_DISCOVERY_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) {
    const minimum = key === 'maxDepth' ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new RangeError(`review discovery limit ${key} must be a safe integer >= ${minimum}`);
    }
  }
  return limits;
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function isContainedBy(canonicalRoot: string, canonicalPath: string): boolean {
  const scoped = relative(canonicalRoot, canonicalPath);
  return scoped === '' || (
    !isAbsolute(scoped)
    && scoped !== '..'
    && !scoped.startsWith(`..${sep}`)
  );
}

function expandAgentHome(value: string | undefined, homeDir: string, fallback: string): string {
  const selected = value?.trim() || fallback;
  if (selected === '~') return homeDir;
  if (selected.startsWith(`~${sep}`) || selected.startsWith('~/') || selected.startsWith('~\\')) {
    return join(homeDir, selected.slice(2));
  }
  return isAbsolute(selected) ? resolve(selected) : resolve(selected);
}

export function defaultDiscoveryRoots(
  options: Pick<DiscoveryOptions, 'homeDir' | 'env'> = {},
): DiscoveryRoot[] {
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const codexHome = expandAgentHome(env.CODEX_HOME, homeDir, join(homeDir, '.codex'));
  const geminiHome = expandAgentHome(env.GEMINI_CLI_HOME, homeDir, join(homeDir, '.gemini'));

  return [
    {
      adapter: 'claude-code',
      source: 'claude-projects',
      path: join(homeDir, '.claude', 'projects'),
    },
    {
      adapter: 'codex-cli',
      source: 'codex-sessions',
      path: join(codexHome, 'sessions'),
    },
    {
      adapter: 'codex-cli',
      source: 'codex-archived-sessions',
      path: join(codexHome, 'archived_sessions'),
    },
    {
      adapter: 'gemini-cli',
      source: 'gemini-chats',
      path: join(geminiHome, 'tmp'),
    },
  ];
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function warning(
  root: DiscoveryRoot,
  code: DiscoveryWarningCode,
  path: string,
  error?: unknown,
  message?: string,
): DiscoveryWarning {
  const suffix = error === undefined ? '' : `: ${errorMessage(error)}`;
  return {
    code,
    path,
    adapter: root.adapter,
    source: root.source,
    message: message ?? `${code.replaceAll('-', ' ')}${suffix}`,
  };
}

class WarningCollector {
  readonly warnings: DiscoveryWarning[] = [];
  private summaryIndex: number | null = null;
  private omitted = 0;

  constructor(private readonly limit: number) {}

  add(value: DiscoveryWarning): void {
    if (this.summaryIndex !== null) {
      this.omitted += 1;
      this.updateSummary();
      return;
    }
    if (this.warnings.length < this.limit) {
      this.warnings.push(value);
      return;
    }

    // Keep the result bounded while reserving its final slot for an explicit
    // indication that warning details were omitted.
    this.warnings.pop();
    this.omitted = 2;
    this.summaryIndex = this.warnings.length;
    this.warnings.push({
      ...value,
      code: 'warnings-truncated',
      message: '',
    });
    this.updateSummary();
  }

  private updateSummary(): void {
    const summary = this.summaryIndex === null ? undefined : this.warnings[this.summaryIndex];
    if (!summary) return;
    summary.message = `discovery warnings truncated at ${this.limit}; ${this.omitted} warning${this.omitted === 1 ? '' : 's'} omitted`;
  }
}

interface DiscoveryBudget {
  entries: number;
  candidates: number;
  halted: boolean;
  entryLimitReported: boolean;
  candidateLimitReported: boolean;
}

interface DiscoveryContext {
  fs: DiscoveryFileSystem;
  limits: DiscoveryLimits;
  warnings: WarningCollector;
  budget: DiscoveryBudget;
  signal?: AbortSignal;
}

function supportedRelativePath(source: DiscoverySource, relativePath: string): boolean {
  const normalized = relativePath.split(sep).join('/');
  if (source === 'gemini-chats') {
    return /^[^/]+\/chats\/session-[^/]+\.(?:jsonl|json)$/.test(normalized);
  }
  return normalized.endsWith('.jsonl');
}

function projectFromPath(source: DiscoverySource, relativePath: string): string | null {
  if (source !== 'claude-projects' && source !== 'gemini-chats') return null;
  const normalized = relativePath.split(sep).join('/');
  const first = normalized.split('/')[0];
  return first && first !== basename(normalized) ? first : null;
}

interface Candidate extends DiscoveredTranscript {
  mtimeMs: number;
}

async function inspectFile(
  filePath: string,
  root: DiscoveryRoot,
  canonicalRoot: string,
  relativePath: string,
  context: DiscoveryContext,
): Promise<Candidate | null> {
  const { fs, signal, warnings } = context;
  throwIfAborted(signal);
  try {
    await fs.access(filePath, constants.R_OK);
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    warnings.add(warning(root, 'unreadable-file', filePath, error));
    return null;
  }

  let fileStats: Stats;
  try {
    fileStats = await fs.stat(filePath);
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    warnings.add(warning(root, 'unreadable-file', filePath, error));
    return null;
  }
  if (!fileStats.isFile()) return null;
  if (fileStats.size === 0) {
    warnings.add(warning(root, 'empty-file', filePath));
    return null;
  }

  let canonicalPath: string;
  try {
    canonicalPath = resolve(await fs.realpath(filePath));
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    warnings.add(warning(root, 'canonical-path-failed', filePath, error));
    return null;
  }
  if (!isContainedBy(canonicalRoot, canonicalPath)) {
    warnings.add(warning(
      root,
      'outside-root',
      filePath,
      undefined,
      'canonical transcript path escapes its discovery root',
    ));
    return null;
  }

  return {
    adapter: root.adapter,
    source: root.source,
    project: projectFromPath(root.source, relativePath),
    path: canonicalPath,
    mtime: fileStats.mtime.toISOString(),
    mtimeMs: fileStats.mtimeMs,
    size: fileStats.size,
  };
}

async function walkRoot(
  root: DiscoveryRoot,
  context: DiscoveryContext,
): Promise<Candidate[]> {
  const { budget, fs, limits, signal, warnings } = context;
  throwIfAborted(signal);
  if (budget.halted) return [];
  let rootStats: Stats;
  try {
    rootStats = await fs.lstat(root.path);
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    // Agent CLIs are optional; an absent default location is not actionable.
    if (errorCode(error) === 'ENOENT') return [];
    warnings.add(warning(root, 'unreadable-directory', root.path, error));
    return [];
  }
  if (rootStats.isSymbolicLink()) return [];
  if (!rootStats.isDirectory()) {
    warnings.add(warning(root, 'invalid-root', root.path));
    return [];
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = resolve(await fs.realpath(root.path));
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    warnings.add(warning(root, 'canonical-path-failed', root.path, error));
    return [];
  }

  const candidates: Candidate[] = [];

  async function walk(directory: string, depth: number): Promise<void> {
    throwIfAborted(signal);
    if (budget.halted) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory);
      throwIfAborted(signal);
    } catch (error) {
      throwIfAborted(signal);
      warnings.add(warning(root, 'unreadable-directory', directory, error));
      return;
    }

    entries.sort((left, right) => lexicalCompare(left.name, right.name));
    for (const entry of entries) {
      throwIfAborted(signal);
      if (budget.halted) return;
      if (budget.entries >= limits.maxEntries) {
        if (!budget.entryLimitReported) {
          budget.entryLimitReported = true;
          warnings.add(warning(
            root,
            'entry-limit-reached',
            directory,
            undefined,
            `discovery stopped after examining ${limits.maxEntries} directory entries`,
          ));
        }
        budget.halted = true;
        return;
      }
      budget.entries += 1;

      const childPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (depth >= limits.maxDepth) {
          warnings.add(warning(
            root,
            'depth-limit-reached',
            childPath,
            undefined,
            `directory skipped at configured discovery depth ${limits.maxDepth}`,
          ));
          continue;
        }
        await walk(childPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = relative(root.path, childPath);
      if (!supportedRelativePath(root.source, relativePath)) continue;
      const candidate = await inspectFile(childPath, root, canonicalRoot, relativePath, context);
      if (!candidate) continue;
      if (budget.candidates >= limits.maxCandidates) {
        if (!budget.candidateLimitReported) {
          budget.candidateLimitReported = true;
          warnings.add(warning(
            root,
            'candidate-limit-reached',
            childPath,
            undefined,
            `discovery stopped after retaining ${limits.maxCandidates} transcript candidates`,
          ));
        }
        budget.halted = true;
        return;
      }
      budget.candidates += 1;
      candidates.push(candidate);
    }
  }

  await walk(root.path, 0);
  return candidates;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.mtimeMs !== right.mtimeMs) return right.mtimeMs - left.mtimeMs;
  const byPath = lexicalCompare(left.path, right.path);
  if (byPath !== 0) return byPath;
  const byAdapter = lexicalCompare(left.adapter, right.adapter);
  if (byAdapter !== 0) return byAdapter;
  return lexicalCompare(left.source, right.source);
}

export async function discoverRecentRuns(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
  throwIfAborted(options.signal);
  const fs = options.fileSystem ?? nodeFileSystem;
  const limits = mergedDiscoveryLimits(options);
  const warnings = new WarningCollector(limits.maxWarnings);
  const budget: DiscoveryBudget = {
    entries: 0,
    candidates: 0,
    halted: false,
    entryLimitReported: false,
    candidateLimitReported: false,
  };
  const context: DiscoveryContext = {
    fs,
    limits,
    warnings,
    budget,
    signal: options.signal,
  };
  const roots = [...(options.roots ?? defaultDiscoveryRoots(options))]
    .sort((left, right) => {
      const byAdapter = lexicalCompare(left.adapter, right.adapter);
      if (byAdapter !== 0) return byAdapter;
      const bySource = lexicalCompare(left.source, right.source);
      if (bySource !== 0) return bySource;
      return lexicalCompare(left.path, right.path);
    });

  const candidates: Candidate[] = [];
  for (const root of roots) {
    throwIfAborted(options.signal);
    if (budget.halted) break;
    candidates.push(...await walkRoot(root, context));
  }
  candidates.sort(compareCandidates);

  const seen = new Set<string>();
  const transcripts: DiscoveredTranscript[] = [];
  for (const { mtimeMs: _mtimeMs, ...candidate } of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    transcripts.push(candidate);
  }

  return { transcripts, warnings: warnings.warnings };
}

/** Resolve CLI transcript operands without allowing discovery to override intent. */
async function defaultReadinessProbe(
  transcript: DiscoveredTranscript,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    await ingestTranscript(transcript.path, { signal });
    return null;
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof ReviewInputError) return error.code;
    return 'inaccessible';
  }
}

export async function selectLatestReady(
  result: Pick<DiscoveryResult, 'transcripts'>,
  options: LatestReadyOptions = {},
): Promise<LatestReadySelection> {
  throwIfAborted(options.signal);
  if (options.explicitPaths && options.explicitPaths.length > 0) {
    return {
      kind: 'explicit',
      paths: [...options.explicitPaths],
      transcript: null,
      skipped: [],
    };
  }

  const probe = options.probe ?? defaultReadinessProbe;
  const skipped: SkippedTranscript[] = [];
  for (const transcript of result.transcripts) {
    throwIfAborted(options.signal);
    if (options.adapter && transcript.adapter !== options.adapter) continue;
    if (transcript.size <= 0) {
      skipped.push({ transcript, reason: 'empty' });
      continue;
    }
    const reason = await probe(transcript, options.signal);
    throwIfAborted(options.signal);
    if (reason) {
      skipped.push({ transcript, reason });
      continue;
    }
    return { kind: 'latest', paths: [transcript.path], transcript, skipped };
  }
  return { kind: 'none', paths: [], transcript: null, skipped };
}
