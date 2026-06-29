import { describe, it, expect, vi } from 'vitest';
import { upsertStickyComment, MARKER } from '../../src/action/comment.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('upsertStickyComment', () => {
  it('creates a new comment when none with the marker exists', async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' });
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse([]); // no existing comments
      return jsonResponse({ id: 1 }, 201);
    });
    const r = await upsertStickyComment({
      token: 't', repo: 'o/r', prNumber: 7, body: 'hello', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe('created');
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toContain('/repos/o/r/issues/7/comments');
  });

  it('updates the existing marked comment', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return jsonResponse([{ id: 42, body: `old ${MARKER}` }]);
      }
      return jsonResponse({ id: 42 });
    });
    const r = await upsertStickyComment({
      token: 't', repo: 'o/r', prNumber: 7, body: 'updated', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe('updated');
    const patchCall = (fetchImpl.mock.calls as unknown[][]).find(
      ([, init]) => (init as RequestInit)?.method === 'PATCH',
    );
    expect(String(patchCall?.[0])).toContain('/repos/o/r/issues/comments/42');
  });

  it('returns skipped (does not throw) when the API rejects writes', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse([]);
      return jsonResponse({ message: 'Resource not accessible' }, 403);
    });
    const r = await upsertStickyComment({
      token: 't', repo: 'o/r', prNumber: 7, body: 'x', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toBe('skipped');
  });

  it('always includes the marker in the posted body', async () => {
    let sentBody = '';
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse([]);
      sentBody = JSON.parse(String(init?.body)).body;
      return jsonResponse({ id: 1 }, 201);
    });
    await upsertStickyComment({
      token: 't', repo: 'o/r', prNumber: 1, body: 'no marker here', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(sentBody).toContain(MARKER);
  });
});
