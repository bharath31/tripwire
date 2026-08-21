import type { ProbePrompt } from '../types.js';

export type InlineExpectation = 'activate' | 'quiet';

export function buildInlineScenario(prompt: string, expectation: string | undefined): ProbePrompt {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) throw new Error('--prompt must not be empty');
  if (expectation !== 'activate' && expectation !== 'quiet') {
    throw new Error('--expect must be either "activate" or "quiet" when --prompt is used');
  }

  const expectedActivation = expectation === 'activate';
  return {
    prompt: normalizedPrompt,
    zone: expectedActivation ? 'core' : 'negative',
    expectedActivation,
  };
}
