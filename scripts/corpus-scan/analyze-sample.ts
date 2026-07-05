#!/usr/bin/env node
// Runs the REAL, PAID activation probe (tripwire analyze) across a bounded
// subset of the fetched corpus — this spends real ANTHROPIC_API_KEY money.
//
// Deliberately separate from lint-corpus.ts and requires --confirm-spend so
// it can never run by accident. Defaults to a small, cost-bounded sample.
//
// Cost model: ~$0.10-0.50 per skill (per README). A sample of 50 skills is
// therefore roughly $5-25 — estimate printed before any spend happens.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSkill } from '../../src/skill-parser.js';
import { lint } from '../../src/lint/rules.js';
import { loadConfig } from '../../src/config.js';
import { generateProbeMatrix } from '../../src/analyze/probe-generator.js';
import { runProbes } from '../../src/analyze/agent-runner.js';
import { buildCoverageReport } from '../../src/analyze/coverage-report.js';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.js';

const COST_LOW = 0.10;
const COST_HIGH = 0.50;

function parseArgs(argv: string[]): { dir: string; sampleSize: number; confirmSpend: boolean } {
  const dirFlag = argv.find((a) => a.startsWith('--dir='));
  const sampleFlag = argv.find((a) => a.startsWith('--sample-size='));
  return {
    dir: dirFlag ? dirFlag.split('=')[1] : join(process.cwd(), 'scripts', 'corpus-scan', 'corpus'),
    sampleSize: sampleFlag ? Number.parseInt(sampleFlag.split('=')[1], 10) : 20,
    confirmSpend: argv.includes('--confirm-spend'),
  };
}

async function main(): Promise<void> {
  const { dir, sampleSize, confirmSpend } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const low = (sampleSize * COST_LOW).toFixed(2);
  const high = (sampleSize * COST_HIGH).toFixed(2);
  console.log(`This will run a real activation probe against ${sampleSize} skill(s).`);
  console.log(`Estimated cost: $${low}-$${high} on ANTHROPIC_API_KEY.`);

  if (!apiKey) {
    console.error('\nError: ANTHROPIC_API_KEY not set. Aborting — no spend occurred.');
    process.exit(1);
  }
  if (!confirmSpend) {
    console.error('\nRefusing to run without --confirm-spend. No spend occurred.');
    console.error(`Rerun as: npx tsx scripts/corpus-scan/analyze-sample.ts --sample-size=${sampleSize} --confirm-spend`);
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(join(dir, '_manifest.json'), 'utf-8')) as Array<{ file: string; repo: string }>;
  const sample = manifest.slice(0, sampleSize);
  console.log(`\nProbing ${sample.length} skill(s) from ${dir}...\n`);

  const results: Array<{ repo: string; file: string; coreActivation: number; falsePositiveRate: number }> = [];

  for (const m of sample) {
    const filePath = join(dir, m.file);
    const skill = await parseSkill(filePath);
    const config = await loadConfig(dir);
    const lintResult = lint(skill);

    const matrix = await generateProbeMatrix(skill, config, apiKey);
    const adapter = new ClaudeCodeAdapter(skill.frontmatter.name ?? m.repo);
    const probeResults = await runProbes(matrix, adapter, () => {});
    const report = buildCoverageReport(skill.frontmatter.name ?? m.repo, lintResult, probeResults);

    const coreTotal = report.zones.core.total || 1;
    const negTotal = report.zones.negative.total || 1;
    results.push({
      repo: m.repo,
      file: m.file,
      coreActivation: report.zones.core.activated / coreTotal,
      falsePositiveRate: report.zones.negative.activated / negTotal,
    });
    console.log(`  ${m.repo}: core ${report.zones.core.activated}/${report.zones.core.total}, false-positives ${report.zones.negative.activated}/${report.zones.negative.total}`);
  }

  const avgCore = results.reduce((s, r) => s + r.coreActivation, 0) / results.length;
  const avgFP = results.reduce((s, r) => s + r.falsePositiveRate, 0) / results.length;
  console.log(`\nAverage core-trigger activation: ${Math.round(avgCore * 100)}%`);
  console.log(`Average false-positive rate: ${Math.round(avgFP * 100)}%`);
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
