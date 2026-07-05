import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentAdapter } from '../types.js';
import type { EvalsFile, EvalCase, EvalCaseResult, RubricResult } from './types.js';
import { checkAssertions } from './assertions.js';
import { judgeRubric } from './rubric-judge.js';

export async function loadEvalsFile(path: string): Promise<EvalsFile> {
  const raw = await readFile(path, 'utf-8');
  return yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA }) as EvalsFile;
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
