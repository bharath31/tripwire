// Cloudflare Pages Function: GET /api/badge
// Live README badge — fetches a raw SKILL.md from GitHub and lints it fresh on
// every request. No stored state; only as stale as the CDN cache below.
import { lintSource } from '../../src/engine.js';
import { badgeMessage, renderBadgeSvg, COLORS } from '../_lib/badge.js';

const CACHE_SECONDS = 300;

// Minimal Pages Function context — Cloudflare passes more (env, params, …),
// but this handler only needs the request. Typed inline to avoid a hard
// dependency on @cloudflare/workers-types.
interface PagesContext {
  request: Request;
}

function unknownBadge(): Response {
  const svg = renderBadgeSvg('tripwire', 'unknown', COLORS.unknown);
  return new Response(svg, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' },
  });
}

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const { searchParams } = new URL(context.request.url);
  const repo = searchParams.get('repo');
  const path = searchParams.get('path') || 'SKILL.md';
  const branch = searchParams.get('branch') || 'main';
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return unknownBadge();

  try {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
    const res = await fetch(rawUrl);
    if (!res.ok) return unknownBadge();

    const raw = await res.text();
    const { message, color } = badgeMessage(lintSource(raw));
    const svg = renderBadgeSvg('tripwire', message, color);

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      },
    });
  } catch {
    return unknownBadge();
  }
};
