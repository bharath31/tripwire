// Encodes/decodes playground state into a URL hash fragment so a lint result
// is a link, not a screenshot. UTF-8 safe base64url — works in the browser
// (btoa/atob + TextEncoder/TextDecoder) and in Node 18+ for tests.

export function encodeShareState(raw) {
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShareState(encoded) {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildShareUrl(raw, baseUrl) {
  const base = baseUrl ?? (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  return `${base}#s=${encodeShareState(raw)}`;
}

export function readShareStateFromHash(hash) {
  const h = hash ?? (typeof location !== 'undefined' ? location.hash : '');
  const match = h.match(/(?:^#|&)s=([^&]+)/);
  if (!match) return null;
  try {
    return decodeShareState(match[1]);
  } catch {
    return null;
  }
}

export function skillNameFrom(raw) {
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return 'skill';
  const name = frontmatter[1].match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return name ? name[1].trim() : 'skill';
}

export function buildShareCardUrl(report, baseUrl) {
  const base = baseUrl ?? (typeof location !== 'undefined' ? location.origin : '');
  const status = report.errors.length > 0 ? 'fail' : report.warnings.length > 0 ? 'warn' : 'pass';
  const params = new URLSearchParams({
    skill: report.skillName || 'skill',
    status,
    errors: String(report.errors.length),
    warnings: String(report.warnings.length),
  });
  return `${base}/api/og?${params.toString()}`;
}
