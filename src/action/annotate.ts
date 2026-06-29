import type { LintError, LintResult } from '../types.js';
import { locateFinding } from './locate.js';

export function escapeMessage(msg: string): string {
  return msg.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function formatAnnotation(file: string, line: number, finding: LintError): string {
  const cmd = finding.level === 'error' ? 'error' : 'warning';
  return `::${cmd} file=${file},line=${line},title=tripwire/${finding.rule}::${escapeMessage(finding.message)}`;
}

export function emitAnnotations(
  file: string,
  raw: string,
  result: LintResult,
  log: (s: string) => void = console.log,
): void {
  for (const finding of [...result.errors, ...result.warnings]) {
    log(formatAnnotation(file, locateFinding(raw, finding), finding));
  }
}
