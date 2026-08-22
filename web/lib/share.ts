export const MAX_SHARE_BYTES = 16_384;

export type ShareReadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; value: string }
  | { kind: 'invalid'; reason: 'corrupt' | 'oversized' };

export function encodeShareState(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  if (bytes.byteLength > MAX_SHARE_BYTES) throw new Error('share-too-large');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShareState(encoded: string): string {
  if (encoded.length > Math.ceil(MAX_SHARE_BYTES * 1.4)) throw new Error('share-too-large');
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('share-corrupt');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytes.byteLength > MAX_SHARE_BYTES) throw new Error('share-too-large');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function buildShareUrl(raw: string, baseUrl?: string): string {
  const base = baseUrl ?? (typeof location === 'undefined' ? '' : location.origin + location.pathname);
  return `${base}#s=${encodeShareState(raw)}`;
}

export function readShareState(hash?: string): ShareReadResult {
  const value = hash ?? (typeof location === 'undefined' ? '' : location.hash);
  const match = value.match(/(?:^#|&)s=([^&]+)/);
  if (!match) return { kind: 'empty' };
  try {
    return { kind: 'ok', value: decodeShareState(match[1]) };
  } catch (error) {
    return { kind: 'invalid', reason: error instanceof Error && error.message === 'share-too-large' ? 'oversized' : 'corrupt' };
  }
}

export function skillNameFrom(raw: string): string {
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) return 'skill';
  const name = frontmatter[1].match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  return name ? name[1].trim().slice(0, 60) : 'skill';
}

export function buildShareCardUrl(
  report: { skillName: string; errors: unknown[]; warnings: unknown[] },
  baseUrl?: string,
): string {
  const base = baseUrl ?? (typeof location === 'undefined' ? '' : location.origin);
  const status = report.errors.length > 0 ? 'fail' : report.warnings.length > 0 ? 'warn' : 'pass';
  const params = new URLSearchParams({
    skill: report.skillName || 'skill',
    status,
    errors: String(report.errors.length),
    warnings: String(report.warnings.length),
  });
  return `${base}/api/og?${params.toString()}`;
}
