export type AssertionType = 'contains' | 'not_contains';

export interface Assertion {
  type: AssertionType;
  value: string;
}

export interface EvalCase {
  name: string;
  prompt: string;
  assertions?: Assertion[];
  /** Natural-language description of what "good" output looks like, graded by an LLM judge. */
  rubric?: string;
}

export interface EvalsFile {
  skillName: string;
  cases: EvalCase[];
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
}

export interface RubricResult {
  passed: boolean;
  reasoning: string;
}

export interface EvalCaseResult {
  case: EvalCase;
  rawOutput: string;
  assertionResults: AssertionResult[];
  infrastructureError?: string;
  rubricResult?: RubricResult;
  rubricSkipped?: string; // reason, e.g. "no ANTHROPIC_API_KEY"
  passed: boolean;
}
