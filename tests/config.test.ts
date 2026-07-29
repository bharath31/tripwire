import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { loadConfig, defaultConfig } from '../src/config.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(os.tmpdir(), 'tripwire-config-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('returns defaultConfig when no tripwire.yaml found', async () => {
    const config = await loadConfig(tmpDir);
    expect(config).toEqual(defaultConfig);
  });

  it('merges yaml values over defaults', async () => {
    await writeFile(join(tmpDir, 'tripwire.yaml'), 'model: claude-opus-4-8\n');
    const config = await loadConfig(tmpDir);
    expect(config.model).toBe('claude-opus-4-8');
    expect(config.judge_model).toBe(defaultConfig.judge_model);
  });

  it('merges nested probe_count values', async () => {
    await writeFile(join(tmpDir, 'tripwire.yaml'), 'probe_count:\n  core: 3\n');
    const config = await loadConfig(tmpDir);
    expect(config.probe_count.core).toBe(3);
    expect(config.probe_count.adjacent).toBe(defaultConfig.probe_count.adjacent);
  });

  it('uses process.cwd() when no arg given', async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
  });

  it('discovers a repository-level config from a nested skill directory', async () => {
    const nested = join(tmpDir, 'skills', 'review');
    await mkdir(nested, { recursive: true });
    await writeFile(join(tmpDir, 'tripwire.yaml'), 'agent: codex\n');
    expect((await loadConfig(nested)).agent).toBe('codex');
  });

  it('rejects a non-mapping config instead of silently using defaults', async () => {
    await writeFile(join(tmpDir, 'tripwire.yaml'), '- not\n- a\n- mapping\n');
    await expect(loadConfig(tmpDir)).rejects.toThrow('expected a YAML mapping');
  });

  it('rejects unsafe or malformed probe counts', async () => {
    await writeFile(join(tmpDir, 'tripwire.yaml'), 'probe_count:\n  core: 1000\n');
    await expect(loadConfig(tmpDir)).rejects.toThrow('probe_count.core must be an integer from 0 to 100');
  });
});
