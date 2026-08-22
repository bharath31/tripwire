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
  | 'empty-file';

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
}

export interface LatestReadyOptions {
  /** Explicit CLI operands always take precedence over discovered runs. */
  explicitPaths?: readonly string[];
  adapter?: DiscoveryAdapter;
}

export type LatestReadySelection =
  | { kind: 'explicit'; paths: string[]; transcript: null }
  | { kind: 'latest'; paths: [string]; transcript: DiscoveredTranscript }
  | { kind: 'none'; paths: []; transcript: null };

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
): DiscoveryWarning {
  const suffix = error === undefined ? '' : `: ${errorMessage(error)}`;
  return {
    code,
    path,
    adapter: root.adapter,
    source: root.source,
    message: `${code.replaceAll('-', ' ')}${suffix}`,
  };
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
  relativePath: string,
  fs: DiscoveryFileSystem,
  warnings: DiscoveryWarning[],
): Promise<Candidate | null> {
  try {
    await fs.access(filePath, constants.R_OK);
  } catch (error) {
    warnings.push(warning(root, 'unreadable-file', filePath, error));
    return null;
  }

  let fileStats: Stats;
  try {
    fileStats = await fs.stat(filePath);
  } catch (error) {
    warnings.push(warning(root, 'unreadable-file', filePath, error));
    return null;
  }
  if (!fileStats.isFile()) return null;
  if (fileStats.size === 0) {
    warnings.push(warning(root, 'empty-file', filePath));
    return null;
  }

  let canonicalPath: string;
  try {
    canonicalPath = await fs.realpath(filePath);
  } catch (error) {
    warnings.push(warning(root, 'canonical-path-failed', filePath, error));
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
  fs: DiscoveryFileSystem,
  warnings: DiscoveryWarning[],
): Promise<Candidate[]> {
  let rootStats: Stats;
  try {
    rootStats = await fs.lstat(root.path);
  } catch (error) {
    // Agent CLIs are optional; an absent default location is not actionable.
    if (errorCode(error) === 'ENOENT') return [];
    warnings.push(warning(root, 'unreadable-directory', root.path, error));
    return [];
  }
  if (rootStats.isSymbolicLink()) return [];
  if (!rootStats.isDirectory()) {
    warnings.push(warning(root, 'invalid-root', root.path));
    return [];
  }

  const candidates: Candidate[] = [];

  async function walk(directory: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory);
    } catch (error) {
      warnings.push(warning(root, 'unreadable-directory', directory, error));
      return;
    }

    entries.sort((left, right) => lexicalCompare(left.name, right.name));
    for (const entry of entries) {
      const childPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(childPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = relative(root.path, childPath);
      if (!supportedRelativePath(root.source, relativePath)) continue;
      const candidate = await inspectFile(childPath, root, relativePath, fs, warnings);
      if (candidate) candidates.push(candidate);
    }
  }

  await walk(root.path);
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
  const fs = options.fileSystem ?? nodeFileSystem;
  const warnings: DiscoveryWarning[] = [];
  const roots = [...(options.roots ?? defaultDiscoveryRoots(options))]
    .sort((left, right) => {
      const byAdapter = lexicalCompare(left.adapter, right.adapter);
      if (byAdapter !== 0) return byAdapter;
      const bySource = lexicalCompare(left.source, right.source);
      if (bySource !== 0) return bySource;
      return lexicalCompare(left.path, right.path);
    });

  const candidates: Candidate[] = [];
  for (const root of roots) candidates.push(...await walkRoot(root, fs, warnings));
  candidates.sort(compareCandidates);

  const seen = new Set<string>();
  const transcripts: DiscoveredTranscript[] = [];
  for (const { mtimeMs: _mtimeMs, ...candidate } of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    transcripts.push(candidate);
  }

  return { transcripts, warnings };
}

/** Resolve CLI transcript operands without allowing discovery to override intent. */
export function selectLatestReady(
  result: Pick<DiscoveryResult, 'transcripts'>,
  options: LatestReadyOptions = {},
): LatestReadySelection {
  if (options.explicitPaths && options.explicitPaths.length > 0) {
    return {
      kind: 'explicit',
      paths: [...options.explicitPaths],
      transcript: null,
    };
  }

  const transcript = result.transcripts.find((candidate) => (
    candidate.size > 0 && (!options.adapter || candidate.adapter === options.adapter)
  ));
  if (!transcript) return { kind: 'none', paths: [], transcript: null };
  return { kind: 'latest', paths: [transcript.path], transcript };
}
