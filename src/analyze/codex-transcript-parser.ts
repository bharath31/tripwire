import type { TranscriptResult } from '../types.js';

/**
 * Parses the output of `codex exec --json "<prompt>"`.
 *
 * UNLIKE Claude Code and Gemini CLI, Codex CLI has no dedicated skill-
 * invocation event. Per current `openai/codex` source (codex-rs/exec/src/
 * exec_events.rs, codex-rs/core-skills/src/render.rs, read July 2026), a
 * skill is only injected as system-prompt context describing where its
 * SKILL.md lives; the model then reads that file with its ordinary file/
 * shell tool, which surfaces as a generic `item.completed` event of type
 * `command_execution` — indistinguishable BY TYPE from any other file read.
 *
 * This parser therefore uses a HEURISTIC: it looks for a `command_execution`
 * item whose command references a path matching `skills/<name>/SKILL.md`
 * (any of the documented skill directories: `.codex/skills/`, `.agents/
 * skills/`, `~/.codex/skills/`, `~/.agents/skills/`). This is inherently
 * fuzzier than the other two adapters — a false negative is possible if the
 * model reads the file some other way, and this has NOT been verified
 * against a live `codex` install. Treat CodexCliAdapter results with lower
 * confidence than ClaudeCodeAdapter or GeminiCliAdapter; re-verify this
 * parser against real `codex exec --json` output before trusting it in CI.
 */
export function parseCodexTranscript(output: string, targetSkill?: string): TranscriptResult {
  const referenced = extractReferencedSkillPaths(output);

  if (referenced.length === 0) {
    return { activated: false, rawOutput: output };
  }

  if (targetSkill) {
    const matched = referenced.find((s) => skillMatches(s, targetSkill));
    if (matched) {
      return { activated: true, skillName: matched, rawOutput: output };
    }
    return { activated: false, skillName: referenced[0], rawOutput: output };
  }

  return { activated: true, skillName: referenced[0], rawOutput: output };
}

const SKILL_PATH_RE = /(?:^|\/)skills\/([a-z0-9-]+)\/SKILL\.md\b/i;

function extractReferencedSkillPaths(output: string): string[] {
  const found: string[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!event || typeof event !== 'object') continue;
    const e = event as { type?: unknown; item?: { type?: unknown; command?: unknown } };
    if (e.type !== 'item.completed' && e.type !== 'item.updated') continue;

    const item = e.item;
    if (!item || item.type !== 'command_execution' || typeof item.command !== 'string') continue;

    const match = item.command.match(SKILL_PATH_RE);
    if (match) found.push(match[1]);
  }
  return found;
}

function skillMatches(fired: string, target: string): boolean {
  if (fired === target) return true;
  const bare = (s: string) => (s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s);
  return bare(fired) === bare(target);
}
