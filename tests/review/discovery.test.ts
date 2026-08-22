import { afterEach, describe, expect, it } from 'vitest';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultDiscoveryRoots,
  discoverRecentRuns,
  selectLatestReady,
  type DiscoveryFileSystem,
  type DiscoveryRoot,
  type DiscoveredTranscript,
} from '../../src/review/discovery.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

async function temporaryDirectory(prefix = 'tripwire-discovery-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  return path;
}

async function fixture(path: string, contents: string, modifiedAt: string): Promise<string> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, contents, 'utf-8');
  const timestamp = new Date(modifiedAt);
  await utimes(path, timestamp, timestamp);
  return path;
}

const realFileSystem: DiscoveryFileSystem = {
  access,
  lstat,
  readdir: (path) => readdir(path, { withFileTypes: true }),
  realpath,
  stat,
};

function root(
  path: string,
  adapter: DiscoveryRoot['adapter'] = 'claude-code',
  source: DiscoveryRoot['source'] = 'claude-projects',
): DiscoveryRoot {
  return { adapter, source, path };
}

describe('recent-run discovery', () => {
  it('discovers the supported default layouts and sorts by mtime then canonical path', async () => {
    const homeDir = await temporaryDirectory();
    const claude = await fixture(
      join(homeDir, '.claude', 'projects', 'project-a', 'nested', 'claude.jsonl'),
      '{"claude":true}\n',
      '2026-08-22T10:00:00.000Z',
    );
    const codex = await fixture(
      join(homeDir, '.codex', 'sessions', '2026', '08', 'codex.jsonl'),
      '{"codex":true}\n',
      '2026-08-22T14:00:00.000Z',
    );
    const archived = await fixture(
      join(homeDir, '.codex', 'archived_sessions', 'archived.jsonl'),
      '{"archived":true}\n',
      '2026-08-22T12:00:00.000Z',
    );
    const geminiJsonl = await fixture(
      join(homeDir, '.gemini', 'tmp', 'project-g', 'chats', 'session-new.jsonl'),
      '{"gemini":true}\n',
      '2026-08-22T13:00:00.000Z',
    );
    const geminiJson = await fixture(
      join(homeDir, '.gemini', 'tmp', 'project-g', 'chats', 'session-old.json'),
      '{"gemini":"old"}\n',
      '2026-08-22T11:00:00.000Z',
    );
    await fixture(
      join(homeDir, '.gemini', 'tmp', 'project-g', 'chats', 'not-a-session.jsonl'),
      '{}\n',
      '2026-08-22T15:00:00.000Z',
    );
    await fixture(
      join(homeDir, '.gemini', 'tmp', 'project-g', 'session-wrong-level.jsonl'),
      '{}\n',
      '2026-08-22T15:00:00.000Z',
    );

    const result = await discoverRecentRuns({ homeDir, env: {} });
    const canonicalClaude = await realpath(claude);
    const canonicalGemini = await realpath(geminiJsonl);
    const canonicalCodex = await realpath(codex);

    expect(result.warnings).toEqual([]);
    expect(result.transcripts.map((item) => item.path)).toEqual(await Promise.all([
      codex, geminiJsonl, archived, geminiJson, claude,
    ].map((path) => realpath(path))));
    expect(result.transcripts.map((item) => item.source)).toEqual([
      'codex-sessions',
      'gemini-chats',
      'codex-archived-sessions',
      'gemini-chats',
      'claude-projects',
    ]);
    expect(result.transcripts.find((item) => item.path === canonicalClaude)).toMatchObject({
      adapter: 'claude-code',
      project: 'project-a',
      mtime: '2026-08-22T10:00:00.000Z',
      size: Buffer.byteLength('{"claude":true}\n'),
    });
    expect(result.transcripts.find((item) => item.path === canonicalGemini)).toMatchObject({
      adapter: 'gemini-cli',
      project: 'project-g',
    });
    expect(result.transcripts.find((item) => item.path === canonicalCodex)?.project).toBeNull();
  });

  it('uses CODEX_HOME and GEMINI_CLI_HOME when building default roots', async () => {
    const homeDir = await temporaryDirectory();
    const codexHome = join(homeDir, 'custom-codex');
    const geminiHome = join(homeDir, 'custom-gemini');
    const codex = await fixture(
      join(codexHome, 'sessions', 'custom.jsonl'),
      '{}\n',
      '2026-08-22T10:00:00.000Z',
    );
    const gemini = await fixture(
      join(geminiHome, 'tmp', 'custom-project', 'chats', 'session-1.json'),
      '{}\n',
      '2026-08-22T11:00:00.000Z',
    );

    const defaults = defaultDiscoveryRoots({
      homeDir,
      env: { CODEX_HOME: codexHome, GEMINI_CLI_HOME: geminiHome },
    });
    expect(defaults.find((item) => item.source === 'codex-sessions')?.path)
      .toBe(join(codexHome, 'sessions'));
    expect(defaults.find((item) => item.source === 'gemini-chats')?.path)
      .toBe(join(geminiHome, 'tmp'));

    const result = await discoverRecentRuns({
      homeDir,
      env: { CODEX_HOME: codexHome, GEMINI_CLI_HOME: geminiHome },
    });
    expect(result.transcripts.map((item) => item.path)).toEqual([
      await realpath(gemini),
      await realpath(codex),
    ]);
  });

  it('does not follow symlink directories, including a symlink supplied as a root', async () => {
    const directory = await temporaryDirectory();
    const projects = join(directory, 'projects');
    const outside = join(directory, 'outside');
    await mkdir(join(projects, 'safe'), { recursive: true });
    await mkdir(outside, { recursive: true });
    const safe = await fixture(
      join(projects, 'safe', 'safe.jsonl'),
      '{}\n',
      '2026-08-22T10:00:00.000Z',
    );
    await fixture(
      join(outside, 'hidden.jsonl'),
      '{}\n',
      '2026-08-22T11:00:00.000Z',
    );
    await symlink(outside, join(projects, 'linked'), 'dir');
    const linkedRoot = join(directory, 'linked-root');
    await symlink(outside, linkedRoot, 'dir');

    const result = await discoverRecentRuns({
      roots: [root(projects), root(linkedRoot)],
    });

    expect(result.transcripts.map((item) => item.path)).toEqual([await realpath(safe)]);
    expect(result.warnings).toEqual([]);
  });

  it('isolates unreadable directories and files as warnings', async () => {
    const directory = await temporaryDirectory();
    const blockedDirectory = join(directory, 'blocked-directory');
    const blockedFile = join(directory, 'blocked-file.jsonl');
    const goodFile = join(directory, 'good.jsonl');
    await mkdir(blockedDirectory, { recursive: true });
    await fixture(join(blockedDirectory, 'hidden.jsonl'), '{}\n', '2026-08-22T12:00:00.000Z');
    await fixture(blockedFile, '{}\n', '2026-08-22T11:00:00.000Z');
    await fixture(goodFile, '{}\n', '2026-08-22T10:00:00.000Z');

    const denied = (message: string) => Object.assign(new Error(message), { code: 'EACCES' });
    const fileSystem: DiscoveryFileSystem = {
      ...realFileSystem,
      access: async (path, mode) => {
        if (path === blockedFile) throw denied('file denied');
        await realFileSystem.access(path, mode);
      },
      readdir: async (path) => {
        if (path === blockedDirectory) throw denied('directory denied');
        return realFileSystem.readdir(path);
      },
    };

    const result = await discoverRecentRuns({
      roots: [root(directory)],
      fileSystem,
    });

    expect(result.transcripts.map((item) => item.path)).toEqual([await realpath(goodFile)]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unreadable-directory', path: blockedDirectory }),
      expect.objectContaining({ code: 'unreadable-file', path: blockedFile }),
    ]));
  });

  it('deduplicates canonical paths and uses the canonical path as the mtime tie-breaker', async () => {
    const directory = await temporaryDirectory();
    const laterPath = await fixture(
      join(directory, 'z.jsonl'),
      '{}\n',
      '2026-08-22T10:00:00.000Z',
    );
    const earlierPath = await fixture(
      join(directory, 'a.jsonl'),
      '{}\n',
      '2026-08-22T10:00:00.000Z',
    );

    const result = await discoverRecentRuns({
      roots: [root(directory), root(directory)],
    });

    expect(result.transcripts.map((item) => item.path)).toEqual([
      await realpath(earlierPath),
      await realpath(laterPath),
    ]);
  });

  it('warns about empty runs and never makes one latest-ready', async () => {
    const directory = await temporaryDirectory();
    const empty = join(directory, 'empty.jsonl');
    await fixture(empty, '', '2026-08-22T10:00:00.000Z');

    const result = await discoverRecentRuns({ roots: [root(directory)] });

    expect(result.transcripts).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'empty-file', path: empty }),
    ]);
    expect(selectLatestReady(result)).toEqual({ kind: 'none', paths: [], transcript: null });
  });
});

describe('latest-ready selection', () => {
  const transcript = (
    path: string,
    adapter: DiscoveredTranscript['adapter'],
    size = 10,
  ): DiscoveredTranscript => ({
    adapter,
    source: adapter === 'claude-code' ? 'claude-projects' : 'codex-sessions',
    project: null,
    path,
    mtime: '2026-08-22T10:00:00.000Z',
    size,
  });

  it('lets explicit transcript paths override discovery', () => {
    const result = { transcripts: [transcript('/discovered.jsonl', 'claude-code')] };
    expect(selectLatestReady(result, { explicitPaths: ['/explicit-a', '/explicit-b'] })).toEqual({
      kind: 'explicit',
      paths: ['/explicit-a', '/explicit-b'],
      transcript: null,
    });
  });

  it('selects the first ready run, optionally restricted to one adapter', () => {
    const empty = transcript('/empty.jsonl', 'claude-code', 0);
    const claude = transcript('/claude.jsonl', 'claude-code');
    const codex = transcript('/codex.jsonl', 'codex-cli');
    const result = { transcripts: [empty, claude, codex] };

    expect(selectLatestReady(result)).toMatchObject({ kind: 'latest', transcript: claude });
    expect(selectLatestReady(result, { adapter: 'codex-cli' }))
      .toMatchObject({ kind: 'latest', transcript: codex });
    expect(selectLatestReady(result, { adapter: 'gemini-cli' }))
      .toEqual({ kind: 'none', paths: [], transcript: null });
  });
});
