import chalk from 'chalk';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import type { ProbeResult, LintResult, CoverageReport, ScenariosFile, ProbeZone } from '../types.js';

export function buildCoverageReport(
  skillName: string,
  lintResult: LintResult,
  results: ProbeResult[],
): CoverageReport {
  const forZone = (z: ProbeZone) => results.filter(r => r.prompt.zone === z);
  const zones: CoverageReport['zones'] = {
    core:     zoneStats(forZone('core')),
    adjacent: zoneStats(forZone('adjacent')),
    negative: zoneStats(forZone('negative')),
    variants: zoneStats(forZone('variants')),
  };

  // Only average real scores (1-10). A judge score of 0 signals a parse
  // failure, not "terrible adherence" — including it would skew the mean.
  const scored = results.filter(r => r.transcript.activated && r.judge && (r.judge.score ?? 0) > 0);
  const qualityScore = scored.length > 0
    ? scored.reduce((s, r) => s + (r.judge?.score ?? 0), 0) / scored.length
    : 0;

  const gaps = results.filter(r => !r.transcript.activated && r.prompt.zone !== 'negative');
  const falsePositives = results.filter(r => r.transcript.activated && r.prompt.zone === 'negative');
  const suggestions = buildSuggestions(gaps, falsePositives);

  return { skillName, lintResult, results, zones, qualityScore, gaps, falsePositives, suggestions };
}

function zoneStats(rs: ProbeResult[]) {
  return { activated: rs.filter(r => r.transcript.activated).length, total: rs.length };
}

function buildSuggestions(gaps: ProbeResult[], falsePositives: ProbeResult[]): string[] {
  const out: string[] = [];
  if (gaps.some(g => g.prompt.zone === 'variants')) {
    out.push('Add synonyms and keyword variants to description to capture paraphrase triggers');
  }
  if (gaps.some(g => g.prompt.zone === 'adjacent')) {
    out.push('Description may not cover adjacent use cases — expand intent coverage');
  }
  if (gaps.some(g => g.prompt.zone === 'core')) {
    out.push(`${gaps.filter(g => g.prompt.zone === 'core').length} core trigger(s) missed — review description specificity`);
  }
  if (falsePositives.length > 0) {
    out.push('Add explicit prohibition for off-topic tasks in skill body or description');
  }
  return out;
}

export function renderCoverageReport(report: CoverageReport): string {
  const D = '─'.repeat(45);
  const lines: string[] = ['', chalk.bold(D), chalk.bold(`Coverage Report: ${report.skillName}`), chalk.bold(D), ''];

  lines.push(zoneLine('Core triggers',    report.zones.core));
  lines.push(zoneLine('Adjacent/edge',    report.zones.adjacent));
  lines.push(zoneLine('Negatives',        report.zones.negative, true));
  lines.push(zoneLine('Keyword variants', report.zones.variants));
  lines.push('');
  // Only meaningful when sessions were actually judged (the `analyze` path).
  // The `test` CI path does no judging, so suppress rather than show "0.0/10".
  const wasJudged = report.results.some(r => r.judge && (r.judge.score ?? 0) > 0);
  if (wasJudged) {
    lines.push(`Quality score (activated sessions):  ${chalk.bold(report.qualityScore.toFixed(1))}/10`);
    lines.push('');
  }

  if (report.gaps.length > 0) {
    lines.push(chalk.bold(`─ GAPS ${'─'.repeat(38)}`));
    for (const g of report.gaps) {
      lines.push(`${chalk.red('✗')} "${g.prompt.prompt}"    [${g.prompt.zone} — miss]`);
    }
    lines.push('');
  }

  if (report.falsePositives.length > 0) {
    lines.push(chalk.bold(`─ FALSE POSITIVES ${'─'.repeat(27)}`));
    for (const fp of report.falsePositives) {
      lines.push(`${chalk.red('✗')} "${fp.prompt.prompt}" [negative — triggered]`);
    }
    lines.push('');
  }

  if (report.suggestions.length > 0) {
    lines.push(chalk.bold(`─ OPTIMIZATION SUGGESTIONS ${'─'.repeat(18)}`));
    report.suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }

  return lines.join('\n');
}

function zoneLine(
  label: string,
  stats: { activated: number; total: number },
  negative = false,
): string {
  if (stats.total === 0) return `${label.padEnd(22)} (none)`;
  const pct = Math.round((stats.activated / stats.total) * 100);
  // For negative prompts the desired outcome is the opposite: low activation
  // is good (the skill correctly stayed out of off-topic prompts).
  const good = negative ? pct <= 15 : pct >= 80;
  const icon = good ? chalk.green('✓') : chalk.yellow('⚠');
  return `${label.padEnd(22)} ${stats.activated}/${stats.total} activated   (${pct}%) ${icon}`;
}

export async function exportScenarios(report: CoverageReport, skillFilePath: string): Promise<string> {
  const file: ScenariosFile = {
    skillName: report.skillName,
    generatedAt: new Date().toISOString(),
    scenarios: report.results.map(r => ({
      prompt: r.prompt.prompt,
      zone: r.prompt.zone,
      expectedActivation: r.prompt.zone !== 'negative',
    })),
  };
  const outputPath = join(dirname(skillFilePath), 'tripwire-scenarios.yaml');
  await writeFile(outputPath, yaml.dump(file), 'utf-8');
  return outputPath;
}
