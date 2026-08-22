import { lintSource } from '../../../src/engine';
import { BADGE_COLORS, badgeMessage, renderBadgeSvg, validGitHubSource } from '@/lib/badge';

export const runtime = 'nodejs';
export const revalidate = 300;

function svgResponse(svg: string, maxAge: number): Response {
  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=60`,
      'x-content-type-options': 'nosniff',
    },
  });
}

function unknownBadge(): Response {
  return svgResponse(renderBadgeSvg('tripwire', 'unknown', BADGE_COLORS.unknown), 60);
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const repo = params.get('repo');
  const path = params.get('path') || 'SKILL.md';
  const branch = params.get('branch') || 'main';
  if (!repo || !validGitHubSource(repo, path, branch)) return unknownBadge();

  try {
    const sourceUrl = new URL(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`);
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(6_000), next: { revalidate: 300 } });
    if (!response.ok) return unknownBadge();
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > 200_000) return unknownBadge();
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 200_000) return unknownBadge();
    const result = badgeMessage(lintSource(raw));
    return svgResponse(renderBadgeSvg('tripwire', result.message, result.color), 300);
  } catch {
    return unknownBadge();
  }
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
