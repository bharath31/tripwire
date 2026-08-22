import { parseFrontmatter } from '../../src/frontmatter';
import { builtInRules } from '../../src/lint/built-in-rules';
import { runRules } from '../../src/lint/registry';
import type { LintResult } from '../../src/types';

/**
 * Browser-side lint entrypoint. Splits a raw SKILL.md into frontmatter + body
 * (mirroring the CLI's gray-matter parse with a lightweight regex) and runs the
 * exact same pure `lint()` rules the CLI uses — bundled to the browser, no
 * server, no API key.
 */
export function lintSource(raw: string): LintResult {
  const parsed = parseFrontmatter(raw);
  return runRules(
    { frontmatter: parsed.data, body: parsed.content.trim(), filePath: 'playground' },
    builtInRules,
  );
}

export type { LintResult };
