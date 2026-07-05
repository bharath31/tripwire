import matter from 'gray-matter';
import { lint } from '../../src/lint/rules.js';
import type { LintResult, ParsedSkill } from '../../src/types.js';

export const config = { runtime: 'edge' };

// Live badge: fetches the raw SKILL.md from GitHub's default branch and lints
// it fresh on every request. No database, no stored state — the badge is only
// ever as stale as the CDN cache TTL below.
const CACHE_SECONDS = 300;

const COLORS = { pass: '#4ade80', warn: '#fbbf24', fail: '#ff4d4d', unknown: '#8b8d9a' };

export function lintRaw(raw: string): LintResult {
  const parsed = matter(raw);
  const skill: ParsedSkill = { frontmatter: parsed.data as ParsedSkill['frontmatter'], body: parsed.content.trim(), filePath: '' };
  return lint(skill);
}

export function badgeMessage(result: LintResult): { message: string; color: string } {
  if (result.errors.length > 0) {
    return { message: `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`, color: COLORS.fail };
  }
  if (result.warnings.length > 0) {
    return { message: `${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`, color: COLORS.warn };
  }
  return { message: 'passing', color: COLORS.pass };
}

// Minimal flat badge in the shields.io visual style — hand-rolled SVG so this
// has no image-rendering dependency (unlike /api/og, which needs @vercel/og
// for a full card; a two-box text badge doesn't).
export function renderBadgeSvg(label: string, message: string, color: string): string {
  const charWidth = 6.5;
  const labelWidth = Math.round(label.length * charWidth) + 20;
  const messageWidth = Math.round(message.length * charWidth) + 20;
  const totalWidth = labelWidth + messageWidth;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${esc(label)}: ${esc(message)}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#0b0c10"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${esc(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${esc(message)}</text>
  </g>
</svg>`;
}

function unknownBadge(): Response {
  const svg = renderBadgeSvg('tripwire', 'unknown', COLORS.unknown);
  return new Response(svg, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const repo = searchParams.get('repo');
  const path = searchParams.get('path') || 'SKILL.md';
  const branch = searchParams.get('branch') || 'main';
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return unknownBadge();

  try {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
    const res = await fetch(rawUrl);
    if (!res.ok) return unknownBadge();

    const raw = await res.text();
    const result = lintRaw(raw);
    const { message, color } = badgeMessage(result);
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
}
