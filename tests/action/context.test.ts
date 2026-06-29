import { describe, it, expect } from 'vitest';
import { readContext, safeSkillName } from '../../src/action/context.js';

describe('readContext', () => {
  it('reads base/head/number from a pull_request event', () => {
    const env = {
      GITHUB_EVENT_PATH: '/fake/event.json',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_TOKEN: 'ghp_tok',
    };
    const event = {
      pull_request: {
        base: { sha: 'base-sha-abc' },
        head: { sha: 'head-sha-def' },
        number: 42,
      },
    };
    const ctx = readContext(env, () => JSON.stringify(event));
    expect(ctx.base).toBe('base-sha-abc');
    expect(ctx.head).toBe('head-sha-def');
    expect(ctx.prNumber).toBe(42);
    expect(ctx.repo).toBe('owner/repo');
    expect(ctx.token).toBe('ghp_tok');
  });

  it('reads base/head from a push event (before/after)', () => {
    const env = {
      GITHUB_EVENT_PATH: '/fake/push.json',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_TOKEN: 'tok',
    };
    const event = { before: 'before-sha', after: 'after-sha' };
    const ctx = readContext(env, () => JSON.stringify(event));
    expect(ctx.base).toBe('before-sha');
    expect(ctx.head).toBe('after-sha');
    expect(ctx.prNumber).toBeNull();
  });

  it('falls back to env vars when GITHUB_EVENT_PATH is unset', () => {
    const env = {
      GITHUB_BASE_REF: 'main',
      GITHUB_HEAD_REF: 'feature-branch',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_TOKEN: 'tok',
    };
    // readEventFile must NOT be called when GITHUB_EVENT_PATH is absent
    const ctx = readContext(env, () => { throw new Error('should not be called'); });
    expect(ctx.base).toBe('main');
    expect(ctx.head).toBe('feature-branch');
    expect(ctx.prNumber).toBeNull();
  });

  it('falls back to env vars when the event file is unreadable', () => {
    const env = {
      GITHUB_EVENT_PATH: '/nonexistent/event.json',
      GITHUB_BASE_REF: 'main',
      GITHUB_HEAD_REF: 'feature',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_TOKEN: 'tok',
    };
    const ctx = readContext(env, () => { throw new Error('ENOENT: no such file'); });
    expect(ctx.base).toBe('main');
    expect(ctx.head).toBe('feature');
    expect(ctx.prNumber).toBeNull();
  });
});

describe('safeSkillName', () => {
  it('leaves a good name unchanged', () => {
    expect(safeSkillName('good-name')).toBe('good-name');
  });

  it('leaves alphanumeric with dots and underscores unchanged', () => {
    expect(safeSkillName('my.skill_v1')).toBe('my.skill_v1');
  });

  it('strips path traversal — no slashes or leading dots in output', () => {
    const result = safeSkillName('../../etc/passwd');
    expect(result).not.toContain('/');
    expect(result).not.toMatch(/^\./);
  });

  it('replaces slashes in a/b style names', () => {
    const result = safeSkillName('a/b');
    expect(result).not.toContain('/');
  });

  it('returns "skill" for an empty string', () => {
    expect(safeSkillName('')).toBe('skill');
  });
});
