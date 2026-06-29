import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
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
    expect(config.thresholds).toEqual(defaultConfig.thresholds);
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
});
