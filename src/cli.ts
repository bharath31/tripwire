import { Command } from 'commander';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { dirname, join } from 'node:path';
import { parseSkill, resolveSkillFilePath, discoverSkillFiles } from './skill-parser.js';
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
import { buildCoverageReport, renderCoverageReport, exportScenarios } from './analyze/coverage-report.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import { GeminiCliAdapter } from './adapters/gemini-cli.js';
import { CodexCliAdapter } from './adapters/codex-cli.js';
import { runScenariosFromFile } from './test/scenario-runner.js';
import { summarizeDrift, renderDriftSummary } from './test/drift.js';
import type { SkillDriftResult, SkippedSkill } from './test/drift.js';
import { findRepoRoot, scaffoldWorkflow, scaffoldDriftWorkflow } from './init/scaffold.js';
import { runEvalsFromFile } from './eval/eval-runner.js';
import { renderEvalReport, evalExitCode } from './eval/reporter.js';
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

function resolveAdapter(agent: string, skillName: string): AgentAdapter {
  switch (agent as AgentName) {
    case 'claude': return new ClaudeCodeAdapter(skillName);
    case 'gemini': return new GeminiCliAdapter(skillName);
    case 'codex': return new CodexCliAdapter(skillName);
  }
}

const program = new Command();

program
  .name('tripwire')
  .description('Lint and coverage-probe Agent Skills')
  .version('0.1.0');

program
  .command('lint <skill-path>')
  .description('Static rules check on a skill file')
  .option('--fix', 'Auto-fix mechanically safe issues (currently: name-kebab-case only)')
  .action(async (skillPath: string, opts: { fix?: boolean }) => {
    const filePath = await resolveSkillFilePath(skillPath);

    if (opts.fix) {
      const raw = await readFile(filePath, 'utf-8');
      const fixResult = fixSkill(raw);
      if (fixResult.changed) {
        await writeFile(filePath, fixResult.fixed, 'utf-8');
        console.log(chalk.bold('Fixed:'));
        for (const c of fixResult.changes) console.log(`  ${chalk.green('✓')} ${c.message}`);
        console.log('');
      } else {
        console.log(chalk.dim('No auto-fixable issues found.'));
        console.log('');
      }
    }

    const skill = await parseSkill(filePath);
    const { ruleConfig, customRules } = await loadLintConfig(dirname(filePath));
    const result = lint(skill, ruleConfig, customRules);
    console.log(formatLintResult(skill.frontmatter.name ?? filePath, result));
    process.exit(lintExitCode(result));
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

function warnIfUnverifiedAgent(agent: string): void {
  if (agent === 'gemini' || agent === 'codex') {
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

  const agent = opts.agent ?? 'claude';
  assertValidAgent(agent);
  warnIfUnverifiedAgent(agent);

  const filePath = await resolveSkillFilePath(skillPath);
  const skill = await parseSkill(filePath);
  const config = await loadConfig(dirname(filePath));
  if (opts.model) config.model = opts.model;
  if (opts.judgeModel) config.judge_model = opts.judgeModel;

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

  const adapter = resolveAdapter(agent, skill.frontmatter.name ?? 'unknown');
  let probeResults = await runProbes(matrix, adapter, (done) => bar.update(done));
  bar.stop();

  const activatedCount = probeResults.filter(r => r.transcript.activated).length;
  if (activatedCount > 0) {
    console.log(chalk.bold(`\nJudging ${activatedCount} activated session(s)...`));
    probeResults = await judgeActivatedSessions(probeResults, skill, config, apiKey);
  }

  const report = buildCoverageReport(skill.frontmatter.name ?? 'unknown', lintResult, probeResults);
  console.log(renderCoverageReport(report));

  const scenariosPath = await exportScenarios(report, filePath);
  console.log(chalk.dim(`─ EXPORT ${'─'.repeat(36)}`));
  console.log(`Scenarios saved to ${scenariosPath}`);
  console.log(`Run 'tripwire test ${skillPath}' to rerun without reprobing`);

  return { exitCode: lintExitCode(lintResult), scenariosPath };
}

program
  .command('analyze <skill-path>')
  .description('LLM probe → real agent sessions → coverage map')
  .option('--model <model>', 'Override probe model')
  .option('--judge-model <model>', 'Override judge model')
  .option('--agent <name>', `Agent CLI to probe with: ${AGENTS.join(', ')}`, 'claude')
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
    console.log('that file is what the Action reruns deterministically in CI.');
    process.exit(lintExitCode(lintResult));
  });

program
  .command('test <skill-path>')
  .description('CI mode: rerun a fixed scenario set')
  .option('--scenarios <file>', 'Override scenarios file path')
  .option('--agent <name>', `Agent CLI to test against: ${AGENTS.join(', ')}`, 'claude')
  .action(async (skillPath: string, opts: { scenarios?: string; agent?: string }) => {
    const agent = opts.agent ?? 'claude';
    assertValidAgent(agent);
    warnIfUnverifiedAgent(agent);

    const filePath = await resolveSkillFilePath(skillPath);
    const skill = await parseSkill(filePath);
    const scenariosPath = opts.scenarios ?? join(dirname(filePath), 'tripwire-scenarios.yaml');

    console.log(chalk.bold(`Running scenarios from: ${scenariosPath}`));
    const bar = new cliProgress.SingleBar({
      format: '  {bar} {value}/{total} complete',
      barCompleteChar: '█',
      barIncompleteChar: '░',
    });

    const adapter = resolveAdapter(agent, skill.frontmatter.name ?? 'unknown');
    let knownTotal = 0;
    bar.start(1, 0);

    const results = await runScenariosFromFile(scenariosPath, adapter, (done, total) => {
      if (knownTotal === 0) { knownTotal = total; bar.setTotal(total); }
      bar.update(done);
    });
    bar.stop();

    const { ruleConfig, customRules } = await loadLintConfig(dirname(filePath));
    const lintResult = lint(skill, ruleConfig, customRules);
    const report = buildCoverageReport(skill.frontmatter.name ?? 'unknown', lintResult, results);
    console.log(renderCoverageReport(report));

    const failures = report.gaps.length + report.falsePositives.length;
    process.exit(failures > 0 ? 1 : 0);
  });

program
  .command('test-all <skills-dir>')
  .description('Rerun committed scenarios for every skill in a directory — the model-drift check for a scheduled CI run')
  .option('--agent <name>', `Agent CLI to test against: ${AGENTS.join(', ')}`, 'claude')
  .action(async (skillsDir: string, opts: { agent?: string }) => {
    const agent = opts.agent ?? 'claude';
    assertValidAgent(agent);
    warnIfUnverifiedAgent(agent);

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
      const adapter = resolveAdapter(agent, skillName);
      console.log(chalk.bold(`Testing ${skillName}...`));
      const results = await runScenariosFromFile(scenariosPath, adapter, () => {});
      const { ruleConfig, customRules } = await loadLintConfig(dirname(filePath));
      const lintResult = lint(skill, ruleConfig, customRules);
      const report = buildCoverageReport(skillName, lintResult, results);
      checked.push({ skillName, filePath, gaps: report.gaps.length, falsePositives: report.falsePositives.length });
    }

    const summary = summarizeDrift(checked, skipped);
    console.log('');
    console.log(renderDriftSummary(summary));

    if (process.env.GITHUB_STEP_SUMMARY) {
      await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Tripwire drift check\n\n${renderDriftSummary(summary)}\n`, { flag: 'a' });
    }

    process.exit(summary.hasDrift ? 1 : 0);
  });

program
  .command('eval <skill-path>')
  .description('Run outcome-quality evals: author-written assertions + an optional rubric judge — did it *work*, not just did it fire')
  .option('--evals <file>', 'Override evals file path (default: tripwire-evals.yaml next to the skill)')
  .option('--agent <name>', `Agent CLI to eval against: ${AGENTS.join(', ')}`, 'claude')
  .option('--judge-model <model>', 'Override judge model for rubric-graded cases')
  .action(async (skillPath: string, opts: { evals?: string; agent?: string; judgeModel?: string }) => {
    const agent = opts.agent ?? 'claude';
    assertValidAgent(agent);
    warnIfUnverifiedAgent(agent);

    const filePath = await resolveSkillFilePath(skillPath);
    const skill = await parseSkill(filePath);
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
    const adapter = resolveAdapter(agent, skillName);
    console.log(chalk.bold(`Running evals from: ${evalsPath}`));
    const bar = new cliProgress.SingleBar({
      format: '  {bar} {value}/{total} complete',
      barCompleteChar: '█',
      barIncompleteChar: '░',
    });
    let knownTotal = 0;
    bar.start(1, 0);

    const results = await runEvalsFromFile(evalsPath, adapter, { apiKey, judgeModel: opts.judgeModel }, (done, total) => {
      if (knownTotal === 0) { knownTotal = total; bar.setTotal(total); }
      bar.update(done);
    });
    bar.stop();

    console.log('');
    console.log(renderEvalReport(skillName, results));
    process.exit(evalExitCode(results));
  });

program.parseAsync();
