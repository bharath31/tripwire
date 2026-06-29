import Anthropic from '@anthropic-ai/sdk';
import type { ProbeResult, ParsedSkill, Config, JudgeResult } from '../types.js';

const JUDGE_SYSTEM = `You are evaluating whether a Claude agent correctly followed a skill's instructions.
Return ONLY valid JSON: {"score":<1-10>,"violations":["..."]}
Score 10 = perfect adherence. Score 1 = ignored instructions entirely. Empty array if no violations.`;

async function scoreOne(
  result: ProbeResult,
  skill: ParsedSkill,
  client: Anthropic,
  judgeModel: string,
): Promise<JudgeResult> {
  const skillContent = `---\nname: ${skill.frontmatter.name}\ndescription: ${skill.frontmatter.description}\n---\n${skill.body}`;
  const userMessage = `Skill instructions:\n${skillContent}\n\nUser prompt: "${result.prompt.prompt}"\n\nAgent transcript:\n${result.transcript.rawOutput}\n\nScore 1–10 adherence and cite any violations.`;

  try {
    const response = await client.messages.create({
      model: judgeModel,
      max_tokens: 512,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = response.content.find(c => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as { score: number; violations: string[] };
    return { score: parsed.score, violations: parsed.violations ?? [] };
  } catch {
    return { score: 0, violations: ['Failed to parse judge response'] };
  }
}

export async function judgeActivatedSessions(
  results: ProbeResult[],
  skill: ParsedSkill,
  config: Config,
  apiKey: string,
): Promise<ProbeResult[]> {
  const client = new Anthropic({ apiKey });
  return Promise.all(
    results.map(async (r) => {
      if (!r.transcript.activated) return r;
      const judge = await scoreOne(r, skill, client, config.judge_model);
      return { ...r, judge };
    }),
  );
}
