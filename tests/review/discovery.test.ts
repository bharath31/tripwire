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
  truncate,
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
import { DEFAULT_INGESTION_LIMITS } from '../../src/review/ingestion.js';

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
    expect(await selectLatestReady(result)).toEqual({ kind: 'none', paths: [], transcript: null, skipped: [] });
  });

  it('bounds directory depth without hiding shallower candidates', async () => {
    const directory = await temporaryDirectory();
    const shallow = await fixture(
      join(directory, 'shallow.jsonl'),
      '{}\n',
      '2026-08-22T10:00:00.000Z',
    );
    await fixture(
      join(directory, 'one', 'two', 'deep.jsonl'),
      '{}\n',
      '2026-08-22T11:00:00.000Z',
    );

    const result = await discoverRecentRuns({
      roots: [root(directory)],
      limits: { maxDepth: 1 },
    });

    expect(result.transcripts.map((item) => item.path)).toEqual([await realpath(shallow)]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'depth-limit-reached',
      path: join(directory, 'one', 'two'),
    }));
  });

  it('bounds examined entries and retained candidates with explicit diagnostics', async () => {
    const entryDirectory = await temporaryDirectory('tripwire-entry-limit-');
    for (const name of ['a.jsonl', 'b.jsonl', 'c.jsonl']) {
      await fixture(join(entryDirectory, name), '{}\n', '2026-08-22T10:00:00.000Z');
    }
    const entries = await discoverRecentRuns({
      roots: [root(entryDirectory)],
      limits: { maxEntries: 2 },
    });

    expect(entries.transcripts).toHaveLength(2);
    expect(entries.warnings).toContainEqual(expect.objectContaining({ code: 'entry-limit-reached' }));

    const candidateDirectory = await temporaryDirectory('tripwire-candidate-limit-');
    for (const name of ['a.jsonl', 'b.jsonl']) {
      await fixture(join(candidateDirectory, name), '{}\n', '2026-08-22T10:00:00.000Z');
    }
    const candidates = await discoverRecentRuns({
      roots: [root(candidateDirectory)],
      limits: { maxCandidates: 1 },
    });

    expect(candidates.transcripts).toHaveLength(1);
    expect(candidates.warnings).toContainEqual(expect.objectContaining({ code: 'candidate-limit-reached' }));
  });

  it('bounds warning retention and reports how many details were omitted', async () => {
    const directory = await temporaryDirectory();
    for (const name of ['a.jsonl', 'b.jsonl', 'c.jsonl', 'd.jsonl']) {
      await fixture(join(directory, name), '', '2026-08-22T10:00:00.000Z');
    }

    const result = await discoverRecentRuns({
      roots: [root(directory)],
      limits: { maxWarnings: 2 },
    });

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatchObject({ code: 'empty-file', path: join(directory, 'a.jsonl') });
    expect(result.warnings[1]).toMatchObject({ code: 'warnings-truncated' });
    expect(result.warnings[1].message).toContain('3 warnings omitted');
  });

  it('rejects canonical candidates that escape their discovery root', async () => {
    const directory = await temporaryDirectory();
    const projects = join(directory, 'projects');
    const candidate = await fixture(
      join(projects, 'candidate.jsonl'),
      '{}\n',
      '2026-08-22T10:00:00.000Z',
    );
    const outside = await fixture(
      join(directory, 'outside.jsonl'),
      '{}\n',
      '2026-08-22T11:00:00.000Z',
    );
    const fileSystem: DiscoveryFileSystem = {
      ...realFileSystem,
      realpath: async (path) => (
        path === candidate ? realFileSystem.realpath(outside) : realFileSystem.realpath(path)
      ),
    };

    const result = await discoverRecentRuns({ roots: [root(projects)], fileSystem });

    expect(result.transcripts).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'outside-root',
      path: candidate,
    }));
  });

  it('honors cancellation during traversal', async () => {
    const directory = await temporaryDirectory();
    await fixture(join(directory, 'candidate.jsonl'), '{}\n', '2026-08-22T10:00:00.000Z');
    const controller = new AbortController();
    const fileSystem: DiscoveryFileSystem = {
      ...realFileSystem,
      readdir: async (path) => {
        const entries = await realFileSystem.readdir(path);
        controller.abort();
        return entries;
      },
    };

    await expect(discoverRecentRuns({
      roots: [root(directory)],
      fileSystem,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
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

  it('lets explicit transcript paths override discovery', async () => {
    const result = { transcripts: [transcript('/discovered.jsonl', 'claude-code')] };
    expect(await selectLatestReady(result, { explicitPaths: ['/explicit-a', '/explicit-b'] })).toEqual({
      kind: 'explicit',
      paths: ['/explicit-a', '/explicit-b'],
      transcript: null,
      skipped: [],
    });
  });

  it('selects the first ready run, optionally restricted to one adapter', async () => {
    const empty = transcript('/empty.jsonl', 'claude-code', 0);
    const claude = transcript('/claude.jsonl', 'claude-code');
    const codex = transcript('/codex.jsonl', 'codex-cli');
    const result = { transcripts: [empty, claude, codex] };

    const probe = async () => null;
    expect(await selectLatestReady(result, { probe })).toMatchObject({ kind: 'latest', transcript: claude });
    expect(await selectLatestReady(result, { adapter: 'codex-cli', probe }))
      .toMatchObject({ kind: 'latest', transcript: codex });
    expect(await selectLatestReady(result, { adapter: 'gemini-cli', probe }))
      .toEqual({ kind: 'none', paths: [], transcript: null, skipped: [] });
  });

  it('skips a newer unsupported run and reports why it selected the next one', async () => {
    const unsupported = transcript('/newest.jsonl', 'claude-code');
    const ready = transcript('/ready.jsonl', 'claude-code');
    const selection = await selectLatestReady(
      { transcripts: [unsupported, ready] },
      { probe: async (candidate) => candidate === unsupported ? 'unsupported-format' : null },
    );

    expect(selection).toMatchObject({
      kind: 'latest',
      transcript: ready,
      skipped: [{ transcript: unsupported, reason: 'unsupported-format' }],
    });
  });

  it('falls back past newer unsupported and oversized files using the default readiness probe', async () => {
    const directory = await temporaryDirectory();
    const unsupported = await fixture(
      join(directory, 'unsupported.jsonl'),
      '{"hello":"world"}\n',
      '2026-08-22T14:00:00.000Z',
    );
    const oversized = await fixture(
      join(directory, 'oversized.jsonl'),
      '{}\n',
      '2026-08-22T13:00:00.000Z',
    );
    await truncate(oversized, DEFAULT_INGESTION_LIMITS.maxFileBytes + 1);
    const oversizedTimestamp = new Date('2026-08-22T13:00:00.000Z');
    await utimes(oversized, oversizedTimestamp, oversizedTimestamp);
    const ready = await fixture(
      join(directory, 'ready.jsonl'),
      `${JSON.stringify({
        type: 'assistant',
        sessionId: 'ready-session',
        message: {
          id: 'ready-message',
          content: [{
            type: 'tool_use',
            id: 'ready-call',
            name: 'Read',
            input: { file_path: '/repo/README.md' },
          }],
        },
      })}\n`,
      '2026-08-22T12:00:00.000Z',
    );

    const result = await discoverRecentRuns({ roots: [root(directory)] });
    const selection = await selectLatestReady(result);

    expect(selection).toMatchObject({
      kind: 'latest',
      transcript: { path: await realpath(ready) },
      skipped: [
        { transcript: { path: await realpath(unsupported) }, reason: 'unsupported-format' },
        { transcript: { path: await realpath(oversized) }, reason: 'oversized' },
      ],
    });
  });
});
