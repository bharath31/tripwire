import Anthropic from '@anthropic-ai/sdk';
import type { ParsedSkill, Config, ProbeMatrix, ProbePrompt } from '../types.js';

const SYSTEM_PROMPT = `You are a skill testing expert for Claude Code.
Generate a prompt matrix to test whether a skill activates correctly.
Return ONLY valid JSON with no markdown, in this exact structure:
{ "core": [...], "adjacent": [...], "negative": [...], "variants": [...] }
Each value is an array of strings — prompts a user would actually type.`;

export async function generateProbeMatrix(
  skill: ParsedSkill,
  config: Config,
  apiKey: string,
): Promise<ProbeMatrix> {
  const client = new Anthropic({ apiKey });

  const userMessage = `Skill to test:
---
name: ${skill.frontmatter.name}
description: ${skill.frontmatter.description}
---

${skill.body}

Generate:
- core: ${config.probe_count.core} prompts that clearly match this skill's stated intent
- adjacent: ${config.probe_count.adjacent} prompts in the related domain but different intent (surfaces activation gaps)
- negative: ${config.probe_count.negative} prompts that must NOT activate this skill
- variants: ${config.probe_count.variants} synonym/paraphrase prompts for core triggers (exposes keyword gaps)

Return exactly the JSON structure specified in the system prompt.`;

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content.find(c => c.type === 'text')?.text ?? '{}';

  // The model may wrap JSON in markdown fences or add prose — strip fences and
  // fail with a clear message rather than an opaque SyntaxError mid-run.
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed: { core?: unknown; adjacent?: unknown; negative?: unknown; variants?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Probe generator: model did not return valid JSON. Received: ${text.slice(0, 200)}`,
    );
  }

  const zone = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

  const prompts: ProbePrompt[] = [
    ...zone(parsed.core).slice(0, config.probe_count.core).map(p => ({ zone: 'core' as const, prompt: p })),
    ...zone(parsed.adjacent).slice(0, config.probe_count.adjacent).map(p => ({ zone: 'adjacent' as const, prompt: p })),
    ...zone(parsed.negative).slice(0, config.probe_count.negative).map(p => ({ zone: 'negative' as const, prompt: p })),
    ...zone(parsed.variants).slice(0, config.probe_count.variants).map(p => ({ zone: 'variants' as const, prompt: p })),
  ];

  return { skillName: skill.frontmatter.name ?? 'unknown', prompts };
}
