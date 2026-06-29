import { dirname, join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { parseSkill } from '../skill-parser.js';
import { lint } from '../lint/rules.js';
import { getChangedSkillFiles } from './changed-files.js';
import { parsePatterns } from './changed-files.js';
import { emitAnnotations, escapeMessage } from './annotate.js';
import { probeSkill } from './probe.js';
import { renderComment, computeExitCode } from './report.js';
import { upsertStickyComment } from './comment.js';
import { readContext } from './context.js';
import type { SkillReport } from './types.js';

function input(name: string, fallback = ''): string {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? fallback;
}

function bool(name: string): boolean {
  return input(name).toLowerCase() === 'true';
}

async function main(): Promise<void> {
  const cwd = input('working-directory', '.') || '.';
  const patterns = parsePatterns(input('paths', '**/SKILL.md') || '**/SKILL.md');
  const ctx = readContext(process.env, (p) => readFileSync(p, 'utf-8'));

  const changed = getChangedSkillFiles(ctx.base || 'HEAD~1', ctx.head || 'HEAD', patterns, cwd);
  if (changed.length === 0) {
    console.log('::notice::tripwire: no changed skill files');
    return;
  }

  const probeEnabled = bool('probe');
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const reports: SkillReport[] = [];

  for (const rel of changed) {
    const file = join(cwd, rel);
    const raw = readFileSync(file, 'utf-8');
    const skill = await parseSkill(file);
    const skillName = skill.frontmatter.name ?? basename(dirname(file));
    const lintResult = lint(skill);
    emitAnnotations(rel, raw, lintResult);

    const report: SkillReport = { skillName, file: rel, lint: lintResult };

    if (probeEnabled) {
      if (!hasKey) {
        const reason = 'ANTHROPIC_API_KEY not set';
        report.probeSkipped = reason;
        console.log(`::notice::tripwire: probe skipped for ${rel}: ${reason}`);
      } else {
        const scenariosPath = join(dirname(file), 'tripwire-scenarios.yaml');
        if (!existsSync(scenariosPath)) {
          const reason = 'no tripwire-scenarios.yaml (run `tripwire analyze` locally and commit it)';
          report.probeSkipped = reason;
          console.log(`::notice::tripwire: probe skipped for ${rel}: ${reason}`);
        } else {
          report.probe = await probeSkill({
            skillFilePath: file, skillName, scenariosPath, workspace: cwd,
          });
          for (const reg of report.probe.regressions) {
            const msg = escapeMessage(`coverage ${reg.kind} [${reg.zone}]: "${reg.prompt}"`);
            console.log(`::error file=${rel}::${msg}`);
          }
        }
      }
    }

    reports.push(report);
  }

  if (bool('comment') && ctx.prNumber && ctx.token && ctx.repo) {
    const result = await upsertStickyComment({
      token: ctx.token, repo: ctx.repo, prNumber: ctx.prNumber, body: renderComment(reports),
    });
    console.log(`::notice::tripwire: comment ${result}`);
  }

  const code = computeExitCode(reports, bool('fail-on-warning'));
  process.exit(code);
}

main().catch((err) => {
  console.error(`::error::tripwire-action failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
