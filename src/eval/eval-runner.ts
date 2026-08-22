import { readFile } from 'node:fs/promises';
import * as yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentAdapter } from '../types.js';
import type { EvalsFile, EvalCase, EvalCaseResult, RubricResult } from './types.js';
import { checkAssertions } from './assertions.js';
import { judgeRubric } from './rubric-judge.js';

export async function loadEvalsFile(path: string): Promise<EvalsFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error(`no evals file found at ${path} — author one (see the README for the tripwire-evals.yaml format)`);
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`invalid YAML in ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  validateEvalsFile(parsed);
  return parsed;
}

const ASSERTION_TYPES: readonly string[] = ['contains', 'not_contains'];

export function validateEvalsFile(file: unknown): asserts file is EvalsFile {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) {
    throw new Error('evals file must be a YAML object with `skillName` and `cases`');
  }
  const f = file as Partial<EvalsFile>;
  if (!Array.isArray(f.cases) || f.cases.length === 0) {
    throw new Error('evals file has no `cases` list — add at least one case with a `prompt`');
  }
  const problems: string[] = [];
  f.cases.forEach((c, i) => {
    const label = c && typeof c.name === 'string' && c.name.trim().length > 0 ? `"${c.name}"` : `case ${i + 1}`;
    if (typeof c?.prompt !== 'string' || c.prompt.trim().length === 0) {
      problems.push(`${label}: missing \`prompt\` (a non-empty string)`);
    }
    if (c?.assertions !== undefined && !Array.isArray(c.assertions)) {
      problems.push(`${label}: \`assertions\` must be a list`);
    } else if (Array.isArray(c?.assertions)) {
      c.assertions!.forEach((a, j) => {
        if (typeof a?.type !== 'string' || !ASSERTION_TYPES.includes(a.type)) {
          problems.push(`${label}: assertion ${j + 1} has \`type\` "${String(a?.type)}" — must be contains or not_contains`);
        }
        if (typeof a?.value !== 'string' || a.value.length === 0) {
          problems.push(`${label}: assertion ${j + 1} is missing \`value\` (a non-empty string to look for in the output)`);
        }
      });
    }
    if (c?.rubric !== undefined && (typeof c.rubric !== 'string' || c.rubric.trim().length === 0)) {
      problems.push(`${label}: \`rubric\` must be a non-empty string`);
    }
    // A case with neither check would trivially "pass" while measuring nothing.
    const hasAssertions = Array.isArray(c?.assertions) && c.assertions.length > 0;
    if (!hasAssertions && !c?.rubric) {
      problems.push(`${label}: has no \`assertions\` and no \`rubric\` — it can only ever pass, so add at least one check`);
    }
  });
  if (problems.length > 0) {
    throw new Error(`invalid tripwire-evals.yaml:\n  - ${problems.join('\n  - ')}`);
  }
}

export interface RunEvalsOptions {
  apiKey?: string;
  judgeModel?: string;
}

export async function runEvalCase(
  evalCase: EvalCase,
  adapter: AgentAdapter,
  opts: RunEvalsOptions = {},
): Promise<EvalCaseResult> {
  const transcript = await adapter.run(evalCase.prompt);
  if (transcript.error) {
    return {
      case: evalCase,
      rawOutput: transcript.rawOutput,
      assertionResults: [],
      infrastructureError: transcript.error,
      passed: false,
    };
  }
  const assertionResults = checkAssertions(transcript.rawOutput, evalCase.assertions ?? []);
  const assertionsPassed = assertionResults.every((r) => r.passed);

  let rubricResult: RubricResult | undefined;
  let rubricSkipped: string | undefined;

  if (evalCase.rubric) {
    if (!opts.apiKey) {
      rubricSkipped = 'no ANTHROPIC_API_KEY';
    } else {
      const client = new Anthropic({ apiKey: opts.apiKey });
      rubricResult = await judgeRubric(
        transcript.rawOutput,
        evalCase.rubric,
        client,
        opts.judgeModel ?? 'claude-haiku-4-5-20251001',
      );
    }
  }

  // A skipped or absent rubric doesn't block pass/fail on its own — only a
  // rubric that actually ran and failed does. Assertions always count.
  const rubricPassed = rubricResult ? rubricResult.passed : true;

  return {
    case: evalCase,
    rawOutput: transcript.rawOutput,
    assertionResults,
    rubricResult,
    rubricSkipped,
    passed: assertionsPassed && rubricPassed,
  };
}

export async function runEvalsFromFile(
  path: string,
  adapter: AgentAdapter,
  opts: RunEvalsOptions,
  onProgress: (done: number, total: number) => void,
): Promise<EvalCaseResult[]> {
  const file = await loadEvalsFile(path);
  const results: EvalCaseResult[] = [];
  for (let i = 0; i < file.cases.length; i++) {
    results.push(await runEvalCase(file.cases[i], adapter, opts));
    onProgress(i + 1, file.cases.length);
  }
  return results;
}
