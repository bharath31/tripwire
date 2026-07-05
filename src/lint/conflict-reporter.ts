import chalk from 'chalk';
import type { ConflictReport } from './conflicts.js';

export function formatConflictReport(scanned: number, report: ConflictReport): string {
  const lines: string[] = [chalk.bold(`Scanned ${scanned} skill${scanned === 1 ? '' : 's'} for conflicts`)];

  if (report.nameCollisions.length === 0 && report.descriptionOverlaps.length === 0) {
    lines.push(`  ${chalk.green('✓')} no conflicts found`);
    return lines.join('\n');
  }

  if (report.nameCollisions.length > 0) {
    lines.push('');
    lines.push(chalk.bold(chalk.red('Name collisions (same `name`, different files):')));
    for (const c of report.nameCollisions) {
      lines.push(`  ${chalk.red('✗')} "${c.name}" — ${c.files.join(', ')}`);
    }
  }

  if (report.descriptionOverlaps.length > 0) {
    lines.push('');
    lines.push(chalk.bold(chalk.yellow('Description overlaps (may shadow or fight each other):')));
    for (const o of report.descriptionOverlaps) {
      const pct = Math.round(o.score * 100);
      lines.push(`  ${chalk.yellow('⚠')} "${o.a.name}" ↔ "${o.b.name}" (${pct}% shared trigger words: ${o.sharedTriggerWords.join(', ')})`);
      lines.push(`     ${chalk.dim(o.a.filePath)} / ${chalk.dim(o.b.filePath)}`);
    }
  }

  return lines.join('\n');
}

// Mirrors lintExitCode's error/warning split: a name collision is a hard,
// unambiguous bug (two skills can't share an id) and fails the command.
// A description overlap is advisory — skills can legitimately share some
// trigger vocabulary and still be correctly disambiguated in practice — so
// it's surfaced but doesn't fail by default.
export function conflictExitCode(report: ConflictReport): 0 | 1 {
  return report.nameCollisions.length > 0 ? 1 : 0;
}
