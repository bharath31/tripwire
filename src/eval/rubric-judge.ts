import Anthropic from '@anthropic-ai/sdk';
import type { RubricResult } from './types.js';

const RUBRIC_JUDGE_SYSTEM = `You are grading whether an agent's response meets a specific rubric.
Return ONLY valid JSON: {"passed":<true|false>,"reasoning":"..."}
Be strict: "passed" is true only if the response clearly satisfies the rubric.`;

export async function judgeRubric(
  output: string,
  rubric: string,
  client: Anthropic,
  model: string,
): Promise<RubricResult> {
  const userMessage = `Rubric: ${rubric}\n\nAgent response transcript:\n${output}\n\nDoes this response satisfy the rubric?`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: RUBRIC_JUDGE_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = response.content.find((c) => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as { passed: boolean; reasoning: string };
    return { passed: Boolean(parsed.passed), reasoning: parsed.reasoning ?? '' };
  } catch {
    return { passed: false, reasoning: 'Failed to parse judge response' };
  }
}
