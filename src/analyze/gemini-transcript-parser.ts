import type { TranscriptResult } from '../types.js';

/**
 * Parses the output of `gemini -p "<prompt>" --output-format stream-json`.
 *
 * Unlike Claude Code, Gemini CLI has a dedicated, unambiguous skill-invocation
 * tool: a `tool_use` event with `tool_name: "activate_skill"` and
 * `parameters.name` set to the skill's name. (Confirmed against
 * google-gemini/gemini-cli source: packages/core/src/tools/activate-skill.ts
 * and the stream-json event shape added in PR #10883 — not yet verified
 * against a live local install, unlike the Claude Code adapter.)
 */
export function parseGeminiTranscript(output: string, targetSkill?: string): TranscriptResult {
  const firedSkills = extractActivatedSkills(output);

  if (firedSkills.length === 0) {
    return { activated: false, rawOutput: output };
  }

  if (targetSkill) {
    const matched = firedSkills.find((s) => skillMatches(s, targetSkill));
    if (matched) {
      return { activated: true, skillName: matched, rawOutput: output };
    }
    return { activated: false, skillName: firedSkills[0], rawOutput: output };
  }

  return { activated: true, skillName: firedSkills[0], rawOutput: output };
}

function extractActivatedSkills(output: string): string[] {
  const fired: string[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue; // non-JSON line — skip
    }

    if (!event || typeof event !== 'object') continue;
    const e = event as { type?: unknown; tool_name?: unknown; parameters?: { name?: unknown } };
    if (e.type === 'tool_use' && e.tool_name === 'activate_skill' && typeof e.parameters?.name === 'string') {
      fired.push(e.parameters.name);
    }
  }
  return fired;
}

function skillMatches(fired: string, target: string): boolean {
  if (fired === target) return true;
  const bare = (s: string) => (s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s);
  return bare(fired) === bare(target);
}
