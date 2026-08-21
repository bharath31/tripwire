import chalk from 'chalk';
import type { EvalCaseResult } from './types.js';

export function renderEvalReport(skillName: string, results: EvalCaseResult[]): string {
  const lines: string[] = [chalk.bold(`Evaluating: ${skillName}`), ''];

  const passed = results.filter((r) => r.passed).length;

  for (const r of results) {
    const icon = r.passed ? chalk.green('✓') : chalk.red('✗');
    lines.push(`${icon} ${r.case.name}`);

    if (r.infrastructureError) {
      lines.push(`    ${chalk.red('✗')} infrastructure: ${r.infrastructureError}`);
    }

    for (const a of r.assertionResults) {
      if (a.passed) continue;
      const desc = a.assertion.type === 'contains'
        ? `expected output to contain "${a.assertion.value}"`
        : `expected output NOT to contain "${a.assertion.value}"`;
      lines.push(`    ${chalk.red('✗')} ${desc}`);
    }

    if (r.rubricResult && !r.rubricResult.passed) {
      lines.push(`    ${chalk.red('✗')} rubric: ${r.rubricResult.reasoning}`);
    }
    if (r.rubricSkipped) {
      lines.push(`    ${chalk.dim(`⚠ rubric skipped (${r.rubricSkipped})`)}`);
    }
  }

  lines.push('');
  lines.push(`${passed}/${results.length} case${results.length === 1 ? '' : 's'} passed`);

  return lines.join('\n');
}

export function evalExitCode(results: EvalCaseResult[]): 0 | 1 {
  return results.every((r) => r.passed) ? 0 : 1;
}
