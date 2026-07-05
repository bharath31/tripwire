import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const COLORS = {
  bg: '#0b0c10',
  panel: '#14151c',
  text: '#e9e9ee',
  muted: '#8b8d9a',
  border: '#262833',
  accent: '#ff4d4d',
  green: '#4ade80',
  yellow: '#fbbf24',
};

type Status = 'pass' | 'warn' | 'fail';

// Built as plain satori element objects (not JSX) so this doesn't depend on
// any JSX-compiler config in Vercel's function build step — satori accepts
// this shape natively (https://github.com/vercel/satori#jsx).
function el(type: string, props: Record<string, unknown>, ...children: unknown[]) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

export function statusCopy(status: Status, errors: number, warnings: number): { icon: string; color: string; label: string } {
  if (status === 'fail') {
    const parts = [`${errors} error${errors === 1 ? '' : 's'}`];
    if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
    return { icon: '✗', color: COLORS.accent, label: `${parts.join(', ')} — CI would fail` };
  }
  if (status === 'warn') {
    return { icon: '⚠', color: COLORS.yellow, label: `${warnings} warning${warnings === 1 ? '' : 's'} — passes CI, worth a look` };
  }
  return { icon: '✓', color: COLORS.green, label: 'No issues found — passes every rule' };
}

export function parseParams(url: string): { skill: string; status: Status; errors: number; warnings: number } {
  const { searchParams } = new URL(url);
  const status = searchParams.get('status');
  return {
    skill: (searchParams.get('skill') || 'skill').slice(0, 60),
    status: status === 'fail' || status === 'warn' ? status : 'pass',
    errors: Number.parseInt(searchParams.get('errors') || '0', 10) || 0,
    warnings: Number.parseInt(searchParams.get('warnings') || '0', 10) || 0,
  };
}

export function buildCard(skill: string, status: Status, errors: number, warnings: number) {
  const verdict = statusCopy(status, errors, warnings);

  return el(
    'div',
    {
      style: {
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '72px', background: COLORS.bg, fontFamily: 'sans-serif',
      },
    },
    el(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
      el('div', { style: { width: '16px', height: '16px', borderRadius: '999px', background: COLORS.accent, display: 'flex' } }),
      el('div', { style: { fontSize: '28px', color: COLORS.text, letterSpacing: '-0.02em', display: 'flex' } }, 'tripwire'),
    ),
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '28px' } },
      el(
        'div',
        { style: { fontSize: '56px', color: COLORS.text, fontWeight: 600, letterSpacing: '-0.02em', display: 'flex' } },
        skill,
      ),
      el(
        'div',
        {
          style: {
            display: 'flex', alignItems: 'center', gap: '20px', padding: '24px 32px',
            borderRadius: '16px', border: `1px solid ${COLORS.border}`, background: COLORS.panel,
          },
        },
        el('div', { style: { fontSize: '40px', color: verdict.color, display: 'flex' } }, verdict.icon),
        el('div', { style: { fontSize: '30px', color: COLORS.text, display: 'flex' } }, verdict.label),
      ),
    ),
    el(
      'div',
      { style: { display: 'flex', fontSize: '24px', color: COLORS.muted } },
      'tripwire.bharath.sh — the quality gate for Agent Skills',
    ),
  );
}

export default function handler(req: Request): Response {
  const { skill, status, errors, warnings } = parseParams(req.url);
  return new ImageResponse(buildCard(skill, status, errors, warnings) as never, { width: 1200, height: 630 });
}
