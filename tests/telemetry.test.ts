import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import {
  buildTelemetryPayload,
  telemetryDisabled,
  trackBehavioralRun,
} from '../src/telemetry.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('telemetry', () => {
  it('honors the common telemetry opt-out controls', () => {
    expect(telemetryDisabled({ DO_NOT_TRACK: '1' })).toBe(true);
    expect(telemetryDisabled({ TRIPWIRE_TELEMETRY: '0' })).toBe(true);
    expect(telemetryDisabled({ TRIPWIRE_TELEMETRY_DISABLED: '1' })).toBe(true);
  });

  it('creates a stable anonymous local identity without product data', async () => {
    const homeDir = await mkdtemp(join(os.tmpdir(), 'tripwire-telemetry-'));
    dirs.push(homeDir);
    const first = await buildTelemetryPayload('test', 'claude', 'pass', { env: {}, homeDir });
    const second = await buildTelemetryPayload('test', 'claude', 'pass', { env: {}, homeDir });
    expect(first.payload.installation_id).toBe(second.payload.installation_id);
    expect(Object.keys(first.payload).sort()).toEqual([
      'agent', 'command', 'event', 'installation_id', 'outcome', 'source', 'version',
    ]);
    const state = await readFile(join(homeDir, '.config', 'tripwire', 'telemetry.json'), 'utf-8');
    expect(state).not.toContain(first.payload.installation_id);
  });

  it('uses a stable hashed repository ID in GitHub Actions without writing state', async () => {
    const homeDir = await mkdtemp(join(os.tmpdir(), 'tripwire-telemetry-'));
    dirs.push(homeDir);
    const event = await buildTelemetryPayload('action', 'claude', 'pass', {
      env: { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY_ID: '12345' },
      homeDir,
    });
    expect(event.payload.source).toBe('github_action');
    expect(event.payload.installation_id).toMatch(/^[a-f0-9]{32}$/);
    await expect(readFile(join(homeDir, '.config', 'tripwire', 'telemetry.json'))).rejects.toThrow();
  });

  it('does not send an event after opt-out', async () => {
    const fetchImpl = vi.fn();
    await trackBehavioralRun('analyze', 'claude', 'pass', {
      env: { TRIPWIRE_TELEMETRY: '0' },
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never surfaces a telemetry transport failure', async () => {
    const homeDir = await mkdtemp(join(os.tmpdir(), 'tripwire-telemetry-'));
    dirs.push(homeDir);
    await expect(trackBehavioralRun('test', 'claude', 'pass', {
      env: {},
      homeDir,
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
      log: () => {},
    })).resolves.toBeUndefined();
  });
});
