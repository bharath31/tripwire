import type { LintError } from '../types.js';

const PLACEHOLDERS = ['TBD', 'TODO', 'implement later', 'see task'];

export function locateFinding(raw: string, finding: LintError): number {
  const lines = raw.split('\n');

  if (finding.rule.startsWith('name')) {
    const i = lines.findIndex((l) => /^name:/.test(l.trimStart()));
    if (i >= 0) return i + 1;
  }

  if (finding.rule.startsWith('description')) {
    const i = lines.findIndex((l) => /^description:/.test(l.trimStart()));
    if (i >= 0) return i + 1;
  }

  if (finding.rule === 'no-placeholders') {
    const lower = lines.map((l) => l.toLowerCase());
    for (let i = 0; i < lines.length; i++) {
      if (PLACEHOLDERS.some((p) => lower[i].includes(p.toLowerCase()))) return i + 1;
    }
  }

  if (finding.rule === 'no-comment-blocks') {
    let run = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith('//')) {
        run++;
        if (run >= 3) return i - 1; // first line of the 3-line run (1-based via -1 + ... see below)
      } else {
        run = 0;
      }
    }
  }

  // Body rules without a specific anchor → first non-empty line after frontmatter.
  const bodyStart = firstBodyLine(lines);
  if (bodyStart >= 0) return bodyStart + 1;

  return 1;
}

function firstBodyLine(lines: string[]): number {
  let i = 0;
  // skip a leading frontmatter block
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++; // move past closing ---
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  return i < lines.length ? i : -1;
}
