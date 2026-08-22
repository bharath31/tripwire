import { describe, it, expect } from 'vitest';
import { chmod, mkdtemp, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { findBinaryOnPath, assertAgentBinaryAvailable } from '../../src/adapters/preflight.js';

describe('findBinaryOnPath', () => {
  it('finds a binary in a PATH-style list', async () => {
    const dir = await mkdtemp(join(os.tmpdir(), 'tripwire-pf-'));
    try {
      await symlink(process.execPath, join(dir, 'claude'));
      expect(findBinaryOnPath('claude', `/nonexistent:${dir}`)).toBe(join(dir, 'claude'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when nothing matches', () => {
    expect(findBinaryOnPath('definitely-not-a-real-binary-xyz', '/nonexistent')).toBeNull();
  });

  it('skips empty entries and directories without the binary', async () => {
    const dir = await mkdtemp(join(os.tmpdir(), 'tripwire-pf-'));
    try {
      expect(findBinaryOnPath('claude', `::${dir}::`)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a directory that merely has the binary name', async () => {
    const dir = await mkdtemp(join(os.tmpdir(), 'tripwire-pf-'));
    try {
      await mkdir(join(dir, 'claude'));
      expect(findBinaryOnPath('claude', dir, 'linux')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a non-executable file on POSIX', async () => {
    const dir = await mkdtemp(join(os.tmpdir(), 'tripwire-pf-'));
    try {
      const file = join(dir, 'claude');
      await writeFile(file, '#!/bin/sh\n');
      await chmod(file, 0o644);
      expect(findBinaryOnPath('claude', dir, 'linux')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not split on ":" on win32 — drive letters must survive', async () => {
    const dir = await mkdtemp(join(os.tmpdir(), 'tripwire-pf-'));
    try {
      await symlink(process.execPath, join(dir, 'claude.cmd'));
      // A Windows PATH entry "C:\tools" contains ':' — splitting on it would
      // produce "C" and "\tools", neither of which can hold the binary.
      expect(findBinaryOnPath('claude', `C:\\tools;${dir}`, 'win32')).toBe(join(dir, 'claude.cmd'));
      expect(findBinaryOnPath('claude', `C:\\tools:${dir}`, 'win32')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('splits on ":" on posix', async () => {
    const dir = await mkdtemp(join(os.tmpdir(), 'tripwire-pf-'));
    try {
      await symlink(process.execPath, join(dir, 'claude'));
      expect(findBinaryOnPath('claude', `${dir}:/elsewhere`, 'linux')).toBe(join(dir, 'claude'));
      expect(findBinaryOnPath('claude', `${dir};/elsewhere`, 'linux')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('assertAgentBinaryAvailable', () => {
  it('passes when the agent binary is on PATH', async () => {
    const dir = await mkdtemp(join(os.tmpdir(), 'tripwire-pf-'));
    try {
      await symlink(process.execPath, join(dir, 'claude'));
      expect(() => assertAgentBinaryAvailable('claude', `/x:${dir}`)).not.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each(['claude', 'gemini', 'codex'] as const)('throws with the install command for %s when missing', (agent) => {
    let err: Error | undefined;
    try {
      assertAgentBinaryAvailable(agent, '/nonexistent');
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err!.message).toMatch(new RegExp(`${agent} CLI not found in PATH`));
    expect(err!.message).toContain('npm install -g');
    expect(err!.message).toContain('--agent');
  });
});
