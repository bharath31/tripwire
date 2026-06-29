import { MARKER } from './comment.js';
import type { SkillReport } from './types.js';

export function renderComment(reports: SkillReport[]): string {
  const lines: string[] = ['## 🪤 Tripwire', ''];

  const totalErrors = reports.reduce((n, r) => n + r.lint.errors.length, 0);
  const totalWarnings = reports.reduce((n, r) => n + r.lint.warnings.length, 0);
  const totalRegressions = reports.reduce((n, r) => n + (r.probe?.regressions.length ?? 0), 0);

  if (totalErrors === 0 && totalWarnings === 0 && totalRegressions === 0) {
    lines.push('✅ All changed skills passed — no issues found.');
  } else {
    lines.push(
      `Found ${totalErrors} error(s), ${totalWarnings} warning(s), ${totalRegressions} coverage regression(s) across ${reports.length} skill(s).`,
    );
  }
  lines.push('');

  for (const r of reports) {
    lines.push(`### \`${r.file}\``);
    if (r.lint.errors.length === 0 && r.lint.warnings.length === 0) {
      lines.push('- ✅ lint clean');
    } else {
      for (const e of r.lint.errors) lines.push(`- ❌ **${e.rule}** — ${e.message}`);
      for (const w of r.lint.warnings) lines.push(`- ⚠️ **${w.rule}** — ${w.message}`);
    }

    if (r.probeSkipped) {
      lines.push(`- ℹ️ coverage probe skipped: ${r.probeSkipped}`);
    } else if (r.probe) {
      if (r.probe.regressions.length === 0) {
        lines.push(`- ✅ coverage: ${r.probe.results.length} scenario(s), no regressions`);
      } else {
        for (const reg of r.probe.regressions) {
          const label = reg.kind === 'gap' ? 'gap (did not activate)' : 'false positive (activated)';
          lines.push(`- ❌ coverage ${label} [${reg.zone}]: "${reg.prompt}"`);
        }
      }
    }
    lines.push('');
  }

  lines.push(MARKER);
  return lines.join('\n');
}

export function computeExitCode(reports: SkillReport[], failOnWarning: boolean): 0 | 1 {
  for (const r of reports) {
    if (r.lint.errors.length > 0) return 1;
    if (failOnWarning && r.lint.warnings.length > 0) return 1;
    if (r.probe && r.probe.regressions.length > 0) return 1;
  }
  return 0;
}
