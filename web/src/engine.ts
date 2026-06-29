import yaml from 'js-yaml';
import { lint } from '../../src/lint/rules';
import type { LintResult } from '../../src/types';

/**
 * Browser-side lint entrypoint. Splits a raw SKILL.md into frontmatter + body
 * (mirroring the CLI's gray-matter parse with a lightweight regex) and runs the
 * exact same pure `lint()` rules the CLI uses — bundled to the browser, no
 * server, no API key.
 */
export function lintSource(raw: string): LintResult {
  const { frontmatter, body } = splitFrontmatter(raw);
  return lint({ frontmatter, body: body.trim(), filePath: 'playground' });
}

function splitFrontmatter(raw: string): {
  frontmatter: Partial<{ name: string; description: string; [k: string]: unknown }>;
  body: string;
} {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: normalized };
  }
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(match[1], { schema: yaml.DEFAULT_SCHEMA });
    if (parsed && typeof parsed === 'object') {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed YAML — treat as no usable frontmatter; the linter will flag the
    // missing name/description rather than crashing the playground.
    frontmatter = {};
  }
  return { frontmatter, body: match[2] };
}

export type { LintResult };
