import { load, dump } from 'js-yaml';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

/**
 * Minimal front-matter parser replacing the gray-matter dependency, with
 * matching semantics for the inputs this repo sees:
 *
 * - a UTF-8 BOM is stripped
 * - front matter opens with `---` at byte 0 (a `----` line is content, not a
 *   delimiter) and closes at the next `\n---`
 * - an optional language tag (`--- yaml`) is accepted; anything but
 *   yaml/yml throws, like gray-matter's engine lookup did
 * - a missing closing fence means `content` is empty and everything after
 *   the opener was the block
 * - comment-only or empty blocks parse to `{}` (js-yaml v5 throws on empty
 *   input, so that path is guarded here)
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const input = raw.replace(/^\uFEFF/, '');
  if (input === '') return { data: {}, content: '' };
  if (!input.startsWith('---') || input.charAt(3) === '-') {
    return { data: {}, content: input };
  }

  let str = input.slice(3);
  // gray-matter treats any non-empty first line after the opener as a
  // language tag ("--- yaml"); only yaml/yml have engines here.
  const nl = str.search(/\r?\n/);
  const firstLine = nl === -1 ? str : str.slice(0, nl);
  const langName = firstLine.trim();
  if (langName !== '') {
    const lower = langName.toLowerCase();
    if (lower !== 'yaml' && lower !== 'yml') {
      throw new Error(`unsupported front-matter language "${langName}" (expected yaml)`);
    }
    str = str.slice(firstLine.length);
  }

  const closeIndex = str.indexOf('\n---');
  const hasClose = closeIndex !== -1;
  const block = hasClose ? str.slice(0, closeIndex) : str;

  let data: Record<string, unknown> = {};
  // Mirror gray-matter's emptiness check (comment lines don't count), then
  // parse the raw block — js-yaml handles comments itself.
  const nonEmpty = block.replace(/^[ \t]*#[^\n]*\n?/gm, '').trim();
  if (nonEmpty !== '') {
    const loaded = load(block);
    if (loaded != null) {
      data = loaded as Record<string, unknown>;
    }
  }

  let content: string;
  if (!hasClose) {
    content = '';
  } else {
    content = str.slice(closeIndex + '\n---'.length);
    if (content.startsWith('\r')) content = content.slice(1);
    if (content.startsWith('\n')) content = content.slice(1);
  }

  return { data, content };
}

function newline(str: string): string {
  return str.slice(-1) !== '\n' ? str + '\n' : str;
}

/**
 * Serialize front matter back to a document, byte-compatible with
 * gray-matter's `stringify(content, data)`: fenced block first (skipped when
 * there is nothing to write), then the body with a guaranteed trailing
 * newline.
 */
export function stringifyFrontmatter(data: Record<string, unknown>, content: string): string {
  let buf = '';
  const block = dump(data ?? {}).trim();
  if (block !== '{}') {
    buf += newline('---');
    buf += newline(block);
    buf += newline('---');
  }
  return buf + newline(content);
}
