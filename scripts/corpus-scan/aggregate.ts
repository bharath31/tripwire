import matter from 'gray-matter';
import { lint } from '../../src/lint/rules.js';
import type { LintResult, ParsedSkill } from '../../src/types.js';

export function lintRaw(raw: string, filePath: string): LintResult {
  const parsed = matter(raw);
  const skill: ParsedSkill = {
    frontmatter: parsed.data as ParsedSkill['frontmatter'],
    body: parsed.content.trim(),
    filePath,
  };
  return lint(skill);
}

export interface CorpusEntry {
  file: string;
  repo: string;
  url: string;
  result: LintResult;
}

export interface CorpusSummary {
  totalScanned: number;
  withErrors: number;
  withWarnings: number;
  clean: number;
  ruleFrequency: Record<string, number>;
  worstOffenders: Array<{ file: string; repo: string; errorCount: number; warningCount: number }>;
}

export function summarize(entries: CorpusEntry[]): CorpusSummary {
  const ruleFrequency: Record<string, number> = {};
  let withErrors = 0;
  let withWarnings = 0;
  let clean = 0;

  for (const e of entries) {
    const { errors, warnings } = e.result;
    if (errors.length > 0) withErrors++;
    else if (warnings.length > 0) withWarnings++;
    else clean++;

    for (const f of [...errors, ...warnings]) {
      ruleFrequency[f.rule] = (ruleFrequency[f.rule] ?? 0) + 1;
    }
  }

  const worstOffenders = [...entries]
    .map((e) => ({ file: e.file, repo: e.repo, errorCount: e.result.errors.length, warningCount: e.result.warnings.length }))
    .sort((a, b) => (b.errorCount * 10 + b.warningCount) - (a.errorCount * 10 + a.warningCount))
    .slice(0, 10);

  return { totalScanned: entries.length, withErrors, withWarnings, clean, ruleFrequency, worstOffenders };
}

export function renderMarkdownReport(summary: CorpusSummary): string {
  const pct = (n: number) => summary.totalScanned === 0 ? '0%' : `${Math.round((n / summary.totalScanned) * 100)}%`;
  const lines: string[] = [
    `# State of Agent Skills — lint scan`,
    ``,
    `Scanned **${summary.totalScanned}** public \`SKILL.md\` files.`,
    ``,
    `| | count | share |`,
    `|---|---|---|`,
    `| Has at least one lint error | ${summary.withErrors} | ${pct(summary.withErrors)} |`,
    `| Warnings only (no errors) | ${summary.withWarnings} | ${pct(summary.withWarnings)} |`,
    `| Fully clean | ${summary.clean} | ${pct(summary.clean)} |`,
    ``,
    `## Rule frequency`,
    ``,
    `| rule | occurrences |`,
    `|---|---|`,
    ...Object.entries(summary.ruleFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([rule, count]) => `| \`${rule}\` | ${count} |`),
  ];
  return lines.join('\n');
}
