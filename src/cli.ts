import { Command } from 'commander';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { dirname, join } from 'node:path';
import { parseSkill, resolveSkillFilePath, resolveLintTargets, discoverSkillFiles } from './skill-parser.js';
import pkg from '../package.json';
import { lint } from './lint/rules.js';
import { formatLintResult, lintExitCode } from './lint/reporter.js';
import { fixSkill } from './lint/fix.js';
import { detectConflicts } from './lint/conflicts.js';
import { formatConflictReport, conflictExitCode } from './lint/conflict-reporter.js';
import { loadLintConfig } from './lint/config.js';
import { loadConfig } from './config.js';
import { generateProbeMatrix } from './analyze/probe-generator.js';
import { runProbes } from './analyze/agent-runner.js';
import { judgeActivatedSessions } from './analyze/judge.js';
import {
  buildCoverageReport,
  renderCoverageReport,
  exportScenarios,
  coverageExitCode,
} from './analyze/coverage-report.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import { GeminiCliAdapter } from './adapters/gemini-cli.js';
import { CodexCliAdapter } from './adapters/codex-cli.js';
import { runScenariosFromFile } from './test/scenario-runner.js';
import { buildInlineScenario } from './test/inline-scenario.js';
import { summarizeDrift, renderDriftSummary } from './test/drift.js';
import type { SkillDriftResult, SkippedSkill } from './test/drift.js';
import { findRepoRoot, scaffoldWorkflow, scaffoldDriftWorkflow } from './init/scaffold.js';
import { runEvalsFromFile } from './eval/eval-runner.js';
import { renderEvalReport, evalExitCode } from './eval/reporter.js';
import { createProbeWorkspace } from './probe-workspace.js';
import { trackBehavioralRun } from './telemetry.js';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { AgentAdapter } from './types.js';

const AGENTS = ['claude', 'gemini', 'codex'] as const;
type AgentName = typeof AGENTS[number];

function assertValidAgent(agent: string): void {
  if (!(AGENTS as readonly string[]).includes(agent)) {
    console.error(chalk.red(`Error: unknown --agent "${agent}" (expected one of: ${AGENTS.join(', ')})`));
    process.exit(1);
  }
}

function resolveAdapter(agent: string, skillName: string, cwd?: string): AgentAdapter {
  switch (agent as AgentName) {
    case 'claude': return new ClaudeCodeAdapter(skillName, { cwd });
    case 'gemini': return new GeminiCliAdapter(skillName, { cwd });
    case 'codex': return new CodexCliAdapter(skillName, { cwd });
  }
}

const program = new Command();

program
  .name('tripwire')
  .description('Lint and coverage-probe Agent Skills')
  .version(pkg.version);

const DEFAULT_SKILLS_DIRS = ['.claude/skills', 'skills', '.agents/skills'];

function findDefaultSkillsDir(): string | undefined {
  return DEFAULT_SKILLS_DIRS.find((d) => existsSync(d));
}

async function runLint(target: string, opts: { fix?: boolean }): Promise<never> {
  let files: string[];
  try {
    files = await resolveLintTargets(target);
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(chalk.red(`Error: no SKILL.md found under ${target}`));
    console.error(chalk.dim('Expected a skill file, or a directory like .claude/skills/<name>/SKILL.md'));
    process.exit(1);
  }

  let exitCode: 0 | 1 = 0;
  let errors = 0;
  let warnings = 0;
  let clean = 0;

  for (const filePath of files) {
    if (opts.fix) {
      const raw = await readFile(filePath, 'utf-8');
      const fixResult = fixSkill(raw);
      if (fixResult.changed) {
        await writeFile(filePath, fixResult.fixed, 'utf-8');
        console.log(chalk.bold('Fixed:'));
        for (const c of fixResult.changes) console.log(`  ${chalk.green('✓')} ${c.message}`);
        console.log('');
      } else if (files.length === 1) {
        console.log(chalk.dim('No auto-fixable issues found.'));
        console.log('');
      }
    }

    let skill;
    try {
      skill = await parseSkill(filePath);
    } catch (err) {
      console.log(`${chalk.bold('Linting:')} ${filePath}`);
      console.log(`  ${chalk.red('✗')} ${chalk.red('parse-error')}: ${err instanceof Error ? err.message : String(err)}`);
      console.log('');
      errors += 1;
      exitCode = 1;
      continue;
    }
    const { ruleConfig, customRules } = await loadLintConfig(dirname(filePath));
    const result = lint(skill, ruleConfig, customRules);
    console.log(formatLintResult(skill.frontmatter.name ?? filePath, result));
    if (files.length > 1) console.log('');
    errors += result.errors.length;
    warnings += result.warnings.length;
    if (result.errors.length === 0 && result.warnings.length === 0) clean += 1;
    if (lintExitCode(result) === 1) exitCode = 1;
  }

  if (files.length > 1) {
    const parts = [
      errors > 0 ? chalk.red(`${errors} error${errors === 1 ? '' : 's'}`) : null,
      warnings > 0 ? chalk.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`) : null,
      chalk.green(`${clean} clean`),
    ].filter(Boolean);
    console.log(`${chalk.bold(`${files.length} skills`)} — ${parts.join(', ')}`);
  }
  process.exit(exitCode);
}

program
  .command('lint [skill-path]')
  .description('Static rules check on a skill file, or every skill under a directory')
  .option('--fix', 'Auto-fix mechanically safe issues (currently: name-kebab-case only)')
  .action(async (skillPath: string | undefined, opts: { fix?: boolean }) => {
    const target = skillPath ?? findDefaultSkillsDir();
    if (!target) {
      console.error(chalk.red('Error: no skill path given and no skills directory found.'));
      console.error(chalk.dim(`Looked for: ${DEFAULT_SKILLS_DIRS.join(', ')} — or pass a path: tripwire lint path/to/SKILL.md`));
      process.exit(1);
    }
    await runLint(target, opts);
  });

program
  .command('conflicts <skills-dir>')
  .description('Scan a directory of skills for name collisions and description overlap')
  .option('--threshold <n>', 'Description-overlap similarity threshold, 0-1', '0.3')
  .action(async (skillsDir: string, opts: { threshold: string }) => {
    const threshold = Number.parseFloat(opts.threshold);
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
      console.error(chalk.red(`Error: --threshold must be a number between 0 and 1, got "${opts.threshold}"`));
      process.exit(1);
    }

    const files = await discoverSkillFiles(skillsDir);
    if (files.length === 0) {
      console.log(chalk.dim(`No SKILL.md files found under ${skillsDir}`));
      return;
    }

    const skills = await Promise.all(files.map((f) => parseSkill(f)));
    const report = detectConflicts(skills, threshold);
    console.log(formatConflictReport(skills.length, report));
    process.exit(conflictExitCode(report));
  });

interface AnalyzeOpts { model?: string; judgeModel?: string; agent?: string }

const warnedUnverifiedAgents = new Set<string>();

function warnIfUnverifiedAgent(agent: string): void {
  if ((agent === 'gemini' || agent === 'codex') && !warnedUnverifiedAgents.has(agent)) {
    warnedUnverifiedAgents.add(agent);
    console.log(chalk.yellow(`⚠ --agent ${agent}: activation detection for this adapter is not verified against a live install`));
    if (agent === 'codex') {
      console.log(chalk.yellow('  (Codex CLI has no dedicated skill event; detection is a heuristic — see src/analyze/codex-transcript-parser.ts)'));
    }
    console.log('');
  }
}

async function runAnalyze(skillPath: string, opts: AnalyzeOpts): Promise<{ exitCode: number; scenariosPath: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('Error: ANTHROPIC_API_KEY environment variable not set'));
    process.exit(1);
  }

  const filePath = await resolveSkillFilePath(skillPath);
  const skill = await parseSkill(filePath);
  const config = await loadConfig(dirname(filePath));
  if (opts.model) config.model = opts.model;
  if (opts.judgeModel) config.judge_model = opts.judgeModel;
  const agent = opts.agent ?? config.agent;
  assertValidAgent(agent);
  warnIfUnverifiedAgent(agent);

  const { ruleConfig, customRules } = await loadLintConfig(dirname(filePath));
  const lintResult = lint(skill, ruleConfig, customRules);
  console.log(formatLintResult(skill.frontmatter.name ?? filePath, lintResult));
  console.log('');

  console.log(chalk.bold('Generating probe matrix...'));
  const matrix = await generateProbeMatrix(skill, config, apiKey);
  console.log(`Generated ${matrix.prompts.length} scenarios across 4 zones`);
  console.log('');

  console.log(chalk.bold(`Running coverage probe (${matrix.prompts.length} scenarios across 4 zones)...`));
  const bar = new cliProgress.SingleBar({
    format: '  {bar} {value}/{total} complete',
    barCompleteChar: '█',
    barIncompleteChar: '░',
  });
  bar.start(matrix.prompts.length, 0);

  const skillName = skill.frontmatter.name ?? 'unknown';
  const probeWorkspace = await createProbeWorkspace(agent, filePath, skillName);
  let probeResults;
  try {
    const adapter = resolveAdapter(agent, skillName, probeWorkspace.cwd);
    probeResults = await runProbes(matrix, adapter, (done) => bar.update(done));
  } finally {
    bar.stop();
    await probeWorkspace.cleanup();
  }

  const activatedCount = probeResults.filter(r => r.transcript.activated).length;
  if (activatedCount > 0) {
    console.log(chalk.bold(`\nJudging ${activatedCount} activated session(s)...`));
    probeResults = await judgeActivatedSessions(probeResults, skill, config, apiKey);
  }

  const report = buildCoverageReport(skillName, lintResult, probeResults);
  console.log(renderCoverageReport(report));

  const scenariosPath = await exportScenarios(report, filePath);
  console.log(chalk.dim(`─ EXPORT ${'─'.repeat(36)}`));
  console.log(`Scenarios saved to ${scenariosPath}`);
  console.log(`Run 'tripwire test ${skillPath}' to rerun without reprobing`);

  await trackBehavioralRun(
    'analyze',
    agent,
    report.infrastructureErrors.length > 0
      ? 'infrastructure_error'
      : coverageExitCode(report) === 1 ? 'behavior_failure' : 'pass',
  );

  return {
    exitCode: lintExitCode(lintResult) || coverageExitCode(report) ? 1 : 0,
    scenariosPath,
  };
}

program
  .command('analyze <skill-path>')
  .description('LLM probe → real agent sessions → coverage map')
  .option('--model <model>', 'Override probe model')
  .option('--judge-model <model>', 'Override judge model')
  .option('--agent <name>', `Agent CLI to probe with: ${AGENTS.join(', ')} (defaults to tripwire.yaml)`)
  .action(async (skillPath: string, opts: AnalyzeOpts) => {
    const { exitCode } = await runAnalyze(skillPath, opts);
    process.exit(exitCode);
  });

program
  .command('init [skill-path]')
  .description('Scaffold the GitHub Action workflow, and optionally the first scenarios file')
  .option('--analyze', 'Also run a real coverage probe to seed tripwire-scenarios.yaml (costs ~$0.10–0.50, needs ANTHROPIC_API_KEY)')
  .option('--drift', 'Also scaffold a scheduled workflow that reruns committed scenarios weekly to catch model-drift regressions')
  .action(async (skillPath: string | undefined, opts: { analyze?: boolean; drift?: boolean }) => {
    const repoRoot = await findRepoRoot(process.cwd());
    const workflow = await scaffoldWorkflow(repoRoot);

    if (workflow.created) {
      console.log(chalk.green('✓'), `Created ${workflow.path}`);
    } else {
      console.log(chalk.dim('·'), `${workflow.path} already exists — left untouched`);
    }

    if (opts.drift) {
      const driftWorkflow = await scaffoldDriftWorkflow(repoRoot);
      if (driftWorkflow.created) {
        console.log(chalk.green('✓'), `Created ${driftWorkflow.path}`);
      } else {
        console.log(chalk.dim('·'), `${driftWorkflow.path} already exists — left untouched`);
      }
    }

    if (!skillPath) {
      console.log('');
      console.log('Pass a skill path (e.g. `tripwire init ./skills/my-skill/`) to also lint it');
      console.log('and seed its tripwire-scenarios.yaml.');
      return;
    }

    const filePath = await resolveSkillFilePath(skillPath);
    const skill = await parseSkill(filePath);
    const lintResult = lint(skill);
    console.log('');
    console.log(formatLintResult(skill.frontmatter.name ?? filePath, lintResult));

    if (opts.analyze) {
      console.log('');
      const { exitCode } = await runAnalyze(skillPath, {});
      process.exit(exitCode);
    }

    console.log('');
    console.log(chalk.bold('Next step:'), `run 'tripwire analyze ${skillPath}' (or 'tripwire init ${skillPath} --analyze')`);
    console.log('to run a real activation probe and commit the resulting tripwire-scenarios.yaml —');
    console.log('that file is the fixed behavioral contract the Action reruns in CI.');
    process.exit(lintExitCode(lintResult));
  });

program
  .command('test <skill-path>')
  .description('Run one prompt or replay a committed scenario set')
  .option('--scenarios <file>', 'Override scenarios file path')
  .option('--prompt <text>', 'Run one prompt instead of a scenarios file')
  .option('--expect <behavior>', 'Expected behavior for --prompt: activate or quiet')
  .option('--agent <name>', `Agent CLI to test against: ${AGENTS.join(', ')} (defaults to tripwire.yaml)`)
  .action(async (
    skillPath: string,
    opts: { scenarios?: string; prompt?: string; expect?: string; agent?: string },
  ) => {
    const filePath = await resolveSkillFilePath(skillPath);
    const skill = await parseSkill(filePath);
    const config = await loadConfig(dirname(filePath));
    const agent = opts.agent ?? config.agent;
    assertValidAgent(agent);
    warnIfUnverifiedAgent(agent);
    const scenariosPath = opts.scenarios ?? join(dirname(filePath), 'tripwire-scenarios.yaml');
    let inlineScenario;
    if (opts.prompt !== undefined) {
      if (opts.scenarios) {
        console.error(chalk.red('Error: --prompt and --scenarios cannot be used together'));
        process.exit(1);
      }
      try {
        inlineScenario = buildInlineScenario(opts.prompt, opts.expect);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    } else if (opts.expect !== undefined) {
      console.error(chalk.red('Error: --expect can only be used with --prompt'));
      process.exit(1);
    }

    console.log(
      inlineScenario
        ? chalk.bold('Running one behavioral scenario...')
        : chalk.bold(`Running scenarios from: ${scenariosPath}`),
    );
    const bar = new cliProgress.SingleBar({
      format: '  {bar} {value}/{total} complete',
      barCompleteChar: '█',
      barIncompleteChar: '░',
    });

    const skillName = skill.frontmatter.name ?? 'unknown';
    const probeWorkspace = await createProbeWorkspace(agent, filePath, skillName);
    let knownTotal = 0;
    bar.start(1, 0);

    let results;
    try {
      const adapter = resolveAdapter(agent, skillName, probeWorkspace.cwd);
      if (inlineScenario) {
        bar.setTotal(1);
        results = [{
          prompt: inlineScenario,
          transcript: await adapter.run(inlineScenario.prompt),
        }];
        bar.update(1);
      } else {
        results = await runScenariosFromFile(scenariosPath, adapter, (done, total) => {
          if (knownTotal === 0) { knownTotal = total; bar.setTotal(total); }
          bar.update(done);
        });
      }
    } finally {
      bar.stop();
      await probeWorkspace.cleanup();
    }

    const { ruleConfig, customRules } = await loadLintConfig(dirname(filePath));
    const lintResult = lint(skill, ruleConfig, customRules);
    const report = buildCoverageReport(skillName, lintResult, results);
    console.log(renderCoverageReport(report));
    if (inlineScenario) {
      console.log('');
      console.log(chalk.dim(
        `Keep this case in ${join(dirname(filePath), 'tripwire-scenarios.yaml')}, `
        + 'or run `tripwire analyze` to generate a broader contract.',
      ));
    }

    const exitCode = coverageExitCode(report);
    await trackBehavioralRun(
      'test',
      agent,
      report.infrastructureErrors.length > 0
        ? 'infrastructure_error'
        : exitCode === 1 ? 'behavior_failure' : 'pass',
    );
    process.exit(exitCode);
  });

program
  .command('test-all <skills-dir>')
  .description('Rerun committed scenarios for every skill in a directory — the model-drift check for a scheduled CI run')
  .option('--agent <name>', `Agent CLI to test against: ${AGENTS.join(', ')} (overrides each tripwire.yaml)`)
  .action(async (skillsDir: string, opts: { agent?: string }) => {
    if (opts.agent) assertValidAgent(opts.agent);

    const files = await discoverSkillFiles(skillsDir);
    if (files.length === 0) {
      console.log(chalk.dim(`No SKILL.md files found under ${skillsDir}`));
      return;
    }

    const checked: SkillDriftResult[] = [];
    const skipped: SkippedSkill[] = [];

    for (const filePath of files) {
      const scenariosPath = join(dirname(filePath), 'tripwire-scenarios.yaml');
      if (!existsSync(scenariosPath)) {
        skipped.push({ filePath, reason: 'no committed scenarios' });
        continue;
      }

      const skill = await parseSkill(filePath);
      const skillName = skill.frontmatter.name ?? filePath;
      const config = await loadConfig(dirname(filePath));
      const agent = opts.agent ?? config.agent;
      assertValidAgent(agent);
      warnIfUnverifiedAgent(agent);
      console.log(chalk.bold(`Testing ${skillName}...`));
      const probeWorkspace = await createProbeWorkspace(agent, filePath, skillName);
      let results;
      try {
        const adapter = resolveAdapter(agent, skillName, probeWorkspace.cwd);
        results = await runScenariosFromFile(scenariosPath, adapter, () => {});
      } finally {
        await probeWorkspace.cleanup();
      }
      const { ruleConfig, customRules } = await loadLintConfig(dirname(filePath));
      const lintResult = lint(skill, ruleConfig, customRules);
      const report = buildCoverageReport(skillName, lintResult, results);
      checked.push({
        skillName,
        filePath,
        gaps: report.gaps.length,
        falsePositives: report.falsePositives.length,
        infrastructureErrors: report.infrastructureErrors.length,
      });
    }

    const summary = summarizeDrift(checked, skipped);
    console.log('');
    console.log(renderDriftSummary(summary));

    if (process.env.GITHUB_STEP_SUMMARY) {
      await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Tripwire drift check\n\n${renderDriftSummary(summary)}\n`, { flag: 'a' });
    }

    if (checked.length > 0) {
      const hasInfrastructureError = checked.some((result) => (result.infrastructureErrors ?? 0) > 0);
      await trackBehavioralRun(
        'test-all',
        opts.agent ?? 'mixed',
        hasInfrastructureError ? 'infrastructure_error' : summary.hasDrift ? 'behavior_failure' : 'pass',
      );
    }
    process.exit(summary.hasDrift ? 1 : 0);
  });

program
  .command('eval <skill-path>')
  .description('Run outcome-quality evals: author-written assertions + an optional rubric judge — did it *work*, not just did it fire')
  .option('--evals <file>', 'Override evals file path (default: tripwire-evals.yaml next to the skill)')
  .option('--agent <name>', `Agent CLI to eval against: ${AGENTS.join(', ')} (defaults to tripwire.yaml)`)
  .option('--judge-model <model>', 'Override judge model for rubric-graded cases')
  .action(async (skillPath: string, opts: { evals?: string; agent?: string; judgeModel?: string }) => {
    const filePath = await resolveSkillFilePath(skillPath);
    const skill = await parseSkill(filePath);
    const config = await loadConfig(dirname(filePath));
    const agent = opts.agent ?? config.agent;
    assertValidAgent(agent);
    warnIfUnverifiedAgent(agent);
    const evalsPath = opts.evals ?? join(dirname(filePath), 'tripwire-evals.yaml');

    if (!existsSync(evalsPath)) {
      console.error(chalk.red(`Error: no evals file found at ${evalsPath}`));
      console.error('Author one — see the README for the tripwire-evals.yaml format (assertions + an optional rubric per case).');
      process.exit(1);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow('⚠ ANTHROPIC_API_KEY not set — rubric-graded cases will be skipped; assertion-only cases still run.'));
      console.log('');
    }

    const skillName = skill.frontmatter.name ?? filePath;
    console.log(chalk.bold(`Running evals from: ${evalsPath}`));
    const bar = new cliProgress.SingleBar({
      format: '  {bar} {value}/{total} complete',
      barCompleteChar: '█',
      barIncompleteChar: '░',
    });
    let knownTotal = 0;
    bar.start(1, 0);

    const probeWorkspace = await createProbeWorkspace(agent, filePath, skillName);
    let results;
    try {
      const adapter = resolveAdapter(agent, skillName, probeWorkspace.cwd);
      results = await runEvalsFromFile(
        evalsPath,
        adapter,
        { apiKey, judgeModel: opts.judgeModel },
        (done, total) => {
          if (knownTotal === 0) { knownTotal = total; bar.setTotal(total); }
          bar.update(done);
        },
      );
    } finally {
      bar.stop();
      await probeWorkspace.cleanup();
    }

    console.log('');
    console.log(renderEvalReport(skillName, results));
    process.exit(evalExitCode(results));
  });

// Bare `tripwire` in a repo with skills: lint them all — the 10-second first run.
// No skills found → the usual help.
program.action(async () => {
  const dir = findDefaultSkillsDir();
  if (!dir) {
    program.help();
  }
  console.log(chalk.dim(`tripwire ${pkg.version} — found ${dir}, linting every skill (more: tripwire --help)`));
  console.log('');
  await runLint(dir!, {});
});

program.parseAsync();
