import { Command } from 'commander';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { dirname, join } from 'node:path';
import { parseSkill, resolveSkillFilePath } from './skill-parser.js';
import { lint } from './lint/rules.js';
import { formatLintResult, lintExitCode } from './lint/reporter.js';
import { loadConfig } from './config.js';
import { generateProbeMatrix } from './analyze/probe-generator.js';
import { runProbes } from './analyze/agent-runner.js';
import { judgeActivatedSessions } from './analyze/judge.js';
import { buildCoverageReport, renderCoverageReport, exportScenarios } from './analyze/coverage-report.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import { runScenariosFromFile } from './test/scenario-runner.js';

const program = new Command();

program
  .name('tripwire')
  .description('Lint and coverage-probe Agent Skills')
  .version('0.1.0');

program
  .command('lint <skill-path>')
  .description('Static rules check on a skill file')
  .action(async (skillPath: string) => {
    const filePath = await resolveSkillFilePath(skillPath);
    const skill = await parseSkill(filePath);
    const result = lint(skill);
    console.log(formatLintResult(skill.frontmatter.name ?? filePath, result));
    process.exit(lintExitCode(result));
  });

program
  .command('analyze <skill-path>')
  .description('LLM probe → real agent sessions → coverage map')
  .option('--model <model>', 'Override probe model')
  .option('--judge-model <model>', 'Override judge model')
  .action(async (skillPath: string, opts: { model?: string; judgeModel?: string }) => {
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

    const lintResult = lint(skill);
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

    const adapter = new ClaudeCodeAdapter(skill.frontmatter.name ?? 'unknown');
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

    process.exit(lintExitCode(lintResult));
  });

program
  .command('test <skill-path>')
  .description('CI mode: rerun a fixed scenario set')
  .option('--scenarios <file>', 'Override scenarios file path')
  .action(async (skillPath: string, opts: { scenarios?: string }) => {
    const filePath = await resolveSkillFilePath(skillPath);
    const skill = await parseSkill(filePath);
    const scenariosPath = opts.scenarios ?? join(dirname(filePath), 'tripwire-scenarios.yaml');

    console.log(chalk.bold(`Running scenarios from: ${scenariosPath}`));
    const bar = new cliProgress.SingleBar({
      format: '  {bar} {value}/{total} complete',
      barCompleteChar: '█',
      barIncompleteChar: '░',
    });

    const adapter = new ClaudeCodeAdapter(skill.frontmatter.name ?? 'unknown');
    let knownTotal = 0;
    bar.start(1, 0);

    const results = await runScenariosFromFile(scenariosPath, adapter, (done, total) => {
      if (knownTotal === 0) { knownTotal = total; bar.setTotal(total); }
      bar.update(done);
    });
    bar.stop();

    const lintResult = lint(skill);
    const report = buildCoverageReport(skill.frontmatter.name ?? 'unknown', lintResult, results);
    console.log(renderCoverageReport(report));

    const failures = report.gaps.length + report.falsePositives.length;
    process.exit(failures > 0 ? 1 : 0);
  });

program.parseAsync();
