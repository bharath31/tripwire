// Pure badge logic — no Cloudflare/runtime specifics, so it's unit-testable
// in plain vitest. The route handler (../api/badge.ts) is the thin glue.
import type { LintResult } from '../../src/types.js';

export const COLORS = { pass: '#4ade80', warn: '#fbbf24', fail: '#ff4d4d', unknown: '#8b8d9a' };

export function badgeMessage(result: LintResult): { message: string; color: string } {
  if (result.errors.length > 0) {
    return { message: `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`, color: COLORS.fail };
  }
  if (result.warnings.length > 0) {
    return { message: `${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`, color: COLORS.warn };
  }
  return { message: 'passing', color: COLORS.pass };
}

// Minimal flat badge in the shields.io visual style — a hand-rolled SVG string
// so it needs no image-rendering library (a two-box text badge doesn't).
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
