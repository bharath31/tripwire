// Pure logic only — deliberately has zero dependency on the `vscode` module,
// which only exists inside the extension host and can't be imported or run
// in a normal Node/vitest process. extension.ts (which DOES import `vscode`)
// is the thin, untested glue layer; everything worth testing lives here.
import type { LintError, LintResult } from '../../src/types.js';

export type DiagnosticSeverity = 'error' | 'warning';

export interface DiagnosticLike {
  line: number; // 0-indexed
  startCol: number;
  endCol: number;
  message: string;
  rule: string;
  severity: DiagnosticSeverity;
}

const FRONTMATTER_FIELD_RULES: Record<string, string> = {
  'name-present': 'name',
  'name-kebab-case': 'name',
  'description-present': 'description',
  'description-use-when': 'description',
  'description-length': 'description',
  'description-no-workflow': 'description',
};

function findFieldLine(lines: string[], field: string): number | null {
  const re = new RegExp(`^${field}:`);
  const idx = lines.findIndex((l) => re.test(l));
  return idx === -1 ? null : idx;
}

function findBodyStartLine(lines: string[]): number {
  // Body starts after the second `---` frontmatter delimiter.
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      seen++;
      if (seen === 2) return Math.min(i + 1, lines.length - 1);
    }
  }
  return 0; // no frontmatter delimiters found — point at the top of the file
}

function locateLine(documentLines: string[], rule: string): number {
  const field = FRONTMATTER_FIELD_RULES[rule];
  if (field) {
    return findFieldLine(documentLines, field) ?? 0;
  }
  return findBodyStartLine(documentLines);
}

function toDiagnostic(documentLines: string[], entry: LintError): DiagnosticLike {
  const line = locateLine(documentLines, entry.rule);
  const lineText = documentLines[line] ?? '';
  return {
    line,
    startCol: 0,
    endCol: lineText.length,
    message: entry.message,
    rule: entry.rule,
    severity: entry.level,
  };
}

export function lintResultToDiagnostics(documentText: string, result: LintResult): DiagnosticLike[] {
  const lines = documentText.split('\n');
  return [...result.errors, ...result.warnings].map((entry) => toDiagnostic(lines, entry));
}
