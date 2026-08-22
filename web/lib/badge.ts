import type { LintResult } from '../../src/types.js';

export const BADGE_COLORS = {
  pass: '#237A52',
  warn: '#A56618',
  fail: '#E5484D',
  unknown: '#747A76',
};

export function badgeMessage(result: LintResult): { message: string; color: string } {
  if (result.errors.length > 0) {
    return { message: `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`, color: BADGE_COLORS.fail };
  }
  if (result.warnings.length > 0) {
    return { message: `${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`, color: BADGE_COLORS.warn };
  }
  return { message: 'passing', color: BADGE_COLORS.pass };
}

export function renderBadgeSvg(label: string, message: string, color: string): string {
  const labelWidth = Math.round(label.length * 6.5) + 20;
  const messageWidth = Math.round(message.length * 6.5) + 20;
  const totalWidth = labelWidth + messageWidth;
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escape(label)}: ${escape(message)}">
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#151817"/><rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/></g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${labelWidth / 2}" y="14">${escape(label)}</text><text x="${labelWidth + messageWidth / 2}" y="14">${escape(message)}</text></g>
</svg>`;
}

export function validGitHubSource(repo: string, path: string, branch: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
    && path.length <= 240
    && !path.startsWith('/')
    && !path.split('/').some(part => part === '..' || part === '')
    && /^[A-Za-z0-9._/-]{1,160}$/.test(path)
    && !path.includes('\\')
    && /^[A-Za-z0-9._/-]{1,160}$/.test(branch)
    && !branch.includes('..')
    && !branch.startsWith('/');
}
