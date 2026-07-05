// Pure OG-card logic — produces HTML strings that workers-og (satori) renders
// to PNG in the route handler (../api/og.ts). No workers-og import here, so
// this stays importable in plain vitest without the WASM dependency.

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

export type Status = 'pass' | 'warn' | 'fail';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

export interface OgParams {
  skill: string;
  status: Status;
  errors: number;
  warnings: number;
  hasResult: boolean; // false when no skill/status params → render the brand card
}

export function parseParams(url: string): OgParams {
  const { searchParams } = new URL(url);
  const status = searchParams.get('status');
  return {
    skill: (searchParams.get('skill') || 'skill').slice(0, 60),
    status: status === 'fail' || status === 'warn' ? status : 'pass',
    errors: Number.parseInt(searchParams.get('errors') || '0', 10) || 0,
    warnings: Number.parseInt(searchParams.get('warnings') || '0', 10) || 0,
    hasResult: searchParams.has('skill') || searchParams.has('status'),
  };
}

// The brand card — used for the landing page's own og:image (no params).
export function buildBrandHtml(): string {
  return `<div style="display:flex;flex-direction:column;justify-content:center;width:1200px;height:630px;padding:80px;background:${COLORS.bg};font-family:sans-serif">
  <div style="display:flex;align-items:center;margin-bottom:40px">
    <div style="display:flex;width:20px;height:20px;border-radius:9999px;background:${COLORS.accent};margin-right:16px"></div>
    <div style="display:flex;font-size:32px;color:${COLORS.text}">tripwire</div>
  </div>
  <div style="display:flex;font-size:66px;color:${COLORS.text};font-weight:700;line-height:1.1">The quality gate for Agent Skills</div>
  <div style="display:flex;font-size:30px;color:${COLORS.muted};margin-top:28px">Lint · activation coverage · CI checks — does your skill trip on the right prompts?</div>
</div>`;
}

// The per-result verdict card — used by the playground's "share card" button.
export function buildCardHtml(skill: string, status: Status, errors: number, warnings: number): string {
  const verdict = statusCopy(status, errors, warnings);
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:72px;background:${COLORS.bg};font-family:sans-serif">
  <div style="display:flex;align-items:center">
    <div style="display:flex;width:16px;height:16px;border-radius:9999px;background:${COLORS.accent};margin-right:14px"></div>
    <div style="display:flex;font-size:28px;color:${COLORS.text}">tripwire</div>
  </div>
  <div style="display:flex;flex-direction:column">
    <div style="display:flex;font-size:56px;color:${COLORS.text};font-weight:600">${escapeHtml(skill)}</div>
    <div style="display:flex;align-items:center;margin-top:28px;padding:24px 32px;border-radius:16px;border:1px solid ${COLORS.border};background:${COLORS.panel}">
      <div style="display:flex;font-size:40px;color:${verdict.color};margin-right:20px">${verdict.icon}</div>
      <div style="display:flex;font-size:30px;color:${COLORS.text}">${escapeHtml(verdict.label)}</div>
    </div>
  </div>
  <div style="display:flex;font-size:24px;color:${COLORS.muted}">tripwire.bharath.sh — the quality gate for Agent Skills</div>
</div>`;
}
