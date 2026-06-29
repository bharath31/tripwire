export const MARKER = '<!-- tripwire -->';

interface UpsertOpts {
  token: string;
  repo: string; // "owner/name"
  prNumber: number;
  body: string;
  fetchImpl?: typeof fetch;
}

const API = 'https://api.github.com';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'tripwire-action',
  };
}

export async function upsertStickyComment(opts: UpsertOpts): Promise<'created' | 'updated' | 'skipped'> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = opts.body.includes(MARKER) ? opts.body : `${opts.body}\n\n${MARKER}`;

  try {
    let marked: { id: number; body?: string } | undefined;
    let page = 1;
    while (!marked) {
      const listRes = await fetchImpl(
        `${API}/repos/${opts.repo}/issues/${opts.prNumber}/comments?per_page=100&page=${page}`,
        { method: 'GET', headers: headers(opts.token) },
      );
      if (!listRes.ok) break;
      const comments = (await listRes.json()) as Array<{ id: number; body?: string }>;
      marked = comments.find((c) => (c.body ?? '').includes(MARKER));
      if (comments.length < 100) break; // last page reached
      page++;
    }

    if (marked) {
      const res = await fetchImpl(`${API}/repos/${opts.repo}/issues/comments/${marked.id}`, {
        method: 'PATCH',
        headers: headers(opts.token),
        body: JSON.stringify({ body }),
      });
      return res.ok ? 'updated' : 'skipped';
    }

    const res = await fetchImpl(`${API}/repos/${opts.repo}/issues/${opts.prNumber}/comments`, {
      method: 'POST',
      headers: headers(opts.token),
      body: JSON.stringify({ body }),
    });
    return res.ok ? 'created' : 'skipped';
  } catch {
    return 'skipped';
  }
}
