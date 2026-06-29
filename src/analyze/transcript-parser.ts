import type { TranscriptResult } from '../types.js';

/**
 * Parses the output of `claude -p "<prompt>" --output-format stream-json --verbose`.
 *
 * Skill activation is NOT visible in plain-text print mode — it surfaces only
 * in the structured stream as an assistant `tool_use` block whose `name` is
 * "Skill" and whose `input.skill` is the fully-qualified skill id, e.g.
 * "superpowers:brainstorming". (Verified against a live `claude -p` spike.)
 *
 * When `targetSkill` is supplied, activation is reported only if a fired skill
 * matches it — a probe that triggers a *different* skill must not count as a
 * hit (or, for negative prompts, as a false positive) for the skill under test.
 */
export function parseTranscript(output: string, targetSkill?: string): TranscriptResult {
  const firedSkills = extractFiredSkills(output);

  if (firedSkills.length === 0) {
    return { activated: false, rawOutput: output };
  }

  if (targetSkill) {
    const matched = firedSkills.find((s) => skillMatches(s, targetSkill));
    if (matched) {
      return { activated: true, skillName: matched, rawOutput: output };
    }
    // A skill fired, but not the one under test → not an activation for us.
    return { activated: false, skillName: firedSkills[0], rawOutput: output };
  }

  return { activated: true, skillName: firedSkills[0], rawOutput: output };
}

function extractFiredSkills(output: string): string[] {
  const fired: string[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue; // non-JSON line (interleaved logging) — skip
    }

    const content = (event as { message?: { content?: unknown } })?.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'tool_use' &&
        (block as { name?: unknown }).name === 'Skill'
      ) {
        const skill = (block as { input?: { skill?: unknown } }).input?.skill;
        if (typeof skill === 'string' && skill.length > 0) {
          fired.push(skill);
        }
      }
    }
  }
  return fired;
}

/**
 * Matches a fired skill id against a target. Both may be bare ("brainstorming")
 * or plugin-qualified ("superpowers:brainstorming"); the bare names must match.
 */
function skillMatches(fired: string, target: string): boolean {
  if (fired === target) return true;
  const bare = (s: string) => (s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s);
  return bare(fired) === bare(target);
}
