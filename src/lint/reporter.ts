import chalk from 'chalk';
import type { LintResult } from '../types.js';

export function formatLintResult(skillName: string, result: LintResult): string {
  const lines: string[] = [`${chalk.bold('Linting:')} ${skillName}`];

  for (const err of result.errors) {
    lines.push(`  ${chalk.red('✗')} ${chalk.red(err.rule)}: ${err.message}`);
  }
  for (const warn of result.warnings) {
    lines.push(`  ${chalk.yellow('⚠')} ${chalk.yellow(warn.rule)}: ${warn.message}`);
  }

  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push(`  ${chalk.green('✓')} no issues found`);
  } else {
    const parts: string[] = [];
    if (result.errors.length > 0) {
      parts.push(chalk.red(`${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`));
    }
    if (result.warnings.length > 0) {
      parts.push(chalk.yellow(`${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`));
    }
    lines.push(`\n  ${parts.join(', ')}`);
  }

  return lines.join('\n');
}

export function lintExitCode(result: LintResult): 0 | 1 {
  return result.errors.length > 0 ? 1 : 0;
}
